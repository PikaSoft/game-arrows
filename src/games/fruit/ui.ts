import { fruitLogo, icons } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { FRUITS, FruitSim, SavedFruit, STEP_HZ, StepEvents, W } from './core/sim';
import { FruitProgress, loadFruit, noteBests, recordGame, resetFruit, saveFruit } from './game/storage';
import { FruitRenderer } from './render/renderer';

/** How far one press of an arrow key moves the fruit in hand (bucket widths). */
const KEY_STEP = 0.04;
/** Most steps run in one frame, so a slow frame cannot snowball. */
const MAX_STEPS = 12;

export function createFruit(shell: Shell): GameModule {
  const progress: FruitProgress = loadFruit();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'fd-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="fd-home">
    <div class="logo">${fruitLogo}</div>
    <h1>Fruit Drop</h1>
    <p>Drop fruit into the bucket. Two of the same kind that touch join into a bigger fruit. Don't let the bucket overflow.</p>
    <button class="btn" id="fd-continue" hidden>Continue</button>
    <button class="btn" id="fd-play">Play</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="fd-settings-home">Settings</button>
    <button class="btn secondary" id="fd-hub">All puzzles</button>
    <div class="total" id="fd-total"></div>
  </section>

  <section class="screen" id="fd-game">
    <header class="topbar">
      <button class="icon-btn" id="fd-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Fruit Drop</b><span id="fd-sub"></span></div>
      <button class="icon-btn" id="fd-restart" aria-label="Start again">${icons.restart}</button>
      <button class="icon-btn" id="fd-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="fd-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="stats" id="fd-stats"></div>
    </div>
    <div class="stage" id="fd-stage">
      <canvas id="fd-board"></canvas>
      <div class="snake-overlay" id="fd-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#fd-board');
  const renderer = new FruitRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`fd-${id}`);
    if (id === 'home') {
      stop();
      const p = progress;
      $<HTMLButtonElement>('#fd-continue').hidden = !p.saved;
      $('#fd-play').className = p.saved ? 'btn secondary' : 'btn';
      $('#fd-play').textContent = p.saved ? 'New game' : p.games ? 'Play again' : 'Play';
      $('#fd-total').textContent = p.games
        ? `Best score: ${p.bestScore} · Biggest fruit: ${FRUITS[p.bestFruit]?.toLowerCase() ?? 'none'} · ${p.games} ${p.games === 1 ? 'game' : 'games'}`
        : '';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#fd-play').addEventListener('click', () => begin(null));
  $('#fd-continue').addEventListener('click', () => begin(progress.saved));
  $('#fd-back').addEventListener('click', () => {
    closeModal();
    persist();
    show('home');
  });
  $('#fd-settings-home').addEventListener('click', shell.openSettings);
  $('#fd-settings').addEventListener('click', shell.openSettings);
  $('#fd-hub').addEventListener('click', shell.goHub);
  $('#fd-theme').addEventListener('click', shell.cycleTheme);
  $('#fd-restart').addEventListener('click', () => {
    const s = sim;
    // A game with a score is worth asking about before it is thrown away.
    if (!s || s.over || s.score === 0) return begin(null);
    openModal(
      `<h2>Start again?</h2>
       <p>This game and its score of ${s.score} will be lost.</p>
       <div class="actions">
         <button class="btn" data-action="again">Start again</button>
         <button class="btn small secondary" data-action="keep">Keep playing</button>
       </div>`,
      (action) => {
        if (action === 'again') begin(null);
        else closeModal();
      },
    );
  });

  // ---------- Game ----------
  let sim: FruitSim | null = null;
  let raf = 0;
  let last = 0;
  let acc = 0;
  /** The fruit in hand follows this (bucket units). */
  let aimX = W / 2;
  /** The pointer that is aiming, if one is down. */
  let aiming: number | null = null;

  function begin(saved: SavedFruit | null) {
    closeModal();
    // A game left unfinished still counts towards the bests when it is replaced.
    if (!saved && progress.saved) noteBests(progress, progress.saved.score, progress.saved.biggest);
    sim = (saved && FruitSim.restore(saved)) || new FruitSim((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    renderer.setSim(sim);
    aimX = renderer.aimX = W / 2;
    aiming = null;
    acc = 0;
    last = performance.now();
    show('game');
    setOverlay(sim.bodies.length ? null : 'Drag to aim, let go to drop');
    updateHud();
    persist();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /** Keep the game in progress so it can be continued later. */
  function persist() {
    const s = sim;
    if (!s) return;
    progress.saved = s.over ? null : s.save();
    saveFruit(progress);
  }

  function setOverlay(text: string | null) {
    const o = $('#fd-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud() {
    const s = sim;
    if (!s) return;
    $('#fd-stats').innerHTML = `Score <b>${s.score}</b> · Best <b>${Math.max(progress.bestScore, s.score)}</b>`;
    $('#fd-sub').textContent = s.bodies.length ? `Biggest: ${FRUITS[s.biggest].toLowerCase()}` : '';
  }

  function handle(ev: StepEvents) {
    const s = sim!;
    if (ev.merges.length) {
      let top = 0;
      for (const m of ev.merges) {
        renderer.pop(m.x, m.y, m.tier);
        top = Math.max(top, m.tier < 0 ? 99 : m.tier);
      }
      if (top >= 99) sfx.chime();
      else sfx.ding();
      shell.vibrate(top >= 5 ? [10, 30, 10] : 8);
      updateHud();
    } else if (ev.landings) sfx.blip();
    if (ev.over) {
      sfx.thud();
      shell.vibrate([30, 60, 30]);
      const best = s.score > progress.bestScore && s.score > 0;
      const prev = progress.bestScore;
      recordGame(progress, s.score, s.biggest);
      updateHud();
      setTimeout(() => showOver(s, best, prev), 900);
    }
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    const s = sim;
    if (!s) return;
    // A card on top or a hidden tab holds everything still.
    if (!s.over && !modalOpen() && document.visibilityState === 'visible') {
      acc += dt;
      const stepMs = 1000 / STEP_HZ;
      let n = 0;
      while (acc >= stepMs && n++ < MAX_STEPS && !s.over) {
        acc -= stepMs;
        handle(s.step());
      }
      if (acc >= stepMs) acc = 0;
    }
    renderer.aimX = aimX;
    renderer.draw();
  }

  function aim(x: number) {
    const s = sim;
    if (!s) return;
    aimX = s.clampX(x);
  }

  function drop() {
    const s = sim;
    if (!s || modalOpen()) return;
    sfx.unlock();
    if (!s.drop(aimX)) return;
    setOverlay(null);
    sfx.whoosh(0.12);
    shell.vibrate(6);
    // The next fruit may be wider: keep it inside the walls.
    aimX = s.clampX(aimX);
    updateHud();
    persist();
  }

  // Press and drag to aim; the fruit falls when the finger lifts. A mouse aims by hovering.
  const stage = $('#fd-stage');
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !sim || sim.over) return;
    aiming = e.pointerId;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; aiming works without it.
    }
    aim(renderer.toWorldX(e.clientX));
  });
  stage.addEventListener('pointermove', (e) => {
    if (aiming === e.pointerId || (aiming === null && e.pointerType === 'mouse')) aim(renderer.toWorldX(e.clientX));
  });
  stage.addEventListener('pointerup', (e) => {
    if (aiming !== e.pointerId) return;
    aiming = null;
    aim(renderer.toWorldX(e.clientX));
    drop();
  });
  stage.addEventListener('pointercancel', (e) => {
    if (aiming === e.pointerId) aiming = null;
  });
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#fd-game').classList.contains('active') || modalOpen()) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      aim(aimX + (e.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP));
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!e.repeat) drop();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' && $('#fd-game').classList.contains('active')) persist();
  });

  function showOver(s: FruitSim, best: boolean, prev: number) {
    if (sim !== s || !$('#fd-game').classList.contains('active')) return;
    if (best) sfx.chime();
    openModal(
      `<h2>${best ? 'New best score!' : 'The bucket overflowed'}</h2>
       <div class="result-line">Score <b>${s.score}</b> · Biggest fruit: ${FRUITS[s.biggest].toLowerCase()}</div>
       <p>${best ? (prev ? `Your old best was ${prev}.` : 'Your first full bucket.') : `Your best is ${progress.bestScore}.`}</p>
       <div class="actions">
         <button class="btn" data-action="again">Play again</button>
         <button class="btn small secondary" data-action="home">Home</button>
       </div>`,
      (action) => {
        if (action === 'again') begin(null);
        else {
          closeModal();
          show('home');
        }
      },
      false,
    );
  }

  new ResizeObserver(() => {
    if (sim) renderer.resize();
  }).observe(stage);

  // Hook for automated browser tests.
  (window as unknown as { __fruit: unknown }).__fruit = {
    get sim() {
      return sim;
    },
    progress,
  };

  return {
    id: 'fruit',
    name: 'Fruit Drop',
    tagline: 'Drop fruit, join matching pairs, keep the bucket from overflowing.',
    icon: fruitLogo,
    summary: () => ({
      status: progress.saved ? `Game in progress · ${progress.saved.score}` : progress.games ? `Best ${progress.bestScore}` : 'Start playing',
      stars: 0,
    }),
    enter: () => show('home'),
    leave: () => {
      persist();
      stop();
      sim = null;
      renderer.setSim(null);
    },
    resetProgress: () => resetFruit(progress),
    modalLocked: () => false,
  };
}
