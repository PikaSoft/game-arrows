import { fmt } from '../../shared/format';
import { bricksLogo, heartIcon, icons, pauseIcon, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { keyDir } from '../snake/input/swipe';
import { buildBricksLevel } from './core/levels';
import { BricksSim, Events, START_LIVES, STEP_HZ } from './core/sim';
import { BricksLevel } from './core/types';
import { BricksProgress, loadBricks, recordBricksClear, resetBricks } from './game/storage';
import { BricksRenderer } from './render/renderer';

/** A press that moves less than this (CSS pixels) is a tap, which serves the ball. */
const TAP_PX = 10;
/** Paddle speed with the arrow keys, in field units per second. */
const KEY_SPEED = 22;

type Phase = 'ready' | 'playing' | 'paused' | 'over';

export function createBricks(shell: Shell): GameModule {
  const progress: BricksProgress = loadBricks();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<BricksLevel>(
    buildBricksLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'bb-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="bb-home">
    <div class="logo">${bricksLogo}</div>
    <h1>Brick Breaker</h1>
    <p>Keep the ball in play with the paddle and break every brick. Three balls per level.</p>
    <button class="btn" id="bb-play"></button>
    <button class="btn secondary" id="bb-open-levels">Levels</button>
    <button class="btn secondary" id="bb-settings-home">Settings</button>
    <button class="btn secondary" id="bb-hub">All puzzles</button>
    <div class="total" id="bb-total"></div>
  </section>

  <section class="screen" id="bb-levels">
    <div class="levels-head">
      <button class="icon-btn" id="bb-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Brick Breaker</h2>
    </div>
    <div class="level-grid" id="bb-grid"></div>
  </section>

  <section class="screen" id="bb-game">
    <header class="topbar">
      <button class="icon-btn" id="bb-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="bb-title"></b><span id="bb-diff"></span></div>
      <button class="icon-btn" id="bb-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="bb-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="bb-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="bb-lives" aria-label="Balls left"></div>
      <div class="stats" id="bb-stats"></div>
      <div class="timer" id="bb-timer">0:00</div>
      <button class="icon-btn" id="bb-pause" aria-label="Pause">${pauseIcon}</button>
    </div>
    <p class="tip" id="bb-tip"></p>
    <div class="stage" id="bb-stage">
      <canvas id="bb-board"></canvas>
      <div class="loading" id="bb-loading" hidden>Building the wall…</div>
      <div class="snake-overlay" id="bb-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#bb-board');
  const renderer = new BricksRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`bb-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
    else pause();
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#bb-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#bb-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#bb-grid');
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

  $('#bb-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#bb-play').addEventListener('click', () => startLevel(progress.current));
  $('#bb-open-levels').addEventListener('click', () => show('levels'));
  $('#bb-levels-back').addEventListener('click', () => show('home'));
  $('#bb-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#bb-settings-home').addEventListener('click', shell.openSettings);
  $('#bb-settings').addEventListener('click', shell.openSettings);
  $('#bb-hub').addEventListener('click', shell.goHub);
  $('#bb-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let sim: BricksSim | null = null;
  let level: BricksLevel | null = null;
  let phase: Phase = 'ready';
  let loadToken = 0;
  let elapsedMs = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let winShown = false;

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    sim = null;
    renderer.setSim(null);
    $('#bb-title').textContent = `Level ${n}`;
    $('#bb-diff').textContent = '';
    $('#bb-tip').textContent = '';
    $('#bb-stats').textContent = '';
    $('#bb-loading').hidden = false;
    const l = await levels.get(n);
    if (token !== loadToken) return;
    $('#bb-loading').hidden = true;
    begin(l);
    void levels.get(n + 1); // warm up the next one
  }

  function begin(l: BricksLevel) {
    level = l;
    sim = new BricksSim(l);
    renderer.setSim(sim);
    phase = 'ready';
    elapsedMs = 0;
    acc = 0;
    winShown = false;
    const diffEl = $('#bb-diff');
    diffEl.textContent = l.difficulty;
    diffEl.className = `diff-${l.difficulty.split(' ')[0]}`;
    diffEl.title = l.score !== undefined ? `Ball speed ${l.speed}, score ${l.score} (speed, hits to break and steel)` : '';
    $('#bb-tip').textContent = l.tip ?? '';
    renderer.resize();
    setOverlay('Tap to launch');
    updateHud();
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function setOverlay(text: string | null) {
    const o = $('#bb-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud(lostLife = false) {
    const s = sim;
    if (!s) return;
    const lives = $('#bb-lives');
    lives.innerHTML = Array.from({ length: START_LIVES }, (_, i) => heartIcon(i < s.lives)).join('');
    if (lostLife) lives.children[s.lives]?.classList.add('lost');
    $('#bb-stats').innerHTML = `Bricks <b>${s.left}</b>`;
    $<HTMLButtonElement>('#bb-pause').disabled = phase !== 'playing';
    updateTimer();
  }
  function updateTimer() {
    $('#bb-timer').textContent = fmt(elapsedMs);
  }

  /** Start or carry on: serves the ball if it's waiting on the paddle. */
  function go() {
    const s = sim;
    if (!s || phase === 'over' || modalOpen()) return;
    sfx.unlock();
    if (phase === 'paused' && !s.waiting) {
      phase = 'playing';
      last = performance.now();
      setOverlay(null);
      updateHud();
      return;
    }
    if (s.waiting) {
      s.serve();
      phase = 'playing';
      last = performance.now();
      setOverlay(null);
      sfx.blip();
      updateHud();
    }
  }

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    setOverlay('Paused. Tap to carry on');
    updateHud();
  }
  $('#bb-pause').addEventListener('click', pause);

  function handle(ev: Events) {
    for (const h of ev.bricksHit) renderer.hit(h.row, h.col, h.broke);
    if (ev.bricksHit.some((h) => h.broke)) {
      sfx.blip();
      shell.vibrate(6);
    } else if (ev.bricksHit.length) sfx.thud();
    if (ev.paddle) shell.vibrate(4);
    if (ev.caught.length) sfx.ding();
    if (ev.bricksHit.length || ev.caught.length) updateHud();
    if (ev.cleared) {
      phase = 'over';
      updateHud();
      setTimeout(showWin, 300);
    } else if (ev.lifeLost) {
      sfx.thud();
      shell.vibrate([30, 40, 30]);
      updateHud(true);
      if (ev.gameOver) {
        phase = 'over';
        setTimeout(showOver, 500);
      } else {
        phase = 'ready';
        setOverlay('Tap to launch');
      }
    }
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    const s = sim;
    if (!s) return;
    // Arrow keys move the paddle smoothly.
    if (keysHeld.size && phase !== 'over' && phase !== 'paused') {
      const dir = (keysHeld.has(1) ? 1 : 0) - (keysHeld.has(3) ? 1 : 0);
      if (dir) s.movePaddle(s.paddleX + (dir * KEY_SPEED * dt) / 1000);
    }
    if (phase === 'playing') {
      if (modalOpen() || document.visibilityState !== 'visible') pause();
      else {
        elapsedMs += dt;
        acc += dt;
        const stepMs = 1000 / STEP_HZ;
        while (acc >= stepMs && phase === 'playing') {
          acc -= stepMs;
          handle(s.step());
        }
        updateTimer();
      }
    }
    renderer.draw();
  }

  // ---------- Input ----------
  // Drag anywhere to move the paddle: it follows the finger's movement, so the finger
  // never has to cover it. A tap launches the ball (or carries on after a pause).
  const stage = $('#bb-stage');
  let press: { id: number; x: number; startX: number; paddle: number; moved: boolean } | null = null;

  stage.addEventListener('pointerdown', (e) => {
    const s = sim;
    if (!s || phase === 'over' || modalOpen() || press) return;
    sfx.unlock();
    press = { id: e.pointerId, x: e.clientX, startX: e.clientX, paddle: s.paddleX, moved: false };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const p = press;
    const s = sim;
    if (!p || p.id !== e.pointerId || !s) return;
    if (Math.abs(e.clientX - p.startX) > TAP_PX) p.moved = true;
    if (phase === 'paused') return;
    s.movePaddle(p.paddle + (e.clientX - p.startX) / renderer.unit);
  });
  const endPress = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.id !== e.pointerId) return;
    press = null;
    if (!cancelled && !p.moved) go();
  };
  stage.addEventListener('pointerup', (e) => endPress(e, false));
  stage.addEventListener('pointercancel', (e) => endPress(e, true));

  const keysHeld = new Set<number>();
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#bb-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d === 1 || d === 3) {
      e.preventDefault();
      keysHeld.add(d);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (phase === 'playing') pause();
      else go();
    } else if (e.key === 'p' || e.key === 'P') pause();
  });
  document.addEventListener('keyup', (e) => {
    const d = keyDir(e.key);
    if (d !== undefined) keysHeld.delete(d);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function restartLevel() {
    if (!level) return;
    closeModal();
    begin(level);
  }
  $('#bb-restart').addEventListener('click', restartLevel);

  function showOver() {
    const s = sim;
    if (!s || !level) return;
    const l = level;
    openModal(
      `<h2>Out of balls</h2>
       <p>${s.left} ${s.left === 1 ? 'brick' : 'bricks'} left. Have another go?</p>
       <div class="actions">
         <button class="btn" data-action="retry">Try again</button>
         <button class="btn secondary" data-action="levels">Levels</button>
       </div>`,
      (action) => {
        if (action === 'retry') startLevel(l.number);
        else {
          closeModal();
          show('levels');
        }
      },
      false,
    );
  }

  function showWin() {
    const s = sim;
    if (!s || !level || winShown) return;
    winShown = true;
    const l = level;
    const stars = s.lives;
    const lost = START_LIVES - s.lives;
    const { newBestTime, prev } = recordBricksClear(progress, l.number, stars, lost, elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note = stars < 3 ? '<p>Clear it without dropping a ball for three stars.</p>' : '';
    setTimeout(() => {
      if (level !== l) return;
      openModal(
        `<h2>Level ${l.number} cleared</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(elapsedMs)} · ${lost} ${lost === 1 ? 'ball' : 'balls'} lost ${
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
          if (action === 'next') startLevel(l.number + 1);
          else if (action === 'replay') startLevel(l.number);
          else if (action === 'levels') {
            closeModal();
            show('levels');
          }
        },
        false,
      );
    }, 700);
  }

  // Re-measure whenever the stage changes size (window resize, the tip reflowing).
  new ResizeObserver(() => {
    if (sim) renderer.resize();
  }).observe($('#bb-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __bricks: unknown }).__bricks = {
    get sim() {
      return sim;
    },
    get phase() {
      return phase;
    },
    renderer,
    progress,
    go,
  };

  return {
    id: 'bricks',
    name: 'Brick Breaker',
    tagline: 'Paddle, ball and a wall of bricks. Break them all.',
    icon: bricksLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      cancelAnimationFrame(raf);
      raf = 0;
      sim = null;
      level = null;
      press = null;
      keysHeld.clear();
      renderer.setSim(null);
    },
    resetProgress: () => resetBricks(progress),
    modalLocked: () => winShown,
  };
}
