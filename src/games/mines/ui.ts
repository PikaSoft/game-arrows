import { fmt } from '../../shared/format';
import { heartIcon, icons, minesLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildMinesLevel } from './core/levels';
import { MinesLevel } from './core/types';
import { RevealResult, Session, START_HEARTS } from './game/session';
import { loadMines, MinesProgress, recordMinesClear, resetMines } from './game/storage';
import { MinesRenderer } from './render/renderer';

type Mode = 'reveal' | 'flag';

export function createMines(shell: Shell): GameModule {
  const progress: MinesProgress = loadMines();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<MinesLevel>(
    buildMinesLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'hm-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="hm-home">
    <div class="logo">${minesLogo}</div>
    <h1>Hidden Mines</h1>
    <p>Uncover every safe square. Each number says how many mines touch it. Every board can be solved without guessing.</p>
    <button class="btn" id="hm-play"></button>
    <button class="btn secondary" id="hm-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="hm-settings-home">Settings</button>
    <button class="btn secondary" id="hm-hub">All puzzles</button>
    <div class="total" id="hm-total"></div>
  </section>

  <section class="screen" id="hm-levels">
    <div class="levels-head">
      <button class="icon-btn" id="hm-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Hidden Mines</h2>
    </div>
    <div class="level-grid" id="hm-grid"></div>
  </section>

  <section class="screen" id="hm-game">
    <header class="topbar">
      <button class="icon-btn" id="hm-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="hm-title"></b><span id="hm-diff"></span></div>
      <button class="icon-btn" id="hm-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="hm-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="hm-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="hm-hearts" aria-label="Hearts"></div>
      <div class="stats" id="hm-stats"></div>
      <div class="timer" id="hm-timer">0:00</div>
      <button class="icon-btn" id="hm-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="hm-hint-count"></span></button>
    </div>
    <p class="tip" id="hm-tip"></p>
    <div class="stage" id="hm-stage">
      <canvas id="hm-board"></canvas>
      <div class="loading" id="hm-loading" hidden>Building the board…</div>
    </div>
    <div class="mode-bar"><div class="seg" id="hm-mode" role="group" aria-label="What a tap does">
      <button data-mode="reveal" aria-pressed="true">Reveal</button><button data-mode="flag" aria-pressed="false">Flag</button>
    </div></div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#hm-board');
  const renderer = new MinesRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`hm-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#hm-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#hm-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#hm-grid');
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

  $('#hm-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#hm-play').addEventListener('click', () => startLevel(progress.current));
  $('#hm-open-levels').addEventListener('click', () => show('levels'));
  $('#hm-levels-back').addEventListener('click', () => show('home'));
  $('#hm-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#hm-settings-home').addEventListener('click', shell.openSettings);
  $('#hm-settings').addEventListener('click', shell.openSettings);
  $('#hm-hub').addEventListener('click', shell.goHub);
  $('#hm-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let session: Session | null = null;
  let loadToken = 0;
  let lastTick = performance.now();
  let winShown = false;

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    session = null;
    endPress();
    renderer.setView(null);
    $('#hm-title').textContent = `Level ${n}`;
    $('#hm-diff').textContent = '';
    $('#hm-tip').textContent = '';
    $('#hm-stats').textContent = '';
    $('#hm-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#hm-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: MinesLevel) {
    session = new Session(level);
    endPress();
    setMode('reveal');
    const diffEl = $('#hm-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.hardest ? `Hardest reasoning needed: ${level.hardest.toLowerCase()}` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    renderer.reveal([...session.open.keys()].filter((i) => session!.open[i]));
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#hm-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud(lostHeart = false) {
    const s = session;
    if (!s) return;
    const hearts = $('#hm-hearts');
    hearts.innerHTML = Array.from({ length: START_HEARTS }, (_, i) => heartIcon(!s.continued && i < s.hearts)).join('');
    if (lostHeart) hearts.children[s.hearts]?.classList.add('lost');
    $('#hm-stats').innerHTML = `Mines <b>${Math.max(0, s.minesLeft)}</b>`;
    $('#hm-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#hm-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#hm-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Mode ----------
  let mode: Mode = 'reveal';
  function setMode(m: Mode) {
    mode = m;
    for (const b of $('#hm-mode').querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  }
  $('#hm-mode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (b) setMode(b.dataset.mode as Mode);
  });

  // ---------- Input ----------
  // Tap a covered square to reveal it (or flag it, in Flag mode). Hold it for a moment to
  // do the other one. Tap an uncovered number whose mines are all flagged to uncover the
  // rest of the squares around it. A press that slides off its square does nothing.
  const LONG_PRESS_MS = 400;
  let press: { pointer: number; cell: number; timer: number; held: boolean } | null = null;

  function endPress() {
    if (press) clearTimeout(press.timer);
    press = null;
    renderer.pressed = null;
  }

  const cellUnder = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
  };

  function act(i: number, m: Mode) {
    const s = session;
    if (!s) return;
    if (!s.covered(i)) {
      // An uncovered number: open the rest around it if its flags add up.
      after(s.chord(i));
      return;
    }
    if (m === 'flag') {
      if (s.toggleFlag(i)) {
        sfx.blip();
        shell.vibrate(15);
        updateHud();
        renderer.invalidate();
      }
      return;
    }
    after(s.reveal(i));
  }

  function after(r: RevealResult | null) {
    const s = session;
    if (!s || !r) return;
    if (r.opened.length) renderer.reveal(r.opened);
    if (r.hit !== null) {
      renderer.explode(r.hit);
      sfx.thud();
      shell.vibrate([30, 50, 30]);
    } else {
      sfx.blip();
      shell.vibrate(6);
    }
    updateHud(r.hit !== null && !s.continued);
    renderer.invalidate();
    if (r.outOfHearts) setTimeout(showOutOfHearts, 500);
    if (s.won) setTimeout(showWin, 300);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || s.awaitingContinue || modalOpen() || press) return;
    sfx.unlock();
    const i = cellUnder(e);
    if (i === null) return;
    // Right-click flags straight away.
    if (e.button === 2) {
      act(i, mode === 'reveal' ? 'flag' : 'reveal');
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    const p = { pointer: e.pointerId, cell: i, held: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      if (press !== p) return;
      p.held = true;
      renderer.pressed = null;
      act(i, mode === 'reveal' ? 'flag' : 'reveal');
    }, LONG_PRESS_MS);
    press = p;
    if (s.covered(i)) renderer.pressed = i;
    renderer.invalidate();
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    if (cellUnder(e) !== p.cell) {
      endPress();
      renderer.invalidate();
    }
  });

  const release = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    endPress();
    renderer.invalidate();
    if (!cancelled && !p.held) act(p.cell, mode);
  };
  canvas.addEventListener('pointerup', (e) => release(e, false));
  canvas.addEventListener('pointercancel', (e) => release(e, true));

  $('#hm-hint').addEventListener('click', () => {
    const s = session;
    if (!s) return;
    const before = s.open.slice();
    const r = s.hint();
    if (!r) return;
    renderer.reveal([...s.open.keys()].filter((i) => s.open[i] && !before[i]));
    sfx.ding();
    shell.vibrate(15);
    updateHud();
    renderer.invalidate();
    if (s.won) setTimeout(showWin, 300);
  });

  function showOutOfHearts() {
    const s = session;
    if (!s || !s.awaitingContinue) return;
    openModal(
      `<h2>Out of hearts</h2>
       <p>You can keep going, but this board won't earn any stars.</p>
       <div class="actions">
         <button class="btn" data-action="continue">Keep going</button>
         <button class="btn secondary" data-action="restart">Restart level</button>
       </div>`,
      (action) => {
        if (action === 'continue') {
          s.continueWithoutHearts();
          closeModal();
          updateHud();
        } else restartLevel();
      },
      false,
    );
  }

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#hm-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordMinesClear(progress, s.level.number, stars, s.hit.size, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    renderer.invalidate();
    shell.vibrate([20, 60, 20]);
    const note = s.continued
      ? '<p>Finished after running out of hearts: no stars this time.</p>'
      : stars < 3
        ? '<p>Clear it without setting off a mine for three stars.</p>'
        : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number}: all clear</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(s.elapsedMs)} · ${s.hit.size} ${s.hit.size === 1 ? 'mine' : 'mines'} hit ${
           newBestTime ? (prev ? '<span class="best">· New best time!</span>' : '') : `· Best ${fmt(prev!.bestMs)}`
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
    }, 800);
  }

  // Re-measure whenever the stage changes size (window resize, the tip or HUD reflowing).
  new ResizeObserver(() => {
    if (session) renderer.resize();
  }).observe($('#hm-stage'));

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
  (window as unknown as { __mines: unknown }).__mines = {
    get session() {
      return session;
    },
    renderer,
    progress,
    setMode,
  };

  return {
    id: 'mines',
    name: 'Hidden Mines',
    tagline: 'Uncover every safe square. No guessing ever needed.',
    icon: minesLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      endPress();
      session = null;
      renderer.setView(null);
    },
    resetProgress: () => resetMines(progress),
    modalLocked: () => winShown || !!session?.awaitingContinue,
  };
}
