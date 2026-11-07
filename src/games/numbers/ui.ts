import { fmt } from '../../shared/format';
import { heartIcon, icons, numbersLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { keyDir } from '../snake/input/swipe';
import { buildNumbersLevel } from './core/levels';
import { NumbersLevel } from './core/types';
import { Session, START_HEARTS } from './game/session';
import { loadNumbers, NumbersProgress, recordNumbersClear, resetNumbers } from './game/storage';
import { NumbersRenderer } from './render/renderer';

export function createNumbers(shell: Shell): GameModule {
  const progress: NumbersProgress = loadNumbers();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<NumbersLevel>(
    buildNumbersLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'np-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="np-home">
    <div class="logo">${numbersLogo}</div>
    <h1>Number Place</h1>
    <p>Fill the grid so every row, column and box holds each digit exactly once.</p>
    <button class="btn" id="np-play"></button>
    <button class="btn secondary" id="np-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="np-settings-home">Settings</button>
    <button class="btn secondary" id="np-hub">All puzzles</button>
    <div class="total" id="np-total"></div>
  </section>

  <section class="screen" id="np-levels">
    <div class="levels-head">
      <button class="icon-btn" id="np-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Number Place</h2>
    </div>
    <div class="level-grid" id="np-grid"></div>
  </section>

  <section class="screen" id="np-game">
    <header class="topbar">
      <button class="icon-btn" id="np-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="np-title"></b><span id="np-diff"></span></div>
      <button class="icon-btn" id="np-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="np-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="np-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="np-hearts" aria-label="Hearts"></div>
      <div class="stats" id="np-stats"></div>
      <div class="timer" id="np-timer">0:00</div>
      <button class="icon-btn" id="np-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="np-hint-count"></span></button>
    </div>
    <p class="tip" id="np-tip"></p>
    <div class="stage" id="np-stage">
      <canvas id="np-board"></canvas>
      <div class="loading" id="np-loading" hidden>Building the board…</div>
    </div>
    <div class="digit-pad" id="np-pad"></div>
    <div class="mode-bar">
      <div class="seg" id="np-mode" role="group" aria-label="What a digit does">
        <button data-mode="digit" aria-pressed="true">Digits</button><button data-mode="notes" aria-pressed="false">Notes</button>
      </div>
      <button class="btn small secondary" id="np-erase">Clear notes</button>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#np-board');
  const renderer = new NumbersRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`np-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#np-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#np-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#np-grid');
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

  $('#np-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#np-play').addEventListener('click', () => startLevel(progress.current));
  $('#np-open-levels').addEventListener('click', () => show('levels'));
  $('#np-levels-back').addEventListener('click', () => show('home'));
  $('#np-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#np-settings-home').addEventListener('click', shell.openSettings);
  $('#np-settings').addEventListener('click', shell.openSettings);
  $('#np-hub').addEventListener('click', shell.goHub);
  $('#np-theme').addEventListener('click', shell.cycleTheme);

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
    renderer.setView(null);
    $('#np-title').textContent = `Level ${n}`;
    $('#np-diff').textContent = '';
    $('#np-tip').textContent = '';
    $('#np-stats').textContent = '';
    $('#np-pad').innerHTML = '';
    $('#np-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#np-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: NumbersLevel) {
    session = new Session(level);
    setNotes(false);
    const diffEl = $('#np-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.hardest ? `Hardest step needed: ${level.hardest}` : '';
    $('#np-pad').innerHTML = Array.from(
      { length: level.size },
      (_, k) => `<button data-digit="${k + 1}" aria-label="${k + 1}"><b>${k + 1}</b><span></span></button>`,
    ).join('');
    $('#np-pad').style.setProperty('--digits', String(level.size));
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#np-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud(lostHeart = false) {
    const s = session;
    if (!s) return;
    const hearts = $('#np-hearts');
    hearts.innerHTML = Array.from({ length: START_HEARTS }, (_, i) => heartIcon(!s.continued && i < s.hearts)).join('');
    if (lostHeart) hearts.children[s.hearts]?.classList.add('lost');
    $('#np-stats').innerHTML = `Left <b>${s.left}</b>`;
    $('#np-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#np-hint').disabled = s.hints === 0 || s.won;
    // Each digit button shows how many are left to place; a finished digit greys out.
    for (const b of $('#np-pad').querySelectorAll<HTMLButtonElement>('button')) {
      const left = s.remaining(Number(b.dataset.digit));
      b.querySelector('span')!.textContent = left ? String(left) : '';
      b.disabled = left === 0 || s.won;
    }
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#np-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Notes mode ----------
  let notes = false;
  function setNotes(on: boolean) {
    notes = on;
    for (const b of $('#np-mode').querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String((b.dataset.mode === 'notes') === on));
  }
  $('#np-mode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (b) setNotes(b.dataset.mode === 'notes');
  });

  // ---------- Input ----------
  // Tap a square to select it, then a digit. Keyboard: digits, arrows to move, N for
  // notes, Backspace to clear notes.
  function select(i: number | null) {
    const s = session;
    if (!s) return;
    s.selected = i;
    renderer.invalidate();
  }

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen()) return;
    sfx.unlock();
    const r = canvas.getBoundingClientRect();
    const i = renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
    select(i === s.selected ? null : i);
  });

  function enter(d: number) {
    const s = session;
    if (!s || s.won || s.awaitingContinue || s.selected === null) return;
    const i = s.selected;
    if (notes) {
      if (s.toggleNote(i, d)) {
        sfx.blip();
        renderer.invalidate();
      }
      return;
    }
    const r = s.place(i, d);
    if (!r) return;
    if (r.ok) {
      renderer.pop(i);
      sfx.blip();
      shell.vibrate(8);
    } else {
      renderer.wrong(i);
      sfx.thud();
      shell.vibrate([20, 40, 20]);
    }
    updateHud(!r.ok && !s.continued);
    renderer.invalidate();
    if (r.outOfHearts) setTimeout(showOutOfHearts, 450);
    if (s.won) {
      s.selected = null;
      setTimeout(showWin, 300);
    }
  }

  $('#np-pad').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-digit]');
    if (b && !b.disabled) enter(Number(b.dataset.digit));
  });
  $('#np-erase').addEventListener('click', () => {
    const s = session;
    if (s && s.selected !== null && s.clearNotes(s.selected)) renderer.invalidate();
  });

  document.addEventListener('keydown', (e) => {
    const s = session;
    if (!s || !$('#np-game').classList.contains('active') || modalOpen()) return;
    const n = Number(e.key);
    if (n >= 1 && n <= s.size) {
      e.preventDefault();
      enter(n);
      return;
    }
    if (e.key === 'n' || e.key === 'N') return setNotes(!notes);
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (s.selected !== null && s.clearNotes(s.selected)) renderer.invalidate();
      return;
    }
    const d = keyDir(e.key);
    if (d === undefined) return;
    e.preventDefault();
    const at = s.selected ?? 0;
    const x = Math.max(0, Math.min(s.size - 1, (at % s.size) + [0, 1, 0, -1][d]));
    const y = Math.max(0, Math.min(s.size - 1, ((at / s.size) | 0) + [-1, 0, 1, 0][d]));
    select(s.selected === null ? 0 : y * s.size + x);
  });

  $('#np-hint').addEventListener('click', () => {
    const s = session;
    if (!s) return;
    const i = s.hint();
    if (i === null) return;
    renderer.pop(i);
    s.selected = i;
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
       <p>You can keep going, but this puzzle won't earn any stars.</p>
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
  $('#np-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordNumbersClear(progress, s.level.number, stars, s.mistakes, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note = s.continued
      ? '<p>Finished after running out of hearts: no stars this time.</p>'
      : stars < 3
        ? '<p>Finish with no wrong digits for three stars.</p>'
        : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number} solved</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(s.elapsedMs)} · ${s.mistakes} ${s.mistakes === 1 ? 'mistake' : 'mistakes'} ${
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
    }, 700);
  }

  // Re-measure whenever the stage changes size (window resize, the tip or HUD reflowing).
  new ResizeObserver(() => {
    if (session) renderer.resize();
  }).observe($('#np-stage'));

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
  (window as unknown as { __numbers: unknown }).__numbers = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'numbers',
    name: 'Number Place',
    tagline: 'Every row, column and box holds each digit once.',
    icon: numbersLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      session = null;
      renderer.setView(null);
    },
    resetProgress: () => resetNumbers(progress),
    modalLocked: () => winShown || !!session?.awaitingContinue,
  };
}
