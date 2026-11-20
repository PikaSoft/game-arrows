import { fmt } from '../../shared/format';
import { codesLogo, extraIcons, icons, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildCodesLevel } from './core/levels';
import { CodesLevel } from './core/types';
import { Session } from './game/session';
import { CodesProgress, loadCodes, recordCodesClear, resetCodes } from './game/storage';
import { feedbackSvg, PEG_NAMES, pegSvg } from './render/pegs';

export function createCodes(shell: Shell): GameModule {
  const progress: CodesProgress = loadCodes();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<CodesLevel>(
    buildCodesLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'cb-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="cb-home">
    <div class="logo">${codesLogo}</div>
    <h1>Code Breaker</h1>
    <p>Guess the hidden row of colours. Each answer tells you how close you are.</p>
    <button class="btn" id="cb-play"></button>
    <button class="btn secondary" id="cb-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="cb-settings-home">Settings</button>
    <button class="btn secondary" id="cb-hub">All puzzles</button>
    <div class="total" id="cb-total"></div>
  </section>

  <section class="screen" id="cb-levels">
    <div class="levels-head">
      <button class="icon-btn" id="cb-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Code Breaker</h2>
    </div>
    <div class="level-grid" id="cb-grid"></div>
  </section>

  <section class="screen" id="cb-game">
    <header class="topbar">
      <button class="icon-btn" id="cb-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="cb-title"></b><span id="cb-diff"></span></div>
      <button class="icon-btn" id="cb-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="cb-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="cb-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="cb-erase" aria-label="Clear last peg">${extraIcons.undo}</button>
      <div class="stats" id="cb-stats"></div>
      <div class="timer" id="cb-timer">0:00</div>
      <button class="icon-btn" id="cb-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="cb-hint-count"></span></button>
    </div>
    <p class="tip" id="cb-tip"></p>
    <div class="stage cb-stage" id="cb-stage">
      <div class="cb-board" id="cb-board" role="list"></div>
      <div class="loading" id="cb-loading" hidden>Hiding the code…</div>
    </div>
    <div class="cb-controls">
      <div class="cb-palette" id="cb-palette"></div>
      <button class="btn cb-check" id="cb-check">Check</button>
    </div>
  </section>`;

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`cb-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#cb-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#cb-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#cb-grid');
    const tiles: string[] = [];
    for (let n = 1; n <= progress.unlocked + 1; n++) {
      if (n > progress.unlocked) {
        tiles.push(`<button class="tile locked" disabled aria-label="Level ${n}, locked">${icons.lock}</button>`);
        break;
      }
      const rec = progress.levels[n];
      const stars = rec ? [0, 1, 2].map((i) => starIcon(i < rec.stars)).join('') : '';
      const cls = n === progress.current ? 'tile current' : 'tile';
      tiles.push(`<button class="${cls}" data-level="${n}" aria-label="Level ${n}"><b>${n}</b><span class="stars">${stars}</span></button>`);
    }
    grid.innerHTML = tiles.join('');
    grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
  }

  $('#cb-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#cb-play').addEventListener('click', () => startLevel(progress.current));
  $('#cb-open-levels').addEventListener('click', () => show('levels'));
  $('#cb-levels-back').addEventListener('click', () => show('home'));
  $('#cb-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#cb-settings-home').addEventListener('click', shell.openSettings);
  $('#cb-settings').addEventListener('click', shell.openSettings);
  $('#cb-hub').addEventListener('click', shell.goHub);
  $('#cb-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let session: Session | null = null;
  let loadToken = 0;
  let lastTick = performance.now();
  let winShown = false;
  /** Colours the player has greyed out on the palette as not in the code. */
  const ruledOut = new Set<number>();

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    session = null;
    $('#cb-title').textContent = `Level ${n}`;
    $('#cb-diff').textContent = '';
    $('#cb-tip').textContent = '';
    $('#cb-stats').textContent = '';
    $('#cb-board').innerHTML = '';
    $('#cb-palette').innerHTML = '';
    $('#cb-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#cb-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  const sizeName = (l: CodesLevel) => `${l.slots} pegs, ${l.colours} colours${l.repeats ? ', repeats allowed' : ', no repeats'}`;

  function beginSession(level: CodesLevel) {
    session = new Session(level);
    const diffEl = $('#cb-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = `${sizeName(level)}: ${level.score} bits. The solver averages ${level.expected} guesses.`;
    winShown = false;
    lastTick = performance.now();
    $('#cb-tip').textContent = level.tip ?? '';
    ruledOut.clear();
    renderPalette();
    $('#cb-palette').style.setProperty('--cols', String(Math.ceil(level.colours / (level.colours > 6 ? 2 : 1))));
    render();
  }

  function renderPalette() {
    if (!session) return;
    $('#cb-palette').innerHTML = Array.from({ length: session.level.colours }, (_, c) => {
      const out = ruledOut.has(c);
      return `<button class="cb-peg-btn${out ? ' out' : ''}" data-colour="${c}" aria-label="${PEG_NAMES[c]} (key ${c + 1})${
        out ? ', ruled out' : ''
      }">${pegSvg(c)}</button>`;
    }).join('');
  }

  /**
   * Rows for every guess made, the row being filled in, and empty rows up to par.
   * The board fills from the bottom up: the first guess sits at the bottom.
   */
  function render() {
    const s = session;
    if (!s) return;
    const slots = s.slots;
    const rows: string[] = [];
    s.guesses.forEach((g, i) => {
      const exactWord = `${g.feedback.exact} right place, ${g.feedback.near} wrong place`;
      rows.push(
        `<div class="cb-row done" role="listitem" aria-label="Guess ${i + 1}: ${g.pegs.map((c) => PEG_NAMES[c]).join(', ')}. ${exactWord}">
          <span class="cb-num">${i + 1}</span>
          <span class="cb-pegs">${g.pegs.map((c) => `<span class="cb-slot">${pegSvg(c)}</span>`).join('')}</span>
          <span class="cb-fb">${feedbackSvg(g.feedback.exact, g.feedback.near, slots)}</span>
        </div>`,
      );
    });
    if (!s.won) {
      rows.push(
        `<div class="cb-row current" role="listitem" aria-label="Guess ${s.guesses.length + 1}, being filled in">
          <span class="cb-num">${s.guesses.length + 1}</span>
          <span class="cb-pegs">${s.row
            .map(
              (c, i) =>
                `<button class="cb-slot${i === s.cursor ? ' sel' : ''}${s.locked[i] ? ' locked' : ''}" data-slot="${i}" aria-label="Slot ${i + 1}${
                  c === null ? ', empty' : `, ${PEG_NAMES[c]}`
                }${s.locked[i] ? ', locked' : ''}">${c === null ? '' : pegSvg(c)}${s.locked[i] ? `<span class="cb-lock">${icons.lock}</span>` : ''}</button>`,
            )
            .join('')}</span>
          <span class="cb-fb"></span>
        </div>`,
      );
    }
    for (let i = rows.length; i < s.level.par; i++) {
      rows.push(
        `<div class="cb-row future" aria-hidden="true"><span class="cb-num">${i + 1}</span><span class="cb-pegs">${'<span class="cb-slot"></span>'.repeat(slots)}</span><span class="cb-fb"></span></div>`,
      );
    }
    if (s.won) {
      rows.push(
        `<div class="cb-row answer" role="listitem" aria-label="The code"><span class="cb-num">${icons.lock}</span><span class="cb-pegs">${s.level.code
          .map((c) => `<span class="cb-slot">${pegSvg(c)}</span>`)
          .join('')}</span><span class="cb-fb"></span></div>`,
      );
    }
    const board = $('#cb-board');
    board.style.setProperty('--slots', String(slots));
    board.innerHTML = rows.reverse().join('');
    board.querySelector('.current, .answer')?.scrollIntoView({ block: 'nearest' });
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    const n = s.guesses.length;
    $('#cb-stats').innerHTML = `Guesses <b>${n}</b> · Par <b>${s.level.par}</b>`;
    $<HTMLButtonElement>('#cb-erase').disabled = s.won || s.rowEmpty;
    $<HTMLButtonElement>('#cb-check').disabled = s.won || !s.rowFull;
    $('#cb-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#cb-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#cb-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Input ----------
  function place(colour: number) {
    const s = session;
    if (!s || modalOpen() || !s.place(colour)) return;
    sfx.unlock();
    sfx.blip();
    shell.vibrate(6);
    render();
  }

  function erase() {
    const s = session;
    if (!s || modalOpen() || !s.backspace()) return;
    render();
  }

  function check() {
    const s = session;
    if (!s || modalOpen()) return;
    if (!s.rowFull) {
      if (!s.won) shell.toast('Fill every slot first');
      return;
    }
    const g = s.submit();
    if (!g) return;
    if (s.won) {
      sfx.chime();
      shell.vibrate([20, 60, 20]);
      render();
      setTimeout(showWin, 450);
      return;
    }
    if (g.feedback.exact + g.feedback.near === 0) sfx.thud();
    else sfx.ding();
    shell.vibrate(12);
    render();
  }

  /**
   * Long press on anything matching `selector` inside `el` calls `onLong`. Returns a function the
   * click handler calls first: it is true (once) when the click ends a long press and should be ignored.
   */
  const LONG_PRESS_MS = 450;
  function longPress(el: HTMLElement, selector: string, onLong: (target: HTMLElement) => void): () => boolean {
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    let suppress = false;
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    el.addEventListener('pointerdown', (e) => {
      suppress = false;
      cancel();
      const t = (e.target as HTMLElement).closest<HTMLElement>(selector);
      if (!t || !session || modalOpen()) return;
      start = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        start = null;
        suppress = true;
        onLong(t);
      }, LONG_PRESS_MS);
    });
    el.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, cancel);
    el.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest(selector)) e.preventDefault();
    });
    return () => {
      const s = suppress;
      suppress = false;
      return s;
    };
  }

  // A long press on a palette colour greys it out as ruled out (or brings it back). It is only a
  // note for the player: a ruled-out colour can still be placed.
  function toggleRuledOut(colour: number) {
    if (!session || modalOpen()) return;
    const out = !ruledOut.has(colour);
    if (out) ruledOut.add(colour);
    else ruledOut.delete(colour);
    sfx.unlock();
    sfx.blip();
    shell.vibrate(out ? [10, 40, 10] : 10);
    renderPalette();
  }
  const palette = $('#cb-palette');
  const paletteLongPressed = longPress(palette, '[data-colour]', (b) => toggleRuledOut(Number(b.dataset.colour)));
  palette.addEventListener('click', (e) => {
    if (paletteLongPressed()) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-colour]');
    if (b) place(Number(b.dataset.colour));
  });

  // A long press on a filled slot locks it in (or unlocks it); locked colours fill the next guess.
  function toggleLock(i: number) {
    const s = session;
    if (!s || modalOpen() || !s.toggleLock(i)) return;
    sfx.unlock();
    sfx.blip();
    shell.vibrate(s.locked[i] ? [10, 40, 10] : 10);
    render();
  }
  const board = $('#cb-board');
  const boardLongPressed = longPress(board, '[data-slot]', (b) => toggleLock(Number(b.dataset.slot)));
  board.addEventListener('click', (e) => {
    if (boardLongPressed()) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    const s = session;
    if (!b || !s || modalOpen()) return;
    const i = Number(b.dataset.slot);
    if (s.locked[i]) {
      shell.toast('Locked in. Long press to unlock');
      return;
    }
    s.select(i);
    render();
  });
  $('#cb-erase').addEventListener('click', erase);
  $('#cb-check').addEventListener('click', check);

  $('#cb-hint').addEventListener('click', () => {
    const s = session;
    if (!s || s.hint() === null) return;
    sfx.ding();
    shell.vibrate(15);
    render();
  });

  document.addEventListener('keydown', (e) => {
    const s = session;
    if (!s || modalOpen() || !$('#cb-game').classList.contains('active') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-8]$/.test(e.key)) {
      place(Number(e.key) - 1);
      e.preventDefault();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      erase();
      e.preventDefault();
    } else if (e.shiftKey && /^Digit[1-8]$/.test(e.code) && Number(e.code.slice(5)) <= s.level.colours) {
      toggleRuledOut(Number(e.code.slice(5)) - 1);
      e.preventDefault();
    } else if (e.key === 'l' || e.key === 'L') {
      toggleLock(s.cursor);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      check();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      s.cursor = (s.cursor + (e.key === 'ArrowLeft' ? s.slots - 1 : 1)) % s.slots;
      render();
      e.preventDefault();
    }
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#cb-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const n = s.guesses.length;
    const { newBestMoves, prev } = recordCodesClear(progress, s.level.number, stars, n, s.elapsedMs);
    const note =
      stars < 3 ? `<p>${s.hintsUsed ? 'Each hint costs a star. ' : ''}Crack it in ${s.level.par} guesses or fewer for three stars.</p>` : '';
    openModal(
      `<h2>Level ${s.level.number}: cracked</h2>
       <div class="cb-reveal">${s.level.code.map((c) => pegSvg(c)).join('')}</div>
       <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
       <div class="result-line">${n} ${n === 1 ? 'guess' : 'guesses'} (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
         newBestMoves ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${prev!.bestMoves} guesses`
       }</div>
       ${note}
       <div class="actions">
         <button class="btn" data-action="next">Next level</button>
         <div class="row">
           <button class="btn small secondary" data-action="replay">Replay</button>
           <button class="btn small secondary" data-action="levels">Levels</button>
         </div>
       </div>`,
      (action) => {
        if (action === 'next') startLevel(s.level.number + 1);
        else if (action === 'replay') startLevel(s.level.number);
        else if (action === 'levels') {
          closeModal();
          show('levels');
        }
      },
      false,
    );
  }

  setInterval(() => {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    const s = session;
    if (!s) return;
    if (s.timerRunning && !modalOpen() && document.visibilityState === 'visible') {
      s.elapsedMs += Math.min(dt, 1000);
      updateTimer();
    }
  }, 200);

  // Hook for automated browser tests.
  (window as unknown as { __codes: unknown }).__codes = {
    get session() {
      return session;
    },
    progress,
  };

  return {
    id: 'codes',
    name: 'Code Breaker',
    tagline: 'Guess the hidden colours; each answer says how close you are.',
    icon: codesLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      session = null;
    },
    resetProgress: () => resetCodes(progress),
    modalLocked: () => winShown,
  };
}
