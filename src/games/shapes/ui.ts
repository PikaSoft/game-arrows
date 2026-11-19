import { extraIcons, icons, shapesLogo } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { SavedGame, ShapeGame, SIZE } from './core/game';
import { PIECES } from './core/pieces';
import { loadShapes, noteBests, recordGame, resetShapes, saveShapes, ShapesProgress } from './game/storage';
import { ShapesRenderer } from './render/renderer';

export const FIRST_TIP = 'Drag a piece onto the board. Fill a whole row or column to clear it. The game ends when no piece fits.';

export function createShapes(shell: Shell): GameModule {
  const progress: ShapesProgress = loadShapes();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'sf-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="sf-home">
    <div class="logo">${shapesLogo}</div>
    <h1>Shape Fit</h1>
    <p>Drag pieces onto the board. Full rows and columns clear. Keep going until nothing fits.</p>
    <button class="btn" id="sf-continue" hidden>Continue</button>
    <button class="btn" id="sf-new">New game</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="sf-settings-home">Settings</button>
    <button class="btn secondary" id="sf-hub">All puzzles</button>
    <div class="total" id="sf-total"></div>
  </section>

  <section class="screen" id="sf-game">
    <header class="topbar">
      <button class="icon-btn" id="sf-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Shape Fit</b><span id="sf-sub"></span></div>
      <button class="icon-btn" id="sf-restart" aria-label="New game">${icons.restart}</button>
      <button class="icon-btn" id="sf-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="sf-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="sf-undo" aria-label="Undo (once per game)">${extraIcons.undo}<span class="badge" id="sf-undo-count"></span></button>
      <div class="stats" id="sf-stats"></div>
    </div>
    <p class="tip" id="sf-tip"></p>
    <div class="stage" id="sf-stage">
      <canvas id="sf-board"></canvas>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#sf-board');
  const renderer = new ShapesRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`sf-${id}`);
    if (id === 'home') {
      const p = progress;
      $<HTMLButtonElement>('#sf-continue').hidden = !p.saved;
      $('#sf-new').className = p.saved ? 'btn secondary' : 'btn';
      $('#sf-total').textContent = p.games || p.bestScore ? `Best score ${p.bestScore} · most lines ${p.bestLines} · ${p.games} ${p.games === 1 ? 'game' : 'games'} played` : '';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#sf-continue').addEventListener('click', () => begin(progress.saved));
  $('#sf-new').addEventListener('click', () => begin(null));
  $('#sf-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#sf-settings-home').addEventListener('click', shell.openSettings);
  $('#sf-settings').addEventListener('click', shell.openSettings);
  $('#sf-hub').addEventListener('click', shell.goHub);
  $('#sf-theme').addEventListener('click', shell.cycleTheme);
  $('#sf-restart').addEventListener('click', () => {
    const g = game;
    if (!g || g.placed === 0 || g.over) return begin(null);
    openModal(
      `<h2>Start a new game?</h2>
       <p>This one (score ${g.score}) will be lost.</p>
       <div class="actions">
         <button class="btn" data-action="new">New game</button>
         <button class="btn small secondary" data-action="keep">Keep playing</button>
       </div>`,
      (action) => {
        closeModal();
        if (action === 'new') {
          recordGame(progress, g.score, g.lines);
          begin(null);
        }
      },
    );
  });

  // ---------- Game ----------
  let game: ShapeGame | null = null;
  /** The position before the last placement, for the one undo a game allows. */
  let undoTo: SavedGame | null = null;
  let undoLeft = 1;
  let bestAtStart = 0;
  const newSeed = () => (Date.now() ^ (Math.random() * 1e9)) >>> 0;

  function begin(saved: SavedGame | null) {
    closeModal();
    show('game');
    game = new ShapeGame(newSeed(), saved ?? undefined);
    undoTo = null;
    undoLeft = 1;
    bestAtStart = progress.bestScore;
    $('#sf-tip').textContent = progress.games === 0 && !saved ? FIRST_TIP : '';
    renderer.setGame(game);
    renderer.resize();
    persist();
    updateHud();
    if (game.over) setTimeout(showOver, 400);
  }

  /** Keep the game in progress, so it can be continued after leaving. */
  function persist() {
    if (!game) return;
    progress.saved = game.over ? null : game.save();
    noteBests(progress, game.score, game.lines);
    saveShapes(progress);
  }

  function updateHud() {
    const g = game;
    if (!g) return;
    $('#sf-stats').innerHTML = `Score <b>${g.score}</b> · Best <b>${Math.max(progress.bestScore, g.score)}</b> · Lines <b>${g.lines}</b>`;
    $('#sf-sub').textContent = g.streak > 1 ? `Streak ×${g.streak}` : `${g.placed} ${g.placed === 1 ? 'piece' : 'pieces'}`;
    $('#sf-undo-count').textContent = String(undoLeft);
    $<HTMLButtonElement>('#sf-undo').disabled = !undoTo || undoLeft === 0 || g.over;
  }

  $('#sf-undo').addEventListener('click', () => {
    if (!game || !undoTo || undoLeft === 0 || game.over) return;
    game = new ShapeGame(newSeed(), undoTo);
    undoTo = null;
    undoLeft--;
    renderer.setGame(game);
    sfx.blip();
    persist();
    updateHud();
  });

  // ---------- Input ----------
  // Press a piece in the tray and drag it up onto the board. It rides above the finger so
  // the thumb never hides where it will land; a shadow shows the spot and the lines it
  // would clear. Let go over a spot that fits to place it; anywhere else, it goes back.
  let pointer: number | null = null;
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const g = game;
    if (!g || g.over || modalOpen() || pointer !== null) return;
    sfx.unlock();
    const p = local(e);
    const slot = renderer.slotAt(p.x, p.y);
    if (slot === null || g.tray[slot] < 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointer = e.pointerId;
    renderer.drag = { slot, px: p.x, py: p.y };
    shell.vibrate(6);
    renderer.invalidate();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer || !renderer.drag) return;
    const p = local(e);
    renderer.drag.px = p.x;
    renderer.drag.py = p.y;
    renderer.invalidate();
  });

  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    const d = renderer.drag;
    renderer.drag = null;
    renderer.invalidate();
    const g = game;
    if (!d || !g || cancelled) return;
    const { gx, gy } = renderer.dragSpot(d);
    const id = g.tray[d.slot];
    if (!g.fits(id, gx, gy)) return;
    place(d.slot, gx, gy);
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  function place(slot: number, x: number, y: number) {
    const g = game!;
    const before = g.cells.slice();
    const snapshot = g.save();
    const id = g.tray[slot];
    const r = g.place(slot, x, y);
    if (!r) return;
    undoTo = snapshot;
    // Cleared squares fade in the colour they had (including the piece just placed).
    const colourOf = (i: number) => (before[i] ? before[i] - 1 : PIECES[id].colour);
    const lines = r.rows.length + r.cols.length;
    const p = PIECES[id];
    const at: [number, number] = [renderer.ox + (x + p.w / 2) * renderer.cell, renderer.oy + (y + p.h / 2) * renderer.cell];
    renderer.played(
      r.filled.filter((i) => !r.cleared.includes(i)),
      r.cleared.map((i) => ({ i, colour: colourOf(i) })),
      lines ? r.gained : 0,
      at,
    );
    if (lines) {
      sfx.ding();
      if (lines > 1 || g.streak > 1) sfx.ding(0.12);
      shell.vibrate(lines > 1 ? [12, 30, 12] : 14);
    } else {
      sfx.blip();
      shell.vibrate(8);
    }
    persist();
    updateHud();
    if (g.over) setTimeout(showOver, 600);
  }

  function showOver() {
    const g = game;
    if (!g || !g.over || !$('#sf-game').classList.contains('active') || modalOpen()) return;
    recordGame(progress, g.score, g.lines);
    const best = g.score > bestAtStart;
    if (best) {
      sfx.chime();
      renderer.celebrate();
    } else sfx.thud();
    openModal(
      `<h2>${best ? 'New best score!' : 'No room left'}</h2>
       <div class="result-line">Score <b>${g.score}</b> · ${g.lines} ${g.lines === 1 ? 'line' : 'lines'} · ${g.placed} pieces</div>
       <p>${best ? (bestAtStart ? `Your old best was ${bestAtStart}.` : 'Your first game.') : `Your best is ${progress.bestScore}.`}</p>
       <div class="actions">
         <button class="btn" data-action="again">New game</button>
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
    if (game) renderer.resize();
  }).observe($('#sf-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __shapes: unknown }).__shapes = {
    get game() {
      return game;
    },
    renderer,
    progress,
    SIZE,
  };

  return {
    id: 'shapes',
    name: 'Shape Fit',
    tagline: 'Drag pieces onto the board; full lines clear. Endless.',
    icon: shapesLogo,
    summary: () => ({
      status: progress.saved ? `Game in progress · ${progress.saved.score}` : progress.games ? `Best ${progress.bestScore}` : 'Start playing',
      stars: 0,
    }),
    enter: () => show('home'),
    leave: () => {
      persist();
      game = null;
      pointer = null;
      renderer.setGame(null);
    },
    resetProgress: () => resetShapes(progress),
    modalLocked: () => false,
  };
}
