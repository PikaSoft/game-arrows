import { icons, lanesLogo, pauseIcon } from '../../shared/icons';
import { attachSwipe, keyDir } from '../snake/input/swipe';
import { GameModule, Shell } from '../types';
import { LanesSim, STEP_HZ } from './core/sim';
import { LanesProgress, loadLanes, recordRun, resetLanes } from './game/storage';
import { LanesRenderer } from './render/renderer';

type Phase = 'ready' | 'running' | 'paused' | 'over';

export function createLanes(shell: Shell): GameModule {
  const progress: LanesProgress = loadLanes();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'ld-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="ld-home">
    <div class="logo">${lanesLogo}</div>
    <h1>Lane Dodger</h1>
    <p>Run as far as you can. Swipe left or right to change lanes, and swipe up to jump the low hurdles.</p>
    <button class="btn" id="ld-play">Run</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="ld-settings-home">Settings</button>
    <button class="btn secondary" id="ld-hub">All puzzles</button>
    <div class="total" id="ld-total"></div>
  </section>

  <section class="screen" id="ld-game">
    <header class="topbar">
      <button class="icon-btn" id="ld-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Lane Dodger</b><span id="ld-sub"></span></div>
      <button class="icon-btn" id="ld-restart" aria-label="Start again">${icons.restart}</button>
      <button class="icon-btn" id="ld-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="ld-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="stats" id="ld-stats"></div>
      <button class="icon-btn" id="ld-pause" aria-label="Pause">${pauseIcon}</button>
    </div>
    <div class="stage" id="ld-stage">
      <canvas id="ld-board"></canvas>
      <div class="snake-overlay" id="ld-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const renderer = new LanesRenderer($<HTMLCanvasElement>('#ld-board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`ld-${id}`);
    if (id === 'home') {
      stop();
      const p = progress;
      $('#ld-total').textContent = p.runs ? `Best run: ${p.best} m · ${p.coins} coins collected` : '';
      $('#ld-play').textContent = p.runs ? 'Run again' : 'Run';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#ld-play').addEventListener('click', start);
  $('#ld-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#ld-settings-home').addEventListener('click', shell.openSettings);
  $('#ld-settings').addEventListener('click', shell.openSettings);
  $('#ld-hub').addEventListener('click', shell.goHub);
  $('#ld-theme').addEventListener('click', shell.cycleTheme);
  $('#ld-restart').addEventListener('click', () => {
    closeModal();
    start();
  });

  // ---------- Game ----------
  let sim: LanesSim | null = null;
  let phase: Phase = 'ready';
  let raf = 0;
  let last = 0;
  let acc = 0;

  function start() {
    closeModal();
    show('game');
    sim = new LanesSim((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    renderer.setSim(sim);
    phase = 'ready';
    acc = 0;
    setOverlay('Swipe or tap to start');
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
    const o = $('#ld-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud() {
    const s = sim;
    if (!s) return;
    $('#ld-stats').innerHTML = `<b>${s.metres}</b> m · Coins <b>${s.coins}</b> · Best <b>${Math.max(progress.best, s.metres)}</b> m`;
    $('#ld-sub').textContent = phase === 'running' ? `${s.speed.toFixed(1)} m/s` : '';
    $<HTMLButtonElement>('#ld-pause').disabled = phase !== 'running';
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
    setOverlay('Paused. Tap to carry on');
    updateHud();
  }
  $('#ld-pause').addEventListener('click', pause);

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
          if (ev.coins) {
            renderer.coin(s.lane, s.distance);
            sfx.ding();
            shell.vibrate(5);
          }
          if (ev.crashed) {
            phase = 'over';
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
  // Swipe left or right to change lanes, up to jump. A swipe or tap also starts the run.
  function steer(d: number) {
    const s = sim;
    if (!s || phase === 'over' || modalOpen()) return;
    if (phase !== 'running') {
      go();
      return;
    }
    if (d === 1 || d === 3) {
      if (s.move(d === 1 ? 1 : -1)) {
        sfx.blip();
        shell.vibrate(4);
      }
    } else if (d === 0 && s.jump()) sfx.whoosh(0.12);
  }
  attachSwipe($('#ld-stage'), steer, go);
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#ld-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d !== undefined) {
      e.preventDefault();
      steer(d);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (phase === 'running') steer(0);
      else go();
    } else if (e.key === 'p' || e.key === 'P') pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function showOver() {
    const s = sim;
    if (!s || !$('#ld-game').classList.contains('active')) return;
    const prev = recordRun(progress, s.metres, s.coins);
    const best = s.metres > prev && s.metres > 0;
    if (best) sfx.chime();
    openModal(
      `<h2>${best ? 'New best run!' : 'Crashed'}</h2>
       <div class="result-line"><b>${s.metres}</b> m · ${s.coins} ${s.coins === 1 ? 'coin' : 'coins'}</div>
       <p>${best ? (prev ? `Your old best was ${prev} m.` : 'Your first run.') : `Your best is ${progress.best} m.`}</p>
       <div class="actions">
         <button class="btn" data-action="again">Run again</button>
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
  }).observe($('#ld-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __lanes: unknown }).__lanes = {
    get sim() {
      return sim;
    },
    get phase() {
      return phase;
    },
    progress,
  };

  return {
    id: 'lanes',
    name: 'Lane Dodger',
    tagline: 'Swipe between lanes and jump hurdles. How far can you run?',
    icon: lanesLogo,
    summary: () => ({ status: progress.runs ? `Best ${progress.best} m` : 'Start playing', stars: 0 }),
    enter: () => show('home'),
    leave: () => {
      stop();
      sim = null;
      renderer.setSim(null);
    },
    resetProgress: () => resetLanes(progress),
    modalLocked: () => false,
  };
}
