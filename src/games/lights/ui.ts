import { fmt } from '../../shared/format';
import { extraIcons, icons, lightsLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildLightsLevel } from './core/levels';
import { LightsLevel } from './core/types';
import { Session } from './game/session';
import { LightsProgress, loadLights, recordLightsClear, resetLights } from './game/storage';
import { LightsRenderer } from './render/renderer';

export function createLights(shell: Shell): GameModule {
  const progress: LightsProgress = loadLights();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<LightsLevel>(
    buildLightsLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'ls-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="ls-home">
    <div class="logo">${lightsLogo}</div>
    <h1>Light Switch</h1>
    <p>Each tap switches a light and the lights beside it. Turn every light off.</p>
    <button class="btn" id="ls-play"></button>
    <button class="btn secondary" id="ls-open-levels">Levels</button>
    <button class="btn secondary" id="ls-settings-home">Settings</button>
    <button class="btn secondary" id="ls-hub">All puzzles</button>
    <div class="total" id="ls-total"></div>
  </section>

  <section class="screen" id="ls-levels">
    <div class="levels-head">
      <button class="icon-btn" id="ls-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Light Switch</h2>
    </div>
    <div class="level-grid" id="ls-grid"></div>
  </section>

  <section class="screen" id="ls-game">
    <header class="topbar">
      <button class="icon-btn" id="ls-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="ls-title"></b><span id="ls-diff"></span></div>
      <button class="icon-btn" id="ls-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="ls-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="ls-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="ls-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="ls-stats"></div>
      <div class="timer" id="ls-timer">0:00</div>
      <button class="icon-btn" id="ls-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="ls-hint-count"></span></button>
    </div>
    <p class="tip" id="ls-tip"></p>
    <div class="stage" id="ls-stage">
      <canvas id="ls-board"></canvas>
      <div class="loading" id="ls-loading" hidden>Building the board…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#ls-board');
  const renderer = new LightsRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`ls-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#ls-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#ls-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#ls-grid');
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

  $('#ls-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#ls-play').addEventListener('click', () => startLevel(progress.current));
  $('#ls-open-levels').addEventListener('click', () => show('levels'));
  $('#ls-levels-back').addEventListener('click', () => show('home'));
  $('#ls-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#ls-settings-home').addEventListener('click', shell.openSettings);
  $('#ls-settings').addEventListener('click', shell.openSettings);
  $('#ls-hub').addEventListener('click', shell.goHub);
  $('#ls-theme').addEventListener('click', shell.cycleTheme);

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
    press = null;
    renderer.setView(null);
    $('#ls-title').textContent = `Level ${n}`;
    $('#ls-diff').textContent = '';
    $('#ls-tip').textContent = '';
    $('#ls-stats').textContent = '';
    $('#ls-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#ls-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  const patternName = (l: LightsLevel) => (l.pattern === 'cross' ? 'corner taps' : 'side taps') + (l.states === 3 ? ', three steps' : '');

  function beginSession(level: LightsLevel) {
    session = new Session(level);
    press = null;
    const diffEl = $('#ls-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.score !== undefined ? `Par ${level.par}, weighted to ${level.score} for ${patternName(level)}` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#ls-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#ls-stats').innerHTML = `Taps <b>${s.taps}</b> · Par <b>${s.level.par}</b> · Lit <b>${s.lit}</b>`;
    $<HTMLButtonElement>('#ls-undo').disabled = !s.canUndo || s.won;
    $('#ls-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#ls-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#ls-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    renderer.invalidate();
    if (session?.won) setTimeout(showWin, 350);
  }

  // ---------- Input ----------
  // Press a tile to see which lights it reaches (outlined); let go on it to tap. Sliding
  // off the tile before letting go cancels.
  let press: { pointer: number; tile: number } | null = null;

  const tileUnder = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || press) return;
    sfx.unlock();
    const i = tileUnder(e);
    if (i === null) return;
    canvas.setPointerCapture(e.pointerId);
    press = { pointer: e.pointerId, tile: i };
    renderer.pressed = i;
    renderer.invalidate();
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    const i = tileUnder(e);
    renderer.pressed = i === p.tile ? i : null;
    renderer.invalidate();
  });

  const endPress = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    press = null;
    renderer.pressed = null;
    renderer.invalidate();
    const s = session;
    if (!s || cancelled || tileUnder(e) !== p.tile) return;
    if (!s.tap(p.tile)) return;
    renderer.flip(s.reach(p.tile));
    sfx.blip();
    shell.vibrate(8);
    afterMove();
  };
  canvas.addEventListener('pointerup', (e) => endPress(e, false));
  canvas.addEventListener('pointercancel', (e) => endPress(e, true));

  $('#ls-undo').addEventListener('click', () => {
    const s = session;
    if (!s || s.won) return;
    const i = s.undo();
    if (i === null) return;
    renderer.flip(s.reach(i));
    sfx.blip();
    afterMove();
  });

  $('#ls-hint').addEventListener('click', () => {
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
  $('#ls-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestMoves, prev } = recordLightsClear(progress, s.level.number, stars, s.taps, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note =
      stars < 3 ? `<p>${s.hintsUsed ? 'Each hint costs a star. ' : ''}Turn them all off in ${s.level.par} taps or fewer for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number}: lights out</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.taps} taps (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
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
  }).observe($('#ls-stage'));

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
  (window as unknown as { __lights: unknown }).__lights = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'lights',
    name: 'Light Switch',
    tagline: 'Each tap flips a light and its neighbours. Turn them all off.',
    icon: lightsLogo,
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
    resetProgress: () => resetLights(progress),
    modalLocked: () => winShown,
  };
}
