import { icons, stackLogo } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { StackSim } from './core/sim';
import { loadStack, recordTower, resetStack, StackProgress } from './game/storage';
import { StackRenderer } from './render/renderer';

export function createStack(shell: Shell): GameModule {
  const progress: StackProgress = loadStack();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'tw-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="tw-home">
    <div class="logo">${stackLogo}</div>
    <h1>Stack Tower</h1>
    <p>Tap to drop each sliding block onto the tower. Whatever hangs over the edge is cut off. How high can you go?</p>
    <button class="btn" id="tw-play">Play</button>
    <button class="btn secondary" id="tw-settings-home">Settings</button>
    <button class="btn secondary" id="tw-hub">All puzzles</button>
    <div class="total" id="tw-total"></div>
  </section>

  <section class="screen" id="tw-game">
    <header class="topbar">
      <button class="icon-btn" id="tw-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Stack Tower</b><span id="tw-sub"></span></div>
      <button class="icon-btn" id="tw-restart" aria-label="Start again">${icons.restart}</button>
      <button class="icon-btn" id="tw-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="tw-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="stats" id="tw-stats"></div>
    </div>
    <div class="stage" id="tw-stage">
      <canvas id="tw-board"></canvas>
      <div class="snake-overlay" id="tw-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#tw-board');
  const renderer = new StackRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`tw-${id}`);
    if (id === 'home') {
      stop();
      const p = progress;
      $('#tw-total').textContent = p.games ? `Best tower: ${p.best} · ${p.games} ${p.games === 1 ? 'tower' : 'towers'} built` : '';
      $('#tw-play').textContent = p.games ? 'Play again' : 'Play';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#tw-play').addEventListener('click', start);
  $('#tw-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#tw-settings-home').addEventListener('click', shell.openSettings);
  $('#tw-settings').addEventListener('click', shell.openSettings);
  $('#tw-hub').addEventListener('click', shell.goHub);
  $('#tw-theme').addEventListener('click', shell.cycleTheme);
  $('#tw-restart').addEventListener('click', () => {
    closeModal();
    start();
  });

  // ---------- Game ----------
  let sim: StackSim | null = null;
  /** When the sliding block appeared, on the same clock as event timestamps. */
  let spawnAt = 0;
  let raf = 0;
  let started = false;
  let ended = false;
  /** When the game was held still (a card open or the tab hidden), to shift the clock after. */
  let pausedAt: number | null = null;

  function start() {
    closeModal();
    show('game');
    // A new seed each tower: colours and which side each block comes from.
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    sim = new StackSim(seed);
    renderer.setSim(sim, seed % 360);
    started = false;
    ended = false;
    spawnAt = performance.now();
    setOverlay('Tap to drop the block');
    updateHud();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function setOverlay(text: string | null) {
    const o = $('#tw-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud() {
    const s = sim;
    if (!s) return;
    $('#tw-stats').innerHTML = `Height <b>${s.score}</b> · Best <b>${Math.max(progress.best, s.score)}</b>${s.streak > 1 ? ` · Perfect run <b>${s.streak}</b>` : ''}`;
    $('#tw-sub').textContent = s.perfects ? `${s.perfects} perfect` : '';
  }

  /** Time since the block appeared, in seconds, at a moment on the performance clock. */
  const since = (at: number) => Math.max(0, (at - spawnAt) / 1000);

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const s = sim;
    if (!s) return;
    // Opening a card or leaving the tab holds the block still where it is.
    if ((modalOpen() || document.visibilityState !== 'visible') && !ended) {
      renderer.draw(s.xAt(since(pausedAt ?? now)));
      pausedAt ??= now;
      return;
    }
    if (pausedAt !== null) {
      spawnAt += now - pausedAt;
      pausedAt = null;
    }
    renderer.draw(ended ? null : s.xAt(since(now)));
  }

  /** Drop the block where it was at `at` (the tap's own timestamp, not the next frame). */
  function drop(at: number) {
    const s = sim;
    if (!s || ended || modalOpen()) return;
    sfx.unlock();
    if (!started) {
      started = true;
      setOverlay(null);
    }
    const floor = s.stack.length;
    const r = s.drop(since(at));
    spawnAt = at;
    if (r.cut) renderer.drop(r.cut, floor, r.cut.x < (r.placed?.x ?? 0) ? -1 : 1);
    if (r.gameOver) {
      ended = true;
      sfx.thud();
      shell.vibrate([30, 60, 30]);
      updateHud();
      setTimeout(showOver, 900);
      return;
    }
    if (r.perfect) {
      renderer.perfect(s.streak);
      sfx.ding();
      shell.vibrate(r.grew ? [10, 30, 10] : 12);
    } else {
      sfx.blip();
      shell.vibrate(8);
    }
    updateHud();
  }

  // Tap anywhere on the board. pointerdown, so the drop happens on touch, not on release.
  $('#tw-stage').addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    drop(e.timeStamp || performance.now());
  });
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#tw-game').classList.contains('active') || modalOpen()) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!e.repeat) drop(e.timeStamp || performance.now());
    }
  });

  function showOver() {
    const s = sim;
    if (!s || !$('#tw-game').classList.contains('active')) return;
    const prev = recordTower(progress, s.score, s.perfects);
    const best = s.score > prev && s.score > 0;
    if (best) sfx.chime();
    openModal(
      `<h2>${best ? 'New best tower!' : 'Tower toppled'}</h2>
       <div class="result-line">Height <b>${s.score}</b> · ${s.perfects} perfect ${s.perfects === 1 ? 'drop' : 'drops'}</div>
       <p>${best ? (prev ? `Your old best was ${prev}.` : 'Your first tower.') : `Your best is ${progress.best}.`}</p>
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
  }).observe($('#tw-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __stack: unknown }).__stack = {
    get sim() {
      return sim;
    },
    get spawnAt() {
      return spawnAt;
    },
    progress,
  };

  return {
    id: 'stack',
    name: 'Stack Tower',
    tagline: 'Tap to drop each block. Build as high as you can.',
    icon: stackLogo,
    summary: () => ({ status: progress.games ? `Best ${progress.best}` : 'Start playing', stars: 0 }),
    enter: () => show('home'),
    leave: () => {
      stop();
      sim = null;
      renderer.setSim(null);
    },
    resetProgress: () => resetStack(progress),
    modalLocked: () => false,
  };
}
