import { extraIcons, icons, mergeLogo } from '../../shared/icons';
import { keyDir } from '../snake/input/swipe';
import { GameModule, Shell } from '../types';
import { MergeGame, SavedGame } from './core/game';
import { Board } from './core/rules';
import { loadMerge, MergeProgress, noteBests, recordGame, resetMerge, saveMerge } from './game/storage';
import { MergeRenderer } from './render/renderer';

/** Distance in CSS pixels a finger must travel before it counts as a swipe. */
const SWIPE_PX = 24;

export function createMerge(shell: Shell): GameModule {
  const progress: MergeProgress = loadMerge();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'mt-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="mt-home">
    <div class="logo">${mergeLogo}</div>
    <h1>Merge Tiles</h1>
    <p>Swipe to slide every tile. Two equal tiles that meet merge into one worth both. Stones get in the way, then crumble.</p>
    <button class="btn" id="mt-continue" hidden>Continue</button>
    <button class="btn" id="mt-new">New game</button>
    <button class="btn secondary" id="mt-settings-home">Settings</button>
    <button class="btn secondary" id="mt-hub">All puzzles</button>
    <div class="total" id="mt-total"></div>
  </section>

  <section class="screen" id="mt-game">
    <header class="topbar">
      <button class="icon-btn" id="mt-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b>Merge Tiles</b><span id="mt-sub"></span></div>
      <button class="icon-btn" id="mt-restart" aria-label="New game">${icons.restart}</button>
      <button class="icon-btn" id="mt-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="mt-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="mt-undo" aria-label="Undo (once per game)">${extraIcons.undo}<span class="badge" id="mt-undo-count"></span></button>
      <div class="stats" id="mt-stats"></div>
    </div>
    <p class="tip" id="mt-tip"></p>
    <div class="stage" id="mt-stage">
      <canvas id="mt-board"></canvas>
    </div>
  </section>`;

  const renderer = new MergeRenderer($<HTMLCanvasElement>('#mt-board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'game') {
    shell.show(`mt-${id}`);
    if (id === 'home') {
      const p = progress;
      $<HTMLButtonElement>('#mt-continue').hidden = !p.saved;
      $('#mt-new').className = p.saved ? 'btn secondary' : 'btn';
      $('#mt-total').textContent = p.games || p.bestScore ? `Best score ${p.bestScore} · best tile ${p.bestTile} · ${p.games} ${p.games === 1 ? 'game' : 'games'} played` : '';
    } else requestAnimationFrame(() => renderer.resize());
  }
  $('#mt-continue').addEventListener('click', () => begin(progress.saved));
  $('#mt-new').addEventListener('click', () => begin(null));
  $('#mt-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#mt-settings-home').addEventListener('click', shell.openSettings);
  $('#mt-settings').addEventListener('click', shell.openSettings);
  $('#mt-hub').addEventListener('click', shell.goHub);
  $('#mt-theme').addEventListener('click', shell.cycleTheme);
  $('#mt-restart').addEventListener('click', () => {
    const g = game;
    if (!g || g.moves === 0 || g.over) return begin(null);
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
          recordGame(progress, g.score, g.best);
          begin(null);
        }
      },
    );
  });

  // ---------- Game ----------
  let game: MergeGame | null = null;
  /** The position before the last move, for the one undo a game allows. */
  let undoTo: SavedGame | null = null;
  let undoLeft = 1;
  let bestAtStart = 0;

  function begin(saved: SavedGame | null) {
    closeModal();
    show('game');
    game = new MergeGame((Date.now() ^ (Math.random() * 1e9)) >>> 0, saved ?? undefined);
    undoTo = null;
    undoLeft = 1;
    bestAtStart = progress.bestScore;
    $('#mt-tip').textContent = progress.games === 0 && !saved ? 'Slide two equal tiles together to merge them. Keep space free: a full board with no pairs ends the game.' : '';
    renderer.setBoard(game.board);
    renderer.resize();
    persist();
    updateHud();
  }

  /** Keep the game in progress, so it can be continued after leaving. */
  function persist() {
    if (!game) return;
    progress.saved = game.over ? null : game.save();
    noteBests(progress, game.score, game.best);
    saveMerge(progress);
  }

  function updateHud() {
    const g = game;
    if (!g) return;
    $('#mt-stats').innerHTML = `Score <b>${g.score}</b> · Best <b>${Math.max(progress.bestScore, g.score)}</b> · Top tile <b>${g.best}</b>`;
    $('#mt-sub').textContent = `${g.moves} ${g.moves === 1 ? 'move' : 'moves'}`;
    $('#mt-undo-count').textContent = String(undoLeft);
    $<HTMLButtonElement>('#mt-undo').disabled = !undoTo || undoLeft === 0 || g.over;
  }

  function swipe(d: number) {
    const g = game;
    if (!g || g.over || modalOpen()) return;
    sfx.unlock();
    const before: Board = { cells: g.board.cells.slice(), life: g.board.life.slice() };
    const snapshot = g.save();
    const r = g.swipe(d);
    if (!r) {
      shell.vibrate(10);
      return;
    }
    undoTo = snapshot;
    renderer.board = g.board;
    renderer.play(before, r.moves, r.merges.map((m) => m.at), r.spawned?.at ?? null, r.stone);
    if (r.merges.length) {
      sfx.ding();
      shell.vibrate(r.merges.length > 1 ? [10, 30, 10] : 12);
    } else sfx.blip();
    if (r.stone !== null) sfx.thud();
    persist();
    updateHud();
    if (g.over) setTimeout(showOver, 600);
  }

  $('#mt-undo').addEventListener('click', () => {
    if (!game || !undoTo || undoLeft === 0 || game.over) return;
    game = new MergeGame((Date.now() ^ (Math.random() * 1e9)) >>> 0, undoTo);
    undoTo = null;
    undoLeft--;
    renderer.setBoard(game.board);
    sfx.blip();
    persist();
    updateHud();
  });

  // ---------- Input ----------
  // One swipe per press, anywhere on the board. Arrow keys and WASD too; Z undoes.
  const stage = $('#mt-stage');
  let press: { id: number; x: number; y: number; done: boolean } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (press || !game || modalOpen()) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId || press.done) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    press.done = true;
    swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  });
  const endPress = (e: PointerEvent) => {
    if (press && press.id === e.pointerId) press = null;
  };
  stage.addEventListener('pointerup', endPress);
  stage.addEventListener('pointercancel', endPress);
  document.addEventListener('keydown', (e) => {
    if (!game || !$('#mt-game').classList.contains('active') || modalOpen()) return;
    const d = keyDir(e.key);
    if (d !== undefined) {
      e.preventDefault();
      swipe(d);
    } else if (e.key === 'z' || e.key === 'Z') $('#mt-undo').click();
  });

  function showOver() {
    const g = game;
    if (!g || !g.over || !$('#mt-game').classList.contains('active')) return;
    recordGame(progress, g.score, g.best);
    const best = g.score > bestAtStart;
    if (best) sfx.chime();
    openModal(
      `<h2>${best ? 'New best score!' : 'No moves left'}</h2>
       <div class="result-line">Score <b>${g.score}</b> · top tile <b>${g.best}</b> · ${g.moves} moves</div>
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
  }).observe($('#mt-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __merge: unknown }).__merge = {
    get game() {
      return game;
    },
    progress,
  };

  return {
    id: 'merge',
    name: 'Merge Tiles',
    tagline: 'Slide tiles so pairs merge. Stones get in the way.',
    icon: mergeLogo,
    summary: () => ({
      status: progress.saved ? `Game in progress · ${progress.saved.score}` : progress.games ? `Best ${progress.bestScore}` : 'Start playing',
      stars: 0,
    }),
    enter: () => show('home'),
    leave: () => {
      persist();
      game = null;
      renderer.setBoard(null);
    },
    resetProgress: () => resetMerge(progress),
    modalLocked: () => false,
  };
}
