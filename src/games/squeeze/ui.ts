import { fmt } from '../../shared/format';
import { extraIcons, icons, squeezeLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildSqueezeLevel } from './core/levels';
import { exitSide, occupancy } from './core/rules';
import { SHAPES } from './core/shapes';
import { Axis, SlideRange, slideRange } from './core/slide';
import { Side, SqueezeLevel } from './core/types';
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
    <button class="btn secondary" data-help>How to play</button>
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
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
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
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#sq-tip').textContent = level.tip ?? '';
    renderer.resize();
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
  // The block slides along one axis at a time, exactly under the finger, and stops flush
  // against whatever is in the way. It turns onto the other axis when the finger clearly
  // heads that way and the block is lined up with a cell that is free in that direction.
  // Let go and it settles into the nearest cell; pulled far enough through a gap it fits,
  // it leaves.
  interface Drag {
    pointer: number;
    block: number;
    /** Where on the block the finger took hold, in cells from its top-left. */
    gx: number;
    gy: number;
    startX: number;
    startY: number;
    /** The cell the block is lined up on, the axis it slides along, and how far along. */
    baseX: number;
    baseY: number;
    axis: Axis;
    t: number;
    range: SlideRange;
    /** Every other block's cells. */
    occ: Int16Array;
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

  const rangeFor = (d: Drag, x: number, y: number, axis: Axis) => slideRange(session!.board, session!.blocks, d.occ, d.block, x, y, axis);
  const dragPos = (d: Drag) => ({ x: d.baseX + (d.axis === 'x' ? d.t : 0), y: d.baseY + (d.axis === 'y' ? d.t : 0) });
  /** The cell the block settles into if let go now. */
  const settleCell = (d: Drag) => {
    const k = Math.round(Math.max(d.range.lo, Math.min(d.range.hi, d.t)));
    return { x: d.baseX + (d.axis === 'x' ? k : 0), y: d.baseY + (d.axis === 'y' ? k : 0) };
  };
  /** How far the block has been pulled out past an open end, and through which side. */
  const pulledOut = (d: Drag): { side: Side; by: number; at: { x: number; y: number } } | null => {
    const r = d.range;
    const end = (k: number) => ({ x: d.baseX + (d.axis === 'x' ? k : 0), y: d.baseY + (d.axis === 'y' ? k : 0) });
    if (r.exitLo && d.t < r.lo) return { side: r.exitLo, by: r.lo - d.t, at: end(r.lo) };
    if (r.exitHi && d.t > r.hi) return { side: r.exitHi, by: d.t - r.hi, at: end(r.hi) };
    return null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || drag) return;
    sfx.unlock();
    const f = fingerCell(e);
    const i = s.blockAt(Math.floor(f.x), Math.floor(f.y));
    if (i === null) return;
    const p = s.pos[i]!;
    const occ = occupancy(s.board, s.blocks, s.pos, i);
    drag = {
      pointer: e.pointerId,
      block: i,
      gx: f.x - p.x,
      gy: f.y - p.y,
      startX: p.x,
      startY: p.y,
      baseX: p.x,
      baseY: p.y,
      axis: 'x',
      t: 0,
      range: slideRange(s.board, s.blocks, occ, i, p.x, p.y, 'x'),
      occ,
      moved: false,
      bumped: false,
      downAt: performance.now(),
    };
    canvas.setPointerCapture(e.pointerId);
    renderer.drag = { block: i, x: p.x, y: p.y };
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
    const f = fingerCell(e);
    const tx = f.x - d.gx;
    const ty = f.y - d.gy;
    if (Math.hypot(tx - d.startX, ty - d.startY) > 0.2) d.moved = true;

    // Turn onto the other axis? Only from a whole cell inside the range, toward free space.
    const k = Math.round(d.t);
    if (k >= d.range.lo && k <= d.range.hi) {
      const cx = d.baseX + (d.axis === 'x' ? k : 0);
      const cy = d.baseY + (d.axis === 'y' ? k : 0);
      const along = d.axis === 'x' ? tx - cx : ty - cy;
      const cross = d.axis === 'x' ? ty - cy : tx - cx;
      const lined = Math.abs(d.t - k) < 0.35 || Math.abs(cross) > 0.75;
      if (Math.abs(cross) > Math.abs(along) + 0.25 && lined) {
        const other: Axis = d.axis === 'x' ? 'y' : 'x';
        const r = rangeFor(d, cx, cy, other);
        const free = cross < 0 ? r.lo < 0 || !!r.exitLo : r.hi > 0 || !!r.exitHi;
        if (free) {
          d.baseX = cx;
          d.baseY = cy;
          d.axis = other;
          d.t = 0;
          d.range = r;
        }
      }
    }

    // Follow the finger along the axis, flush against whatever is in the way. Past an
    // open end the block keeps going, out through the gap.
    const want = d.axis === 'x' ? tx - d.baseX : ty - d.baseY;
    const r = d.range;
    const maxOut = d.axis === 'x' ? SHAPES[session.blocks[d.block].shape].w + 1 : SHAPES[session.blocks[d.block].shape].h + 1;
    let t = want;
    if (t < r.lo) t = r.exitLo ? Math.max(t, r.lo - maxOut) : r.lo;
    if (t > r.hi) t = r.exitHi ? Math.min(t, r.hi + maxOut) : r.hi;
    d.t = t;

    // A firm push against something solid gets a bump, once per push.
    const hard = (want < r.lo - 0.3 && !r.exitLo) || (want > r.hi + 0.3 && !r.exitHi);
    if (hard && !d.bumped) {
      d.bumped = true;
      sfx.thud();
      shell.vibrate(12);
    } else if (!hard) d.bumped = false;

    renderer.drag = { block: d.block, ...dragPos(d) };
    renderer.invalidate();
  });

  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    const d = drag;
    if (!d || d.pointer !== e.pointerId) return;
    drag = null;
    renderer.glow.clear();
    const s = session;
    if (!s || cancelled) {
      renderer.drag = null;
      renderer.invalidate();
      return;
    }
    const out = pulledOut(d);
    if (out && out.by >= LEAVE_AT) {
      // The leave animation carries on from where the finger let go.
      sendOut(d.block, out.at);
      renderer.drag = null;
      return;
    }
    renderer.drag = null;
    const cell = settleCell(d);
    if (cell.x !== d.startX || cell.y !== d.startY) {
      s.commit(d.block, cell);
      sfx.blip();
      afterMove();
    } else if (!d.moved && performance.now() - d.downAt < 400) {
      // A tap on a block that can leave from right where it is sends it out.
      if (!exitSide(s.board, s.blocks, d.occ, d.block, d.startX, d.startY) || !sendOut(d.block)) renderer.shake(d.block);
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

  // Re-measure whenever the stage changes size (window resize, the tip or HUD reflowing).
  new ResizeObserver(() => {
    if (session) renderer.resize();
  }).observe($('#sq-stage'));

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
