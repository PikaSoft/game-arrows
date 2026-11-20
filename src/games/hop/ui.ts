import { hopLogo, icons, pauseIcon } from '../../shared/icons';
import { attachSwipe, keyDir } from '../snake/input/swipe';
import { GameModule, Shell } from '../types';
import { NEST_COLS } from './core/lanes';
import { Cause, Dir, HopSim, LIFE_TIME, START_LIVES, STEP_HZ } from './core/sim';
import { HopProgress, loadHop, recordGame, resetHop } from './game/storage';
import { HopRenderer } from './render/renderer';

type Phase = 'ready' | 'running' | 'paused' | 'over';

export const FIRST_TIP = 'Swipe or use the arrow keys to hop. A tap hops forward. Swipe to start.';

const CAUSE: Record<Cause, string> = {
  car: 'Squashed!',
  water: 'Splash!',
  edge: 'Swept away!',
  bank: 'Missed the nest!',
  time: 'Out of time!',
};

export function createHop(shell: Shell): GameModule {
  const progress: HopProgress = loadHop();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'ha-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="ha-home">
    <div class="logo">${hopLogo}</div>
    <h1>Hop Across</h1>
    <p>Hop a chick over the busy road and along the logs in the stream, and fill every nest on the far bank.</p>
    <button class="btn" id="ha-play">Play</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="ha-settings-home">Settings</button>
    <button class="btn secondary" id="ha-hub">All puzzles</button>
    <div class="total" id="ha-total"></div>
  </section>

  <section class="screen" id="ha-game">
    <header class="topbar">
      <button class="icon-btn" id="ha-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Hop Across</b><span id="ha-sub"></span></div>
      <button class="icon-btn" id="ha-restart" aria-label="Start again">${icons.restart}</button>
      <button class="icon-btn" id="ha-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="ha-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="stats" id="ha-stats"></div>
      <button class="icon-btn" id="ha-pause" aria-label="Pause">${pauseIcon}</button>
    </div>
    <div class="hop-time" aria-hidden="true"><i id="ha-time"></i></div>
    <div class="stage" id="ha-stage">
      <canvas id="ha-board"></canvas>
      <div class="snake-overlay" id="ha-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const renderer = new HopRenderer($<HTMLCanvasElement>('#ha-board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`ha-${id}`);
    if (id === 'home') {
      stop();
      const p = progress;
      $('#ha-total').textContent = p.runs ? `Best score: ${p.best} · furthest level ${p.bestLevel} · ${p.homes} nests filled` : '';
      $('#ha-play').textContent = p.runs ? 'Play again' : 'Play';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#ha-play').addEventListener('click', start);
  $('#ha-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#ha-settings-home').addEventListener('click', shell.openSettings);
  $('#ha-settings').addEventListener('click', shell.openSettings);
  $('#ha-hub').addEventListener('click', shell.goHub);
  $('#ha-theme').addEventListener('click', shell.cycleTheme);
  $('#ha-restart').addEventListener('click', () => {
    closeModal();
    start();
  });

  // ---------- Game ----------
  let sim: HopSim | null = null;
  let phase: Phase = 'ready';
  let raf = 0;
  let last = 0;
  let acc = 0;

  function start() {
    closeModal();
    show('game');
    sim = new HopSim(1);
    seenHops = 0;
    renderer.setSim(sim);
    phase = 'ready';
    acc = 0;
    setOverlay(progress.runs ? 'Swipe or tap to start' : FIRST_TIP);
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
    const o = $('#ha-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud() {
    const s = sim;
    if (!s) return;
    const hearts = '♥'.repeat(Math.max(0, s.lives)) + '♡'.repeat(Math.max(0, START_LIVES - s.lives));
    $('#ha-stats').innerHTML = `<b>${s.score}</b> · Level <b>${s.level}</b> · <span class="hop-lives" aria-label="${s.lives} lives">${hearts}</span> · Best <b>${Math.max(progress.best, s.score)}</b>`;
    $('#ha-sub').textContent = `${s.nests.filter(Boolean).length} of ${s.nests.length} nests`;
    $<HTMLButtonElement>('#ha-pause').disabled = phase !== 'running';
    const left = s.wait > 0 ? 1 : Math.max(0, s.clock / LIFE_TIME);
    const bar = $('#ha-time');
    bar.style.width = `${left * 100}%`;
    bar.classList.toggle('low', left < 0.25);
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
  $('#ha-pause').addEventListener('click', pause);

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
          const waiting = s.wait > 0;
          const ev = s.step();
          if (waiting && s.wait === 0) renderer.respawn();
          if (ev.hopped) seeHops();
          if (ev.nest !== null) {
            renderer.home(NEST_COLS[ev.nest]);
            sfx.ding();
            shell.vibrate(12);
          }
          if (ev.levelUp) {
            sfx.chime();
            shell.toast(`Level ${s.level}: everything moves a little faster`);
          }
          if (ev.died) {
            renderer.lost(ev.died === 'water' || ev.died === 'edge');
            sfx.thud();
            shell.vibrate([40, 40, 40]);
            if (!ev.over) shell.toast(CAUSE[ev.died]);
          }
          if (ev.over) {
            phase = 'over';
            updateHud();
            setTimeout(showOver, 900);
          }
        }
        if (++hudTick % 4 === 0) updateHud();
      }
    }
    renderer.draw();
  }

  // ---------- Input ----------
  // Swipe (or arrow keys, WASD) to hop that way; a tap hops forward. The first one starts.
  // One swipe is one hop: a long drag doesn't keep hopping.
  function hop(d: Dir) {
    const s = sim;
    if (!s || phase === 'over' || modalOpen()) return;
    if (phase !== 'running') {
      go();
      return;
    }
    s.hop(d);
    seeHops();
  }
  /** Turn the chick and play the hop sound for any hop made since the last look. */
  let seenHops = 0;
  function seeHops() {
    const s = sim;
    if (!s || s.hops === seenHops) return;
    seenHops = s.hops;
    renderer.hop(s.lastDir);
    sfx.blip();
  }
  attachSwipe($('#ha-stage'), (d) => hop(d as Dir), () => hop(0), { once: true });
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#ha-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d !== undefined) {
      e.preventDefault();
      if (!e.repeat) hop(d as Dir);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) hop(0);
    } else if (e.key === 'p' || e.key === 'P') pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function showOver() {
    const s = sim;
    if (!s || !$('#ha-game').classList.contains('active')) return;
    const prev = recordGame(progress, s.score, s.level, s.homes);
    const best = s.score > prev && s.score > 0;
    if (best) sfx.chime();
    const cause = s.lastCause ? CAUSE[s.lastCause] : '';
    openModal(
      `<h2>${best ? 'New best score!' : 'Game over'}</h2>
       <div class="result-line"><b>${s.score}</b> points · level ${s.level}</div>
       <p>${cause} ${s.homes} ${s.homes === 1 ? 'nest' : 'nests'} filled. ${best ? (prev ? `Your old best was ${prev}.` : 'Your first game.') : `Your best is ${progress.best}.`}</p>
       <div class="actions">
         <button class="btn" data-action="again">Play again</button>
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
  }).observe($('#ha-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __hop: unknown }).__hop = {
    get sim() {
      return sim;
    },
    get phase() {
      return phase;
    },
    progress,
  };

  return {
    id: 'hop',
    name: 'Hop Across',
    tagline: 'Hop over the road and along the logs to fill every nest.',
    icon: hopLogo,
    summary: () => ({ status: progress.runs ? `Best ${progress.best} · level ${progress.bestLevel}` : 'Start playing', stars: 0 }),
    enter: () => show('home'),
    leave: () => {
      stop();
      sim = null;
      renderer.setSim(null);
    },
    resetProgress: () => resetHop(progress),
    modalLocked: () => false,
  };
}
