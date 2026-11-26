import { fallLogo, icons, pauseIcon } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { FallSim, LockResult } from './core/sim';
import { FallProgress, loadFall, recordGame, resetFall } from './game/storage';
import { FallRenderer } from './render/renderer';

type Phase = 'ready' | 'running' | 'paused' | 'over';

export const FIRST_TIP = 'Drag sideways to move, tap to turn, drag down to drop faster, flick down to drop at once. Tap to start.';

/** Finger speed (CSS px per ms) and distance that make a flick. */
const FLICK_SPEED = 1.1;
const FLICK_PX = 36;

const CLEAR_WORDS = ['', 'Single', 'Double', 'Triple', 'Four rows!'];

export function createFall(shell: Shell): GameModule {
  const progress: FallProgress = loadFall();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'bf-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="bf-home">
    <div class="logo">${fallLogo}</div>
    <h1>Block Fall</h1>
    <p>Steer falling pieces of four blocks into the well. Fill a row from side to side and it clears. The pieces come faster as you go.</p>
    <button class="btn" id="bf-play">Play</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="bf-settings-home">Settings</button>
    <button class="btn secondary" id="bf-hub">All puzzles</button>
    <div class="total" id="bf-total"></div>
  </section>

  <section class="screen" id="bf-game">
    <header class="topbar">
      <button class="icon-btn" id="bf-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Block Fall</b><span id="bf-sub"></span></div>
      <button class="icon-btn" id="bf-restart" aria-label="Start again">${icons.restart}</button>
      <button class="icon-btn" id="bf-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="bf-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="stats" id="bf-stats"></div>
      <button class="icon-btn" id="bf-pause" aria-label="Pause">${pauseIcon}</button>
    </div>
    <div class="stage" id="bf-stage">
      <canvas id="bf-board"></canvas>
      <div class="snake-overlay" id="bf-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const renderer = new FallRenderer($<HTMLCanvasElement>('#bf-board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.draw();
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`bf-${id}`);
    if (id === 'home') {
      stop();
      const p = progress;
      $('#bf-total').textContent = p.runs ? `Best score: ${p.best} · most rows ${p.bestLines} · highest level ${p.bestLevel}` : '';
      $('#bf-play').textContent = p.runs ? 'Play again' : 'Play';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#bf-play').addEventListener('click', start);
  $('#bf-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#bf-settings-home').addEventListener('click', shell.openSettings);
  $('#bf-settings').addEventListener('click', shell.openSettings);
  $('#bf-hub').addEventListener('click', shell.goHub);
  $('#bf-theme').addEventListener('click', shell.cycleTheme);
  $('#bf-restart').addEventListener('click', () => {
    closeModal();
    start();
  });

  // ---------- Game ----------
  let sim: FallSim | null = null;
  let phase: Phase = 'ready';
  let raf = 0;
  let last = 0;

  function start() {
    closeModal();
    show('game');
    sim = new FallSim((Math.random() * 2 ** 32) >>> 0);
    renderer.setSim(sim);
    phase = 'ready';
    setOverlay(progress.runs ? 'Tap to start' : FIRST_TIP);
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
    const o = $('#bf-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function updateHud() {
    const s = sim;
    if (!s) return;
    $('#bf-stats').innerHTML = `<b>${s.score}</b> · Rows <b>${s.lines}</b> · Level <b>${s.level}</b> · Best <b>${Math.max(progress.best, s.score)}</b>`;
    $('#bf-sub').textContent = `Level ${s.level}`;
    $<HTMLButtonElement>('#bf-pause').disabled = phase !== 'running';
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
  $('#bf-pause').addEventListener('click', pause);

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    const s = sim;
    if (!s) return;
    if (phase === 'running') {
      if (modalOpen() || document.visibilityState !== 'visible') pause();
      else {
        const ev = s.step(dt);
        if (ev.lock) locked(ev.lock);
      }
    }
    renderer.draw();
  }

  /** Sounds, toasts and the end of the game after a piece locks. */
  function locked(r: LockResult) {
    const s = sim!;
    const n = r.rows.length;
    if (n) {
      sfx.ding();
      if (n === 4) sfx.chime();
      shell.vibrate(n === 4 ? [20, 30, 20] : 15);
      const words = [CLEAR_WORDS[n]];
      if (r.backToBack) words.push('back to back');
      if (r.combo > 0) words.push(`combo ${r.combo}`);
      if (n === 4 || r.backToBack || r.combo > 0) shell.toast(`${words.join(', ')} +${r.points}`);
    } else sfx.thud();
    if (r.levelUp) {
      sfx.chime();
      shell.toast(`Level ${s.level}: the pieces fall faster`);
    }
    if (r.over) {
      phase = 'over';
      shell.vibrate([40, 40, 40]);
      setTimeout(showOver, 700);
    }
    updateHud();
  }

  /** Run a move if the game is going; the first touch or key starts it instead. */
  function act(fn: (s: FallSim) => void) {
    const s = sim;
    if (!s || phase === 'over' || modalOpen()) return;
    if (phase !== 'running') {
      go();
      return;
    }
    fn(s);
    renderer.draw();
  }
  const moveBy = (dx: number) =>
    act((s) => {
      if (s.move(dx)) sfx.blip();
    });
  const turn = (dir: 1 | -1) =>
    act((s) => {
      if (s.rotate(dir)) sfx.blip();
    });
  const soft = () =>
    act((s) => {
      if (s.softDrop()) updateHud();
    });
  const hard = () =>
    act((s) => {
      const r = s.hardDrop();
      if (r) locked(r);
    });
  const hold = () =>
    act((s) => {
      if (s.holdPiece()) sfx.whoosh(0.12);
    });

  // ---------- Touch ----------
  // Drag sideways: one column per cell of finger travel. Drag down: one row per cell.
  // A quick flick down drops at once; a quick flick up holds. A tap turns the piece
  // (anticlockwise on the left third of the stage). The first sideways or downward step
  // fixes the drag to that direction, so a sideways drag never drops the piece.
  const stage = $('#bf-stage');
  let press: { id: number; x: number; y: number; ax: number; ay: number; t: number; axis: '' | 'x' | 'y'; moved: boolean; done: boolean; hist: { y: number; t: number }[] } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (press) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY, t: e.timeStamp, axis: '', moved: false, done: false, hist: [{ y: e.clientY, t: e.timeStamp }] };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const p = press;
    if (!p || p.id !== e.pointerId || p.done) return;
    p.hist.push({ y: e.clientY, t: e.timeStamp });
    while (p.hist.length > 2 && e.timeStamp - p.hist[0].t > 80) p.hist.shift();
    if (phase !== 'running') {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) p.moved = true;
      return;
    }
    const k = renderer.k;
    // Flicks: fast and far enough, mostly up or down.
    const v = (e.clientY - p.hist[0].y) / Math.max(1, e.timeStamp - p.hist[0].t);
    const dy = e.clientY - p.y;
    const dxAll = Math.abs(e.clientX - p.x);
    if (p.axis !== 'x' && Math.abs(dy) > FLICK_PX && Math.abs(dy) > dxAll * 1.5) {
      if (v > FLICK_SPEED) {
        p.done = p.moved = true;
        hard();
        return;
      }
      if (v < -FLICK_SPEED) {
        p.done = p.moved = true;
        hold();
        return;
      }
    }
    if (p.axis !== 'y') {
      while (Math.abs(e.clientX - p.ax) >= k) {
        const dir = Math.sign(e.clientX - p.ax);
        p.ax += dir * k;
        p.axis = 'x';
        p.moved = true;
        moveBy(dir);
      }
    }
    if (p.axis !== 'x') {
      while (e.clientY - p.ay >= k) {
        p.ay += k;
        p.axis = 'y';
        p.moved = true;
        soft();
      }
    }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) p.moved = true;
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.id !== e.pointerId) return;
    press = null;
    if (cancelled || p.moved) return;
    if (phase !== 'running') {
      go();
      return;
    }
    const r = stage.getBoundingClientRect();
    turn(e.clientX - r.left < r.width / 3 ? -1 : 1);
  };
  stage.addEventListener('pointerup', (e) => end(e, false));
  stage.addEventListener('pointercancel', (e) => end(e, true));

  // ---------- Keys ----------
  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#bf-game').classList.contains('active') || modalOpen()) return;
    const k = e.key;
    let used = true;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') moveBy(-1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') moveBy(1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') soft();
    else if (e.repeat) used = k === ' ' || k === 'ArrowUp';
    else if (k === 'ArrowUp' || k === 'x' || k === 'X' || k === 'w' || k === 'W') turn(1);
    else if (k === 'z' || k === 'Z') turn(-1);
    else if (k === ' ') hard();
    else if (k === 'c' || k === 'C' || k === 'Shift') hold();
    else if (k === 'p' || k === 'P') pause();
    else used = false;
    if (used) e.preventDefault();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function showOver() {
    const s = sim;
    if (!s || !$('#bf-game').classList.contains('active')) return;
    const prev = recordGame(progress, s.score, s.lines, s.level);
    const best = s.score > prev && s.score > 0;
    if (best) sfx.chime();
    openModal(
      `<h2>${best ? 'New best score!' : 'Game over'}</h2>
       <div class="result-line"><b>${s.score}</b> points · level ${s.level}</div>
       <p>${s.lines} ${s.lines === 1 ? 'row' : 'rows'} cleared from ${s.pieces} pieces. ${best ? (prev ? `Your old best was ${prev}.` : 'Your first game.') : `Your best is ${progress.best}.`}</p>
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
  }).observe(stage);

  // Hook for automated browser tests.
  (window as unknown as { __fall: unknown }).__fall = {
    get sim() {
      return sim;
    },
    get phase() {
      return phase;
    },
    progress,
  };

  return {
    id: 'fall',
    name: 'Block Fall',
    tagline: 'Steer falling blocks; full rows clear.',
    icon: fallLogo,
    summary: () => ({ status: progress.runs ? `Best ${progress.best} · ${progress.bestLines} rows` : 'Start playing', stars: 0 }),
    enter: () => show('home'),
    leave: () => {
      stop();
      sim = null;
      renderer.setSim(null);
    },
    resetProgress: () => resetFall(progress),
    modalLocked: () => false,
  };
}
