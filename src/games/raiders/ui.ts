import { heartIcon, icons, pauseIcon, raidersLogo } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { keyDir } from '../snake/input/swipe';
import { Events, RaidersSim, SHIP_Y, START_LIVES, STEP_HZ, W, WAVE_BONUS } from './core/sim';
import { loadRaiders, RaidersProgress, recordRaidersGame, resetRaiders } from './game/storage';
import { RaidersRenderer } from './render/renderer';

/** A press that moves less than this (CSS pixels) is a tap. */
const TAP_PX = 10;
/** Ship speed with the arrow keys, in field units per second. */
const KEY_SPEED = 14;
/** Most steps run in one frame, so a slow frame cannot snowball. */
const MAX_STEPS = 12;

type Phase = 'ready' | 'playing' | 'paused' | 'over';

export function createRaiders(shell: Shell): GameModule {
  const progress: RaidersProgress = loadRaiders();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'sr-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="sr-home">
    <div class="logo">${raidersLogo}</div>
    <h1>Star Raiders</h1>
    <p>Raiders march down in waves. Slide your ship to dodge their bolts while it fires back. Clear wave after wave.</p>
    <button class="btn" id="sr-play">Play</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="sr-settings-home">Settings</button>
    <button class="btn secondary" id="sr-hub">All puzzles</button>
    <div class="total" id="sr-total"></div>
  </section>

  <section class="screen" id="sr-game">
    <header class="topbar">
      <button class="icon-btn" id="sr-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Star Raiders</b><span id="sr-sub"></span></div>
      <button class="icon-btn" id="sr-restart" aria-label="Start again">${icons.restart}</button>
      <button class="icon-btn" id="sr-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="sr-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="sr-lives" aria-label="Lives"></div>
      <div class="stats" id="sr-stats"></div>
      <button class="icon-btn" id="sr-pause" aria-label="Pause">${pauseIcon}</button>
    </div>
    <div class="stage" id="sr-stage">
      <canvas id="sr-board"></canvas>
      <div class="snake-overlay" id="sr-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#sr-board');
  const renderer = new RaidersRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`sr-${id}`);
    if (id === 'home') {
      pause();
      const p = progress;
      $('#sr-play').textContent = p.games ? 'Play again' : 'Play';
      $('#sr-total').textContent = p.games
        ? `Best score: ${p.bestScore} · Furthest wave: ${p.bestWave} · ${p.games} ${p.games === 1 ? 'game' : 'games'}`
        : '';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#sr-play').addEventListener('click', begin);
  $('#sr-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#sr-settings-home').addEventListener('click', shell.openSettings);
  $('#sr-settings').addEventListener('click', shell.openSettings);
  $('#sr-hub').addEventListener('click', shell.goHub);
  $('#sr-theme').addEventListener('click', shell.cycleTheme);
  $('#sr-restart').addEventListener('click', () => {
    const s = sim;
    // A game with a score is worth asking about before it is thrown away.
    if (!s || s.over || s.score === 0) return begin();
    pause();
    openModal(
      `<h2>Start again?</h2>
       <p>This game and its score of ${s.score} will be lost.</p>
       <div class="actions">
         <button class="btn" data-action="again">Start again</button>
         <button class="btn small secondary" data-action="keep">Keep playing</button>
       </div>`,
      (action) => {
        if (action === 'again') begin();
        else closeModal();
      },
    );
  });

  // ---------- Game ----------
  let sim: RaidersSim | null = null;
  let phase: Phase = 'ready';
  let raf = 0;
  let last = 0;
  let acc = 0;

  function begin() {
    closeModal();
    sim = new RaidersSim((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    renderer.setSim(sim);
    phase = 'ready';
    acc = 0;
    last = performance.now();
    show('game');
    setOverlay('Drag to move. Your ship fires by itself.');
    updateHud();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function setOverlay(text: string | null) {
    const o = $('#sr-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud(lostLife = false) {
    const s = sim;
    if (!s) return;
    const lives = $('#sr-lives');
    const shown = Math.max(START_LIVES, s.lives);
    lives.innerHTML = Array.from({ length: shown }, (_, i) => heartIcon(i < s.lives)).join('');
    if (lostLife) lives.children[s.lives]?.classList.add('lost');
    $('#sr-stats').innerHTML = `Score <b>${s.score}</b> · Best <b>${Math.max(progress.bestScore, s.score)}</b>`;
    $('#sr-sub').textContent = `Wave ${s.wave}`;
    $<HTMLButtonElement>('#sr-pause').disabled = phase !== 'playing';
  }

  /** Start, or carry on after a pause. */
  function go() {
    const s = sim;
    if (!s || phase === 'over' || phase === 'playing' || modalOpen()) return;
    sfx.unlock();
    phase = 'playing';
    last = performance.now();
    acc = 0;
    setOverlay(null);
    updateHud();
  }

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    setOverlay('Paused. Tap to carry on');
    updateHud();
  }
  $('#sr-pause').addEventListener('click', pause);

  function handle(ev: Events) {
    const s = sim!;
    let hud = false;
    for (const h of ev.raidersHit) renderer.raiderHit(h.x, h.y, h.row);
    if (ev.raidersHit.length) {
      sfx.blip();
      shell.vibrate(5);
      hud = true;
    }
    for (const c of ev.clashes) renderer.spark(c.x, c.y);
    for (const h of ev.shieldHits) renderer.spark(h.x, h.y);
    if (ev.saucerCame) sfx.whoosh(0.1);
    if (ev.saucerHit) {
      renderer.saucerHit(ev.saucerHit.x, ev.saucerHit.y, ev.saucerHit.points);
      sfx.ding();
      shell.vibrate([10, 30, 10]);
      hud = true;
    }
    if (ev.extraLife) {
      renderer.label(s.shipX, SHIP_Y - 1.2, '+1 life');
      sfx.ding(0.1);
      hud = true;
    }
    if (ev.waveCleared) {
      renderer.label(W / 2, 10, `Wave ${s.wave} cleared  +${WAVE_BONUS * s.wave}`);
      sfx.chime();
      shell.vibrate([20, 60, 20]);
      hud = true;
    }
    if (ev.waveStarted) {
      renderer.label(W / 2, 10, `Wave ${s.wave}`);
      hud = true;
    }
    if (ev.playerHit) {
      renderer.shipHit(s.shipX);
      sfx.thud();
      shell.vibrate([30, 40, 30]);
      updateHud(true);
      hud = false;
    }
    if (ev.gameOver) {
      phase = 'over';
      const prev = progress.bestScore;
      const best = recordRaidersGame(progress, s.score, s.wave) && s.score > 0;
      updateHud();
      setTimeout(() => showOver(s, best, prev), 900);
    }
    if (hud) updateHud();
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    const s = sim;
    if (!s) return;
    // Arrow keys move the ship smoothly.
    if (keysHeld.size && phase === 'playing') {
      const dir = (keysHeld.has(1) ? 1 : 0) - (keysHeld.has(3) ? 1 : 0);
      if (dir) s.moveShip(s.shipX + (dir * KEY_SPEED * dt) / 1000);
    }
    if (phase === 'playing') {
      if (modalOpen() || document.visibilityState !== 'visible') pause();
      else {
        acc += dt;
        const stepMs = 1000 / STEP_HZ;
        let n = 0;
        while (acc >= stepMs && n++ < MAX_STEPS && phase === 'playing') {
          acc -= stepMs;
          handle(s.step());
        }
        if (acc >= stepMs) acc = 0;
      }
    }
    renderer.draw();
  }

  // ---------- Input ----------
  // Drag anywhere to move the ship: it follows the finger's movement, so the finger never
  // has to cover it. A press starts the game; a tap carries on after a pause.
  const stage = $('#sr-stage');
  let press: { id: number; startX: number; ship: number; moved: boolean } | null = null;

  stage.addEventListener('pointerdown', (e) => {
    const s = sim;
    if (!s || phase === 'over' || modalOpen() || press) return;
    sfx.unlock();
    press = { id: e.pointerId, startX: e.clientX, ship: s.shipX, moved: false };
    if (phase === 'ready') go();
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
    if (phase !== 'playing') return;
    s.moveShip(p.ship + (e.clientX - p.startX) / renderer.unit);
  });
  const endPress = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.id !== e.pointerId) return;
    press = null;
    if (!cancelled && !p.moved && phase === 'paused') go();
  };
  stage.addEventListener('pointerup', (e) => endPress(e, false));
  stage.addEventListener('pointercancel', (e) => endPress(e, true));

  const keysHeld = new Set<number>();
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#sr-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d === 1 || d === 3) {
      e.preventDefault();
      keysHeld.add(d);
      if (phase === 'ready') go();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
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

  function showOver(s: RaidersSim, best: boolean, prev: number) {
    if (sim !== s || !$('#sr-game').classList.contains('active')) return;
    if (best) sfx.chime();
    openModal(
      `<h2>${best ? 'New best score!' : 'Game over'}</h2>
       <div class="result-line">Score <b>${s.score}</b> · Wave ${s.wave}</div>
       <p>${best ? (prev ? `Your old best was ${prev}.` : 'Your first full game.') : `Your best is ${progress.bestScore}.`}</p>
       <div class="actions">
         <button class="btn" data-action="again">Play again</button>
         <button class="btn small secondary" data-action="home">Home</button>
       </div>`,
      (action) => {
        if (action === 'again') begin();
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
  (window as unknown as { __raiders: unknown }).__raiders = {
    get sim() {
      return sim;
    },
    get phase() {
      return phase;
    },
    progress,
    go,
  };

  return {
    id: 'raiders',
    name: 'Star Raiders',
    tagline: 'Slide your ship, dodge the bolts and clear wave after wave of raiders.',
    icon: raidersLogo,
    summary: () => ({ status: progress.games ? `Best ${progress.bestScore}` : 'Start playing', stars: 0 }),
    enter: () => show('home'),
    leave: () => {
      stop();
      sim = null;
      phase = 'ready';
      press = null;
      keysHeld.clear();
      renderer.setSim(null);
    },
    resetProgress: () => resetRaiders(progress),
    modalLocked: () => false,
  };
}
