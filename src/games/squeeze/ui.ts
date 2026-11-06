import { fmt } from '../../shared/format';
import { extraIcons, icons, squeezeLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildSqueezeLevel } from './core/levels';
import { SHAPES } from './core/shapes';
import { OUTWARD, Side, SqueezeLevel } from './core/types';
import { Session } from './game/session';
import { loadSqueeze, recordSqueezeClear, resetSqueeze, SqueezeProgress } from './game/storage';
import { SqueezeRenderer } from './render/renderer';

/** How far past the edge (in cells) a block must be pulled before letting go sends it out. */
const LEAVE_AT = 0.45;

export function createSqueeze(shell: Shell): GameModule {
  const progress: SqueezeProgress = loadSqueeze();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<SqueezeLevel>(
    buildSqueezeLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'sq-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="sq-home">
    <div class="logo">${squeezeLogo}</div>
    <h1>Squeeze</h1>
    <p>Slide the blocks out through the gaps in the frame. Each one needs a gap it fits.</p>
    <button class="btn" id="sq-play"></button>
    <button class="btn secondary" id="sq-open-levels">Levels</button>
    <button class="btn secondary" id="sq-settings-home">Settings</button>
    <button class="btn secondary" id="sq-hub">All puzzles</button>
    <div class="total" id="sq-total"></div>
  </section>

  <section class="screen" id="sq-levels">
    <div class="levels-head">
      <button class="icon-btn" id="sq-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Squeeze</h2>
    </div>
    <div class="level-grid" id="sq-grid"></div>
  </section>

  <section class="screen" id="sq-game">
    <header class="topbar">
      <button class="icon-btn" id="sq-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="sq-title"></b><span id="sq-diff"></span></div>
      <button class="icon-btn" id="sq-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="sq-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="sq-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="sq-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="sq-stats"></div>
      <div class="timer" id="sq-timer">0:00</div>
    </div>
    <p class="tip" id="sq-tip"></p>
    <div class="stage" id="sq-stage">
      <canvas id="sq-board"></canvas>
      <div class="loading" id="sq-loading" hidden>Building the board…</div>
    </div>
  </section>`;

  const renderer = new SqueezeRenderer($<HTMLCanvasElement>('#sq-board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`sq-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#sq-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#sq-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#sq-grid');
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

  $('#sq-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#sq-play').addEventListener('click', () => startLevel(progress.current));
  $('#sq-open-levels').addEventListener('click', () => show('levels'));
  $('#sq-levels-back').addEventListener('click', () => show('home'));
  $('#sq-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#sq-settings-home').addEventListener('click', shell.openSettings);
  $('#sq-settings').addEventListener('click', shell.openSettings);
  $('#sq-hub').addEventListener('click', shell.goHub);
  $('#sq-theme').addEventListener('click', shell.cycleTheme);

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
    drag = null;
    renderer.setView(null);
    $('#sq-title').textContent = `Level ${n}`;
    $('#sq-diff').textContent = '';
    $('#sq-tip').textContent = '';
    $('#sq-stats').textContent = '';
    $('#sq-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#sq-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: SqueezeLevel) {
    session = new Session(level);
    drag = null;
    const diffEl = $('#sq-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title =
      level.score !== undefined
        ? `${level.score} ${level.score === 1 ? 'block has' : 'blocks have'} to be moved out of the way in the shortest solution`
        : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    renderer.resize();
    $('#sq-tip').textContent = level.tip ?? '';
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#sq-stats').innerHTML = `Moves <b>${s.moves}</b> · Par <b>${s.level.par}</b> · Left <b>${s.left}</b>`;
    $<HTMLButtonElement>('#sq-undo').disabled = !s.canUndo || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#sq-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    if (session?.won) setTimeout(showWin, 450);
  }

  /** Send block i out, sliding first to `at` when given (still one move). */
  function sendOut(i: number, at?: { x: number; y: number }) {
    const s = session!;
    const from = at ?? s.pos[i];
    const side = s.leave(i, at);
    if (!side || !from) return false;
    renderer.leave(i, side);
    sfx.whoosh();
    shell.vibrate(15);
    afterMove();
    return true;
  }

  // ---------- Dragging ----------
  // A drag moves the block one cell at a time toward the finger, along the clear cells it
  // can reach. Pulled through a gap it fits, it leaves when let go.
  interface Drag {
    pointer: number;
    block: number;
    /** Where on the block the finger took hold, in cells from its top-left. */
    gx: number;
    gy: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    reach: Set<number>;
    exits: Map<number, Side>;
    leaving: Side | null;
    pull: number;
    moved: boolean;
    bumped: boolean;
    downAt: number;
  }
  let drag: Drag | null = null;

  const canvas = $<HTMLCanvasElement>('#sq-board');
  const fingerCell = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.toCell(e.clientX - r.left, e.clientY - r.top);
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || drag) return;
    sfx.unlock();
    const f = fingerCell(e);
    const i = s.blockAt(Math.floor(f.x), Math.floor(f.y));
    if (i === null) return;
    const p = s.pos[i]!;
    const { reach, exits } = s.options(i);
    drag = {
      pointer: e.pointerId,
      block: i,
      gx: f.x - p.x,
      gy: f.y - p.y,
      x: p.x,
      y: p.y,
      startX: p.x,
      startY: p.y,
      reach,
      exits,
      leaving: null,
      pull: 0,
      moved: false,
      bumped: false,
      downAt: performance.now(),
    };
    canvas.setPointerCapture(e.pointerId);
    renderer.drag = { block: i, dx: 0, dy: 0 };
    // Light up the gaps this block fits through.
    renderer.glow.clear();
    s.board.gaps.forEach((g, gi) => {
      const b = s.blocks[i];
      const sh = SHAPES[b.shape];
      const span = g.side === 'top' || g.side === 'bottom' ? sh.w : sh.h;
      if (span <= g.len && (g.color === null || g.color === b.color)) renderer.glow.add(gi);
    });
    renderer.invalidate();
  });

  canvas.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || d.pointer !== e.pointerId || !session) return;
    const w = session.board.w;
    const f = fingerCell(e);
    const tx = f.x - d.gx;
    const ty = f.y - d.gy;
    if (Math.hypot(tx - d.startX, ty - d.startY) > 0.2) d.moved = true;

    if (d.leaving) {
      const [o1, o2] = OUTWARD[d.leaving];
      d.pull = (tx - d.x) * o1 + (ty - d.y) * o2;
      if (d.pull < 0.25) d.leaving = null;
      else {
        renderer.drag = { block: d.block, dx: o1 * d.pull, dy: o2 * d.pull };
        renderer.invalidate();
        return;
      }
    }

    // Step toward the finger, larger distance first, while the next cell is clear.
    for (let guard = 0; guard < 32; guard++) {
      const ddx = tx - d.x;
      const ddy = ty - d.y;
      const steps: [number, number][] = [];
      if (Math.abs(ddx) >= 0.5) steps.push([Math.sign(ddx), 0]);
      if (Math.abs(ddy) >= 0.5) steps.push([0, Math.sign(ddy)]);
      if (Math.abs(ddy) > Math.abs(ddx)) steps.reverse();
      let stepped = false;
      for (const [sx, sy] of steps) {
        const nx = d.x + sx;
        const ny = d.y + sy;
        if (d.reach.has(ny * w + nx)) {
          d.x = nx;
          d.y = ny;
          stepped = true;
          break;
        }
        const side = d.exits.get(d.y * w + d.x);
        if (side && OUTWARD[side][0] === sx && OUTWARD[side][1] === sy) {
          d.leaving = side;
          break;
        }
      }
      if (!stepped || d.leaving) break;
    }

    if (d.leaving) {
      const [o1, o2] = OUTWARD[d.leaving];
      d.pull = Math.max(0, (tx - d.x) * o1 + (ty - d.y) * o2);
      renderer.drag = { block: d.block, dx: o1 * d.pull, dy: o2 * d.pull };
      if (!d.bumped) sfx.blip();
      d.bumped = true;
      renderer.invalidate();
      return;
    }

    // Let the block lean toward the finger: half a cell where it could go, a nudge where it can't.
    const lean = (delta: number, ok: boolean) => Math.max(ok ? -0.5 : -0.08, Math.min(ok ? 0.5 : 0.08, delta));
    const ddx = tx - d.x;
    const ddy = ty - d.y;
    const sx = Math.sign(ddx);
    const sy = Math.sign(ddy);
    const exitHere = d.exits.get(d.y * w + d.x);
    const okX = d.reach.has(d.y * w + d.x + sx) && d.x + sx >= 0 && d.x + sx < w || (!!exitHere && OUTWARD[exitHere][0] === sx && sx !== 0);
    const okY = d.reach.has((d.y + sy) * w + d.x) || (!!exitHere && OUTWARD[exitHere][1] === sy && sy !== 0);
    renderer.drag = { block: d.block, dx: lean(ddx, okX), dy: lean(ddy, okY) };
    // A firm push against something solid gets a bump, once per push.
    const hard = (Math.abs(ddx) > 0.7 && !okX) || (Math.abs(ddy) > 0.7 && !okY);
    if (hard && !d.bumped) {
      d.bumped = true;
      sfx.thud();
      shell.vibrate(12);
    } else if (!hard && Math.abs(ddx) < 0.3 && Math.abs(ddy) < 0.3) d.bumped = false;
    renderer.invalidate();
  });

  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    const d = drag;
    if (!d || d.pointer !== e.pointerId) return;
    drag = null;
    renderer.drag = null;
    renderer.glow.clear();
    const s = session;
    if (!s || cancelled) {
      renderer.invalidate();
      return;
    }
    if (d.leaving && d.pull >= LEAVE_AT) {
      // The block carries on out from where the finger left it.
      renderer.drag = { block: d.block, dx: 0, dy: 0 };
      sendOut(d.block, { x: d.x, y: d.y });
      renderer.drag = null;
      return;
    }
    if (d.x !== d.startX || d.y !== d.startY) {
      s.commit(d.block, { x: d.x, y: d.y });
      sfx.blip();
      afterMove();
    } else if (!d.moved && performance.now() - d.downAt < 400) {
      // A tap on a block that can leave from right where it is sends it out.
      if (!d.exits.has(d.y * s.board.w + d.x) || !sendOut(d.block)) renderer.shake(d.block);
    }
    renderer.invalidate();
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  $('#sq-undo').addEventListener('click', () => {
    const s = session;
    if (!s || !s.undo()) return;
    renderer.snap();
    sfx.blip();
    updateHud();
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#sq-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestMoves, prev } = recordSqueezeClear(progress, s.level.number, stars, s.moves, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note = stars < 3 ? `<p>Clear it in ${s.level.par} moves or fewer for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number} cleared</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.moves} moves (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
           newBestMoves ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${prev!.bestMoves} moves`
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

  window.addEventListener('resize', () => {
    if (session) renderer.resize();
  });

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
  (window as unknown as { __squeeze: unknown }).__squeeze = {
    get session() {
      return session;
    },
    renderer,
    progress,
    /** Play one solver move: a block to a cell, or out (to = null). */
    play(block: number, to: { x: number; y: number } | null) {
      const s = session;
      if (!s) return false;
      if (to) {
        const ok = s.commit(block, to);
        if (ok) afterMove();
        renderer.invalidate();
        return ok;
      }
      const k = [...s.options(block).exits.keys()][0];
      if (k === undefined) return false;
      return sendOut(block, { x: k % s.board.w, y: (k / s.board.w) | 0 });
    },
  };

  return {
    id: 'squeeze',
    name: 'Squeeze',
    tagline: 'Slide every block out through a gap it fits.',
    icon: squeezeLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      session = null;
      drag = null;
      renderer.setView(null);
    },
    resetProgress: () => resetSqueeze(progress),
    modalLocked: () => winShown,
  };
}
