import { fmt } from '../../shared/format';
import { extraIcons, icons, pipeLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildPipeLevel } from './core/levels';
import { PipeLevel } from './core/types';
import { Session } from './game/session';
import { loadPipes, PipeProgress, recordPipesClear, resetPipes } from './game/storage';
import { PipeRenderer, PipeView } from './render/renderer';

/** Hold this long on a tile to lock or unlock it. */
const LONG_PRESS_MS = 420;

export function createPipes(shell: Shell): GameModule {
  const progress: PipeProgress = loadPipes();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<PipeLevel>(
    buildPipeLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'pl-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="pl-home">
    <div class="logo">${pipeLogo}</div>
    <h1>Pipe Link</h1>
    <p>Turn the tiles until water flows from the tap to every pipe, with no loose ends.</p>
    <button class="btn" id="pl-play"></button>
    <button class="btn secondary" id="pl-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="pl-settings-home">Settings</button>
    <button class="btn secondary" id="pl-hub">All puzzles</button>
    <div class="total" id="pl-total"></div>
  </section>

  <section class="screen" id="pl-levels">
    <div class="levels-head">
      <button class="icon-btn" id="pl-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Pipe Link</h2>
    </div>
    <div class="level-grid" id="pl-grid"></div>
  </section>

  <section class="screen" id="pl-game">
    <header class="topbar">
      <button class="icon-btn" id="pl-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="pl-title"></b><span id="pl-diff"></span></div>
      <button class="icon-btn" id="pl-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="pl-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="pl-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="pl-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="pl-stats"></div>
      <div class="timer" id="pl-timer">0:00</div>
      <button class="icon-btn" id="pl-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="pl-hint-count"></span></button>
    </div>
    <p class="tip" id="pl-tip"></p>
    <div class="stage" id="pl-stage">
      <canvas id="pl-board"></canvas>
      <div class="loading" id="pl-loading" hidden>Building the board…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#pl-board');
  const renderer = new PipeRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`pl-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#pl-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#pl-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#pl-grid');
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

  $('#pl-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#pl-play').addEventListener('click', () => startLevel(progress.current));
  $('#pl-open-levels').addEventListener('click', () => show('levels'));
  $('#pl-levels-back').addEventListener('click', () => show('home'));
  $('#pl-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#pl-settings-home').addEventListener('click', shell.openSettings);
  $('#pl-settings').addEventListener('click', shell.openSettings);
  $('#pl-hub').addEventListener('click', shell.goHub);
  $('#pl-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let session: Session | null = null;
  let loadToken = 0;
  let lastTick = performance.now();
  let winShown = false;

  const viewOf = (s: Session): PipeView => ({
    w: s.w,
    h: s.h,
    base: s.level.tiles,
    get turns() {
      return s.turns;
    },
    get locked() {
      return s.locked;
    },
    source: s.level.source,
    get hinted() {
      return s.hinted;
    },
    watered: () => s.watered(),
  });

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    session = null;
    press = null;
    renderer.setView(null);
    $('#pl-title').textContent = `Level ${n}`;
    $('#pl-diff').textContent = '';
    $('#pl-tip').textContent = '';
    $('#pl-stats').textContent = '';
    $('#pl-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#pl-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: PipeLevel) {
    session = new Session(level);
    press = null;
    const diffEl = $('#pl-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title =
      level.score !== undefined ? `On average ${level.score.toFixed(1)} open tiles for each one you can settle at that point` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(viewOf(session));
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#pl-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#pl-stats').innerHTML = `Taps <b>${s.moves}</b> · Par <b>${s.level.par}</b>`;
    $<HTMLButtonElement>('#pl-undo').disabled = !s.canUndo || s.won;
    $('#pl-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#pl-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#pl-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    renderer.invalidate();
    if (session?.won) setTimeout(showWin, 350);
  }

  // ---------- Input ----------
  // Tap a tile to turn it a quarter turn clockwise. Hold to lock or unlock it (right-click
  // does the same with a mouse). A press that slides off its tile does nothing.
  interface Press {
    pointer: number;
    tile: number;
    timer: number;
    held: boolean;
  }
  let press: Press | null = null;

  const tileUnder = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.tileAt(e.clientX - r.left, e.clientY - r.top);
  };

  function lock(i: number) {
    const s = session;
    if (!s || s.won) return;
    s.toggleLock(i);
    if (s.hinted === i) s.hinted = null;
    sfx.thud();
    shell.vibrate(20);
    renderer.invalidate();
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || press) return;
    sfx.unlock();
    const i = tileUnder(e);
    if (i === null) return;
    if (e.button === 2) {
      lock(i);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    const p: Press = { pointer: e.pointerId, tile: i, held: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.held = true;
      lock(i);
    }, LONG_PRESS_MS);
    press = p;
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    if (tileUnder(e) !== p.tile) {
      clearTimeout(p.timer);
      press = null;
    }
  });

  const endPress = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    press = null;
    clearTimeout(p.timer);
    const s = session;
    if (!s || cancelled || p.held) return;
    if (s.tap(p.tile)) {
      sfx.blip();
      shell.vibrate(8);
      afterMove();
    } else {
      renderer.shake(p.tile);
      shell.vibrate(12);
    }
  };
  canvas.addEventListener('pointerup', (e) => endPress(e, false));
  canvas.addEventListener('pointercancel', (e) => endPress(e, true));

  $('#pl-undo').addEventListener('click', () => {
    const s = session;
    if (!s || s.won || s.undo() === null) return;
    sfx.blip();
    afterMove();
  });

  $('#pl-hint').addEventListener('click', () => {
    const s = session;
    if (!s || s.hint() === null) return;
    sfx.ding();
    shell.vibrate(15);
    afterMove();
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#pl-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestMoves, prev } = recordPipesClear(progress, s.level.number, stars, s.moves, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note = stars < 3 ? `<p>Solve it in ${s.level.par} taps or fewer for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number} flowing</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.moves} taps (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
           newBestMoves ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${prev!.bestMoves} taps`
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
  }).observe($('#pl-stage'));

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
  (window as unknown as { __pipes: unknown }).__pipes = {
    get session() {
      return session;
    },
    renderer,
    progress,
    /** Tap tile i, as a player would. */
    tap(i: number) {
      const s = session;
      if (!s || !s.tap(i)) return false;
      afterMove();
      return true;
    },
  };

  return {
    id: 'pipes',
    name: 'Pipe Link',
    tagline: 'Turn the tiles until water reaches every pipe.',
    icon: pipeLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      if (press) clearTimeout(press.timer);
      session = null;
      press = null;
      renderer.setView(null);
    },
    resetProgress: () => resetPipes(progress),
    modalLocked: () => winShown,
  };
}
