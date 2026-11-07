import { fmt } from '../../shared/format';
import { extraIcons, icons, iceLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { keyDir } from '../snake/input/swipe';
import { buildIceLevel } from './core/levels';
import { HOME } from './core/rules';
import { IceLevel } from './core/types';
import { Session } from './game/session';
import { IceProgress, loadIce, recordIceClear, resetIce } from './game/storage';
import { IceRenderer } from './render/renderer';

/** Distance in CSS pixels a finger must travel before it counts as a swipe. */
const SWIPE_PX = 24;

export function createIce(shell: Shell): GameModule {
  const progress: IceProgress = loadIce();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<IceLevel>(
    buildIceLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'is-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="is-home">
    <div class="logo">${iceLogo}</div>
    <h1>Ice Slide</h1>
    <p>Swipe to slide the puck across the ice. It only stops at a rock or the edge. Stop it on the flag.</p>
    <button class="btn" id="is-play"></button>
    <button class="btn secondary" id="is-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="is-settings-home">Settings</button>
    <button class="btn secondary" id="is-hub">All puzzles</button>
    <div class="total" id="is-total"></div>
  </section>

  <section class="screen" id="is-levels">
    <div class="levels-head">
      <button class="icon-btn" id="is-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Ice Slide</h2>
    </div>
    <div class="level-grid" id="is-grid"></div>
  </section>

  <section class="screen" id="is-game">
    <header class="topbar">
      <button class="icon-btn" id="is-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="is-title"></b><span id="is-diff"></span></div>
      <button class="icon-btn" id="is-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="is-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="is-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="is-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="is-stats"></div>
      <div class="timer" id="is-timer">0:00</div>
      <button class="icon-btn" id="is-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="is-hint-count"></span></button>
    </div>
    <p class="tip" id="is-tip"></p>
    <div class="stage" id="is-stage">
      <canvas id="is-board"></canvas>
      <div class="loading" id="is-loading" hidden>Building the board…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#is-board');
  const renderer = new IceRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`is-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#is-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#is-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#is-grid');
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

  $('#is-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#is-play').addEventListener('click', () => startLevel(progress.current));
  $('#is-open-levels').addEventListener('click', () => show('levels'));
  $('#is-levels-back').addEventListener('click', () => show('home'));
  $('#is-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#is-settings-home').addEventListener('click', shell.openSettings);
  $('#is-settings').addEventListener('click', shell.openSettings);
  $('#is-hub').addEventListener('click', shell.goHub);
  $('#is-theme').addEventListener('click', shell.cycleTheme);

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
    $('#is-title').textContent = `Level ${n}`;
    $('#is-diff').textContent = '';
    $('#is-tip').textContent = '';
    $('#is-stats').textContent = '';
    $('#is-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#is-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: IceLevel) {
    session = new Session(level);
    deadShown = false;
    const diffEl = $('#is-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.score !== undefined ? `Par ${level.par}, weighted to ${level.score} for the dead ends on this board` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#is-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    const twin = s.level.starts.length > 1;
    const home = s.pos.filter((p) => p === HOME).length;
    $('#is-stats').innerHTML = `Swipes <b>${s.swipes}</b> · Par <b>${s.level.par}</b>${twin ? ` · Home <b>${home}/2</b>` : ''}`;
    $<HTMLButtonElement>('#is-undo').disabled = !s.canUndo || s.won;
    $('#is-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#is-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#is-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Moving ----------
  let deadShown = false;

  function swipe(d: number) {
    const s = session;
    if (!s || s.won) return;
    const before = s.pos.slice();
    const r = s.swipe(d);
    if (!r) {
      renderer.shake(d);
      sfx.thud();
      shell.vibrate(12);
      return;
    }
    before.forEach((p, k) => {
      if (p === HOME || !r.paths[k].length) return;
      const fell = r.fell === k;
      renderer.slide(k, p, r.paths[k], fell, !fell && r.pos[k] === HOME);
    });
    if (r.fell !== null) {
      sfx.whoosh(0.15);
      setTimeout(() => sfx.thud(), r.paths[r.fell].length * 42 + 120);
      shell.vibrate([10, 80, 30]);
      shell.toast('Into the water! That swipe is wasted.');
    } else {
      sfx.whoosh(0.12);
      const homes = r.pos.filter((p, k) => p === HOME && before[k] !== HOME).length;
      if (homes) setTimeout(() => sfx.ding(), 200);
    }
    afterMove();
  }

  function afterMove() {
    const s = session;
    if (!s) return;
    updateHud();
    renderer.invalidate();
    if (s.won) {
      setTimeout(showWin, 650);
      return;
    }
    if (s.deadEnd) {
      if (!deadShown) shell.toast("There's no way to the flag from here. Undo to go back.");
      deadShown = true;
    } else deadShown = false;
  }

  // ---------- Input ----------
  // One swipe anywhere on the board is one slide. Arrow keys and WASD work too.
  const stage = $('#is-stage');
  let press: { id: number; x: number; y: number; done: boolean } | null = null;

  stage.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || press) return;
    sfx.unlock();
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
    swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  });
  const endPress = (e: PointerEvent) => {
    if (press && press.id === e.pointerId) press = null;
  };
  stage.addEventListener('pointerup', endPress);
  stage.addEventListener('pointercancel', endPress);

  document.addEventListener('keydown', (e) => {
    const s = session;
    if (!s || !$('#is-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d !== undefined) {
      e.preventDefault();
      swipe(d);
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      e.preventDefault();
      undo();
    }
  });

  function undo() {
    const s = session;
    if (!s || s.won || !s.undo()) return;
    renderer.snap();
    sfx.blip();
    afterMove();
  }
  $('#is-undo').addEventListener('click', undo);

  $('#is-hint').addEventListener('click', () => {
    const s = session;
    if (!s || s.won || s.hints <= 0) return;
    if (s.hint() === null) {
      shell.toast("There's no way to the flag from here. Undo or restart.");
      return;
    }
    sfx.ding();
    shell.vibrate(15);
    updateHud();
    renderer.invalidate();
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#is-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestMoves, prev } = recordIceClear(progress, s.level.number, stars, s.swipes, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note =
      stars < 3 ? `<p>${s.hintsUsed ? 'Each hint costs a star. ' : ''}Get there in ${s.level.par} swipes or fewer for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number}: on the flag</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.swipes} swipes (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
           newBestMoves ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${prev!.bestMoves} swipes`
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
  }).observe($('#is-stage'));

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
  (window as unknown as { __ice: unknown }).__ice = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'ice',
    name: 'Ice Slide',
    tagline: 'Slide the puck across the ice and stop it on the flag.',
    icon: iceLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      session = null;
      press = null;
      renderer.setView(null);
    },
    resetProgress: () => resetIce(progress),
    modalLocked: () => winShown,
  };
}
