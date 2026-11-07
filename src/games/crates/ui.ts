import { fmt } from '../../shared/format';
import { extraIcons, icons, cratesLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { keyDir } from '../snake/input/swipe';
import { buildCrateLevel } from './core/levels';
import { CrateLevel } from './core/types';
import { Session, StepResult } from './game/session';
import { CrateProgress, loadCrates, recordCratesClear, resetCrates } from './game/storage';
import { CrateRenderer } from './render/renderer';

/** Distance in CSS pixels a finger must travel before it counts as a swipe. */
const SWIPE_PX = 22;
/** Time between steps when walking a route. */
const STEP_MS = 75;

export function createCrates(shell: Shell): GameModule {
  const progress: CrateProgress = loadCrates();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<CrateLevel>(
    buildCrateLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'cp-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="cp-home">
    <div class="logo">${cratesLogo}</div>
    <h1>Crate Push</h1>
    <p>Push every crate onto a target. Crates can only be pushed, never pulled.</p>
    <button class="btn" id="cp-play"></button>
    <button class="btn secondary" id="cp-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="cp-settings-home">Settings</button>
    <button class="btn secondary" id="cp-hub">All puzzles</button>
    <div class="total" id="cp-total"></div>
  </section>

  <section class="screen" id="cp-levels">
    <div class="levels-head">
      <button class="icon-btn" id="cp-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Crate Push</h2>
    </div>
    <div class="level-grid" id="cp-grid"></div>
  </section>

  <section class="screen" id="cp-game">
    <header class="topbar">
      <button class="icon-btn" id="cp-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="cp-title"></b><span id="cp-diff"></span></div>
      <button class="icon-btn" id="cp-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="cp-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="cp-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="cp-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="cp-stats"></div>
      <div class="timer" id="cp-timer">0:00</div>
      <button class="icon-btn" id="cp-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="cp-hint-count"></span></button>
    </div>
    <p class="tip" id="cp-tip"></p>
    <div class="stage" id="cp-stage">
      <canvas id="cp-board"></canvas>
      <div class="loading" id="cp-loading" hidden>Building the board…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#cp-board');
  const renderer = new CrateRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`cp-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#cp-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#cp-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#cp-grid');
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

  $('#cp-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#cp-play').addEventListener('click', () => startLevel(progress.current));
  $('#cp-open-levels').addEventListener('click', () => show('levels'));
  $('#cp-levels-back').addEventListener('click', () => show('home'));
  $('#cp-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#cp-settings-home').addEventListener('click', shell.openSettings);
  $('#cp-settings').addEventListener('click', shell.openSettings);
  $('#cp-hub').addEventListener('click', shell.goHub);
  $('#cp-theme').addEventListener('click', shell.cycleTheme);

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
    stopWalk();
    renderer.setView(null);
    $('#cp-title').textContent = `Level ${n}`;
    $('#cp-diff').textContent = '';
    $('#cp-tip').textContent = '';
    $('#cp-stats').textContent = '';
    $('#cp-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#cp-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: CrateLevel) {
    session = new Session(level);
    stopWalk();
    stuckShown = false;
    const diffEl = $('#cp-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title =
      level.score !== undefined
        ? `${level.score} ${level.score === 1 ? 'push' : 'pushes'} beyond what the crates would need if each could slide home on its own`
        : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#cp-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#cp-stats').innerHTML = `Pushes <b>${s.pushes}</b> · Par <b>${s.level.par}</b> · Home <b>${s.onTarget}/${s.crates.length}</b>`;
    $<HTMLButtonElement>('#cp-undo').disabled = !s.canUndo || s.won;
    $('#cp-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#cp-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#cp-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Moving ----------
  let stuckShown = false;
  /** Steps still to walk on a route (from a tap or a hint), one every STEP_MS. */
  let queue: number[] = [];
  let walkTimer = 0;

  function stopWalk() {
    queue = [];
    clearInterval(walkTimer);
    walkTimer = 0;
  }

  /** Take one step. Returns what happened. */
  function stepTo(d: number): StepResult {
    const s = session;
    if (!s || s.won) return null;
    const home = s.onTarget;
    const r = s.move(d);
    if (!r) {
      renderer.shake(d);
      sfx.thud();
      shell.vibrate(12);
      stopWalk();
    } else if (r.kind === 'push') {
      if (s.onTarget > home) {
        sfx.ding();
        shell.vibrate(18);
      } else {
        sfx.blip();
        shell.vibrate(8);
      }
    }
    afterMove();
    return r;
  }

  function afterMove() {
    const s = session;
    if (!s) return;
    updateHud();
    renderer.invalidate();
    if (s.won) {
      stopWalk();
      setTimeout(showWin, 350);
      return;
    }
    if (s.stuck && !stuckShown) {
      stuckShown = true;
      shell.toast("A crate can't reach a target from there. Undo to take it back.");
    } else if (!s.stuck) stuckShown = false;
  }

  function walk(dirs: number[]) {
    stopWalk();
    queue = dirs.slice();
    if (!queue.length) return;
    stepTo(queue.shift()!);
    walkTimer = window.setInterval(() => {
      const d = queue.shift();
      if (d === undefined || !session) return stopWalk();
      stepTo(d);
    }, STEP_MS);
  }

  // ---------- Input ----------
  // Swipe anywhere to step (one drag can make several steps). Tap a floor cell to walk
  // there; tap a crate right next to the player to push it.
  const stage = $('#cp-stage');
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;

  stage.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || press) return;
    sfx.unlock();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId || !session) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    press.x = e.clientX;
    press.y = e.clientY;
    press.moved = true;
    stopWalk();
    stepTo(d);
  });
  const endPress = (e: PointerEvent, cancelled: boolean) => {
    if (!press || press.id !== e.pointerId) return;
    const tap = !press.moved && !cancelled;
    press = null;
    const s = session;
    if (!tap || !s || s.won) return;
    const r = canvas.getBoundingClientRect();
    const cell = renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
    if (cell === null || cell === s.player) return;
    // A crate right beside the player: push it.
    const w = s.level.w;
    const side = [0, 1, 2, 3].find((d) => s.player + [-w, 1, w, -1][d] === cell);
    if (side !== undefined && s.crateAt(cell) >= 0) {
      stopWalk();
      stepTo(side);
      return;
    }
    const route = s.routeTo(cell);
    if (route) walk(route);
    else if (s.crateAt(cell) < 0 && !s.level.walls[cell]) shell.toast("Can't get there without pushing something.");
  };
  stage.addEventListener('pointerup', (e) => endPress(e, false));
  stage.addEventListener('pointercancel', (e) => endPress(e, true));

  document.addEventListener('keydown', (e) => {
    const s = session;
    if (!s || !$('#cp-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d !== undefined) {
      e.preventDefault();
      stopWalk();
      stepTo(d);
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      e.preventDefault();
      undo();
    }
  });

  function undo() {
    const s = session;
    if (!s || s.won) return;
    stopWalk();
    if (!s.undo()) return;
    renderer.snap();
    sfx.blip();
    afterMove();
  }
  $('#cp-undo').addEventListener('click', undo);

  $('#cp-hint').addEventListener('click', () => {
    const s = session;
    if (!s || s.won || s.hints <= 0) return;
    stopWalk();
    const route = s.hint();
    if (!route) {
      shell.toast(s.stuck ? 'No way to finish from here. Undo or restart.' : 'No hint found from here. Try undoing a push.');
      return;
    }
    updateHud();
    walk(route);
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#cp-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestMoves, prev } = recordCratesClear(progress, s.level.number, stars, s.pushes, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note =
      stars < 3 ? `<p>${s.hintsUsed ? 'Each hint costs a star. ' : ''}Solve it in ${s.level.par} pushes or fewer for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number} stacked</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.pushes} pushes (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
           newBestMoves ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${prev!.bestMoves} pushes`
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
  }).observe($('#cp-stage'));

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
  (window as unknown as { __crates: unknown }).__crates = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'crates',
    name: 'Crate Push',
    tagline: 'Push every crate onto a target. No pulling.',
    icon: cratesLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      stopWalk();
      session = null;
      press = null;
      renderer.setView(null);
    },
    resetProgress: () => resetCrates(progress),
    modalLocked: () => winShown,
  };
}
