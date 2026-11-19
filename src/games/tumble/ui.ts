import { fmt } from '../../shared/format';
import { extraIcons, icons, starIcon, tumbleLogo } from '../../shared/icons';
import { keyDir } from '../snake/input/swipe';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildTumbleLevel } from './core/levels';
import { TumbleLevel } from './core/types';
import { Session } from './game/session';
import { loadTumble, recordTumbleClear, resetTumble, TumbleProgress } from './game/storage';
import { TumbleRenderer } from './render/renderer';

export function createTumble(shell: Shell): GameModule {
  const progress: TumbleProgress = loadTumble();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<TumbleLevel>(
    buildTumbleLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'tb-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="tb-home">
    <div class="logo">${tumbleLogo}</div>
    <h1>Tumble Block</h1>
    <p>Swipe to tip a tall block end over end across the tiles. Stand it upright in the hole.</p>
    <button class="btn" id="tb-play"></button>
    <button class="btn secondary" id="tb-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="tb-settings-home">Settings</button>
    <button class="btn secondary" id="tb-hub">All puzzles</button>
    <div class="total" id="tb-total"></div>
  </section>

  <section class="screen" id="tb-levels">
    <div class="levels-head">
      <button class="icon-btn" id="tb-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Tumble Block</h2>
    </div>
    <div class="level-grid" id="tb-grid"></div>
  </section>

  <section class="screen" id="tb-game">
    <header class="topbar">
      <button class="icon-btn" id="tb-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="tb-title"></b><span id="tb-diff"></span></div>
      <button class="icon-btn" id="tb-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="tb-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="tb-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="tb-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="tb-stats"></div>
      <div class="timer" id="tb-timer">0:00</div>
      <button class="icon-btn" id="tb-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="tb-hint-count"></span></button>
    </div>
    <p class="tip" id="tb-tip"></p>
    <div class="stage" id="tb-stage">
      <canvas id="tb-board"></canvas>
      <div class="loading" id="tb-loading" hidden>Laying the tiles…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#tb-board');
  const renderer = new TumbleRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`tb-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#tb-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#tb-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#tb-grid');
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

  $('#tb-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#tb-play').addEventListener('click', () => startLevel(progress.current));
  $('#tb-open-levels').addEventListener('click', () => show('levels'));
  $('#tb-levels-back').addEventListener('click', () => show('home'));
  $('#tb-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#tb-settings-home').addEventListener('click', shell.openSettings);
  $('#tb-settings').addEventListener('click', shell.openSettings);
  $('#tb-hub').addEventListener('click', shell.goHub);
  $('#tb-theme').addEventListener('click', shell.cycleTheme);

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
    $('#tb-title').textContent = `Level ${n}`;
    $('#tb-diff').textContent = '';
    $('#tb-tip').textContent = '';
    $('#tb-stats').textContent = '';
    $('#tb-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#tb-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: TumbleLevel) {
    session = new Session(level);
    const diffEl = $('#tb-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.score !== undefined ? `Par ${level.par}, weighted to ${level.score} for moves away from the hole` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#tb-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#tb-stats').innerHTML = `Moves <b>${s.moves}</b> · Par <b>${s.level.par}</b>`;
    $<HTMLButtonElement>('#tb-undo').disabled = !s.canUndo || s.won;
    $('#tb-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#tb-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#tb-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    renderer.invalidate();
    if (session?.won) setTimeout(showWin, 350);
  }

  // ---------- Input ----------
  // One swipe anywhere on the board tips the block once. Arrow keys and WASD too; Z undoes.
  const SWIPE_PX = 24;
  function tip(d: number) {
    const s = session;
    if (!s || s.won || modalOpen()) return;
    sfx.unlock();
    const from = s.block;
    const r = s.move(d);
    if (!r) return;
    if (r.fell) {
      renderer.wobble();
      sfx.thud();
      shell.vibrate([20, 40, 20]);
      shell.toast(r.broke !== null ? 'The cracked square would break! That move is wasted.' : 'It would topple off! That move is wasted.');
    } else {
      renderer.rolled(from);
      if (r.pressed.length) {
        sfx.ding();
        shell.vibrate(18);
      } else {
        sfx.blip();
        shell.vibrate(8);
      }
    }
    afterMove();
  }

  const stage = $('#tb-stage');
  let press: { id: number; x: number; y: number; done: boolean } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (press || !session || modalOpen()) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId || press.done) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    press.done = true;
    tip(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  });
  const endPress = (e: PointerEvent) => {
    if (press && press.id === e.pointerId) press = null;
  };
  stage.addEventListener('pointerup', endPress);
  stage.addEventListener('pointercancel', endPress);
  document.addEventListener('keydown', (e) => {
    if (!session || !$('#tb-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d !== undefined) {
      e.preventDefault();
      tip(d);
    } else if (e.key === 'z' || e.key === 'Z') $('#tb-undo').click();
  });

  $('#tb-undo').addEventListener('click', () => {
    const s = session;
    if (!s || !s.undo()) return;
    sfx.blip();
    afterMove();
  });

  $('#tb-hint').addEventListener('click', () => {
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
  $('#tb-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordTumbleClear(progress, s.level.number, stars, s.moves, s.elapsedMs);
    sfx.chime();
    renderer.celebrate();
    shell.vibrate([20, 60, 20]);
    const note =
      stars < 3 ? `<p>${s.hintsUsed ? 'Each hint costs a star. ' : ''}Reach the hole in ${s.level.par} moves or fewer for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number}: in the hole</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.moves} moves (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
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
  }).observe($('#tb-stage'));

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
  (window as unknown as { __tumble: unknown }).__tumble = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'tumble',
    name: 'Tumble Block',
    tagline: 'Roll a tall block end over end into the hole.',
    icon: tumbleLogo,
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
    resetProgress: () => resetTumble(progress),
    modalLocked: () => winShown,
  };
}
