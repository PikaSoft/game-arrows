import { gliderLogo, icons, pauseIcon } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { GliderSim, STEP_HZ } from './core/sim';
import { GliderProgress, loadGlider, recordFlight, resetGlider } from './game/storage';
import { GliderRenderer } from './render/renderer';

type Phase = 'ready' | 'running' | 'paused' | 'over';

export const FIRST_TIP = 'Hold anywhere to climb, let go to sink. Hold to start.';

export function createGlider(shell: Shell): GameModule {
  const progress: GliderProgress = loadGlider();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'cg-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="cg-home">
    <div class="logo">${gliderLogo}</div>
    <h1>Cave Glider</h1>
    <p>Fly as far as you can through a winding cave. Hold anywhere to climb, let go to sink, and don't touch the walls.</p>
    <button class="btn" id="cg-play">Fly</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="cg-settings-home">Settings</button>
    <button class="btn secondary" id="cg-hub">All puzzles</button>
    <div class="total" id="cg-total"></div>
  </section>

  <section class="screen" id="cg-game">
    <header class="topbar">
      <button class="icon-btn" id="cg-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Cave Glider</b><span id="cg-sub"></span></div>
      <button class="icon-btn" id="cg-restart" aria-label="Start again">${icons.restart}</button>
      <button class="icon-btn" id="cg-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="cg-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="stats" id="cg-stats"></div>
      <button class="icon-btn" id="cg-pause" aria-label="Pause">${pauseIcon}</button>
    </div>
    <div class="stage" id="cg-stage">
      <canvas id="cg-board"></canvas>
      <div class="snake-overlay" id="cg-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const renderer = new GliderRenderer($<HTMLCanvasElement>('#cg-board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`cg-${id}`);
    if (id === 'home') {
      stop();
      const p = progress;
      $('#cg-total').textContent = p.runs ? `Best flight: ${p.best} m · most gems ${p.bestGems} · ${p.gems} gems collected` : '';
      $('#cg-play').textContent = p.runs ? 'Fly again' : 'Fly';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#cg-play').addEventListener('click', start);
  $('#cg-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#cg-settings-home').addEventListener('click', shell.openSettings);
  $('#cg-settings').addEventListener('click', shell.openSettings);
  $('#cg-hub').addEventListener('click', shell.goHub);
  $('#cg-theme').addEventListener('click', shell.cycleTheme);
  $('#cg-restart').addEventListener('click', () => {
    closeModal();
    start();
  });

  // ---------- Game ----------
  let sim: GliderSim | null = null;
  let phase: Phase = 'ready';
  let raf = 0;
  let last = 0;
  let acc = 0;

  function start() {
    closeModal();
    show('game');
    sim = new GliderSim((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    renderer.setSim(sim);
    phase = 'ready';
    acc = 0;
    setOverlay(progress.runs ? 'Hold to start' : FIRST_TIP);
    updateHud();
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function setOverlay(text: string | null) {
    const o = $('#cg-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud() {
    const s = sim;
    if (!s) return;
    $('#cg-stats').innerHTML = `<b>${s.metres}</b> m · Gems <b>${s.gems}</b> · Best <b>${Math.max(progress.best, s.metres)}</b> m`;
    $('#cg-sub').textContent = phase === 'running' ? `${s.speed.toFixed(1)} m/s` : '';
    $<HTMLButtonElement>('#cg-pause').disabled = phase !== 'running';
  }

  function go() {
    if (!sim || phase === 'over' || modalOpen()) return;
    sfx.unlock();
    if (phase === 'ready' || phase === 'paused') {
      phase = 'running';
      last = performance.now();
      setOverlay(null);
      updateHud();
    }
  }

  function pause() {
    if (phase !== 'running') return;
    phase = 'paused';
    sim?.hold(false);
    setOverlay('Paused. Hold to carry on');
    updateHud();
  }
  $('#cg-pause').addEventListener('click', pause);

  let hudTick = 0;
  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    const s = sim;
    if (!s) return;
    if (phase === 'running') {
      if (modalOpen() || document.visibilityState !== 'visible') pause();
      else {
        acc += dt;
        const stepMs = 1000 / STEP_HZ;
        while (acc >= stepMs && phase === 'running') {
          acc -= stepMs;
          const ev = s.step();
          for (const g of ev.gems) {
            renderer.gem(g.x, g.y);
            sfx.ding();
            shell.vibrate(5);
          }
          if (ev.crashed) {
            phase = 'over';
            holders.clear();
            renderer.crash();
            sfx.thud();
            shell.vibrate([40, 40, 40]);
            setTimeout(showOver, 800);
          }
        }
        if (++hudTick % 6 === 0) updateHud();
      }
    }
    renderer.draw();
  }

  // ---------- Input ----------
  // One input: press and hold anywhere on the board (or Space, Up or W) to climb; let go
  // to sink. The first press starts the flight.
  const holders = new Set<number | string>();
  function setHold(id: number | string, on: boolean) {
    if (on) holders.add(id);
    else holders.delete(id);
    const s = sim;
    if (!s) return;
    if (on && phase !== 'running' && phase !== 'over' && !modalOpen()) go();
    s.hold(holders.size > 0 && phase === 'running');
  }
  const stage = $('#cg-stage');
  stage.addEventListener('pointerdown', (e) => {
    if (!sim || modalOpen()) return;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    setHold(e.pointerId, true);
  });
  const release = (e: PointerEvent) => setHold(e.pointerId, false);
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  const HOLD_KEYS = [' ', 'ArrowUp', 'w', 'W'];
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#cg-game').classList.contains('active') || modalOpen()) return;
    if (HOLD_KEYS.includes(e.key)) {
      e.preventDefault();
      if (!e.repeat) setHold(`key:${e.key.toLowerCase()}`, true);
    } else if (e.key === 'p' || e.key === 'P') pause();
  });
  document.addEventListener('keyup', (e) => {
    if (HOLD_KEYS.includes(e.key)) setHold(`key:${e.key.toLowerCase()}`, false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function showOver() {
    const s = sim;
    if (!s || !$('#cg-game').classList.contains('active')) return;
    const prev = recordFlight(progress, s.metres, s.gems);
    const best = s.metres > prev && s.metres > 0;
    if (best) sfx.chime();
    openModal(
      `<h2>${best ? 'New best flight!' : 'Crashed'}</h2>
       <div class="result-line"><b>${s.metres}</b> m · ${s.gems} ${s.gems === 1 ? 'gem' : 'gems'}</div>
       <p>${best ? (prev ? `Your old best was ${prev} m.` : 'Your first flight.') : `Your best is ${progress.best} m.`}</p>
       <div class="actions">
         <button class="btn" data-action="again">Fly again</button>
         <button class="btn small secondary" data-action="home">Home</button>
       </div>`,
      (action) => {
        if (action === 'again') start();
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
  }).observe($('#cg-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __glider: unknown }).__glider = {
    get sim() {
      return sim;
    },
    get phase() {
      return phase;
    },
    progress,
  };

  return {
    id: 'glider',
    name: 'Cave Glider',
    tagline: 'Hold to climb, let go to sink. How far can you fly?',
    icon: gliderLogo,
    summary: () => ({ status: progress.runs ? `Best ${progress.best} m` : 'Start playing', stars: 0 }),
    enter: () => show('home'),
    leave: () => {
      stop();
      sim = null;
      renderer.setSim(null);
    },
    resetProgress: () => resetGlider(progress),
    modalLocked: () => false,
  };
}
