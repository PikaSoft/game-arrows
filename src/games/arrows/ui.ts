import { GameModule, Shell } from '../types';
import { fmt } from '../../shared/format';
import { heartIcon, icons, logo, starIcon } from '../../shared/icons';
import { Level } from './core/types';
import { LevelSource } from '../../shared/levelSource';
import { buildLevel } from './core/levels';
import { Session, START_HEARTS, TapResult } from './game/session';
import { load, Progress, recordClear, resetProgress } from './game/storage';
import { attachGestures } from './input/gestures';
import { Renderer } from './render/renderer';

export function createArrows(shell: Shell): GameModule {
const progress: Progress = load();
const { sfx, toast, openModal, closeModal, modalOpen } = shell;
const levels = new LevelSource<Level>(
  buildLevel,
  () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
);

const root = document.createElement('div');
root.className = 'game-root';
root.id = 'arrows-root';
shell.app.prepend(root);
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

root.innerHTML = `
  <section class="screen home" id="arrows-home">
    <div class="logo">${logo}</div>
    <h1>Arrow Escape</h1>
    <p>Tap an arrow to send it off the board. It can only go if nothing is in its way.</p>
    <button class="btn" id="play"></button>
    <button class="btn secondary" id="open-levels">Levels</button>
    <button class="btn secondary" id="open-settings-home">Settings</button>
    <button class="btn secondary" id="arrows-hub">All puzzles</button>
    <div class="total" id="total-stars"></div>
  </section>

  <section class="screen" id="arrows-levels">
    <div class="levels-head">
      <button class="icon-btn" id="levels-back" aria-label="Back">${icons.back}</button>
      <h2>Arrow Escape</h2>
    </div>
    <div class="level-grid" id="level-grid"></div>
  </section>

  <section class="screen" id="arrows-game">
    <header class="topbar">
      <button class="icon-btn" id="game-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="level-title"></b><span id="level-diff"></span></div>
      <button class="icon-btn" id="restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="open-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="hearts" aria-label="Hearts"></div>
      <div class="stats" id="stats"></div>
      <div class="timer" id="timer">0:00</div>
      <button class="icon-btn" id="hint" aria-label="Hint">${icons.bulb}<span class="badge" id="hint-count"></span></button>
    </div>
    <p class="tip" id="tip"></p>
    <div class="stage" id="stage">
      <canvas id="board"></canvas>
      <div class="loading" id="loading" hidden>Building level…</div>
      <button class="icon-btn fit-btn" id="fit" aria-label="Fit board to screen" hidden>${icons.fit}</button>
    </div>
  </section>

`;

const renderer = new Renderer($<HTMLCanvasElement>('#board'), shell.theme());
shell.onTheme((t) => {
  renderer.theme = t;
  renderer.invalidate();
});

// ---------- Screens ----------
type ScreenId = 'home' | 'levels' | 'game';
function show(id: ScreenId) {
  shell.show(`arrows-${id}`);
  if (id === 'home') renderHome();
  if (id === 'levels') renderLevels();
  if (id === 'game') requestAnimationFrame(() => renderer.resize());
}

function totalStars(): number {
  return Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);
}

function renderHome() {
  $('#play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
  const t = totalStars();
  $('#total-stars').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
}

function renderLevels() {
  const grid = $('#level-grid');
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

$('#level-grid').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
  if (t) startLevel(Number(t.dataset.level));
});
$('#play').addEventListener('click', () => startLevel(progress.current));
$('#open-levels').addEventListener('click', () => show('levels'));
$('#levels-back').addEventListener('click', () => show('home'));
$('#game-back').addEventListener('click', () => {
  closeModal();
  show('home');
});
$('#open-settings-home').addEventListener('click', shell.openSettings);
$('#open-settings').addEventListener('click', shell.openSettings);
$('#arrows-hub').addEventListener('click', shell.goHub);
$('#theme').addEventListener('click', shell.cycleTheme);

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
  winShown = false;
  renderer.board = null;
  renderer.invalidate();
  $('#level-title').textContent = `Level ${n}`;
  $('#level-diff').textContent = '';
  $('#tip').textContent = '';
  $('#stats').textContent = '';
  $('#loading').hidden = false;
  const level = await levels.get(n);
  if (token !== loadToken) return;
  $('#loading').hidden = true;
  beginSession(level);
  void levels.get(n + 1); // warm up the next one
}

function beginSession(level: Level) {
  session = new Session(level);
  const diffEl = $('#level-diff');
  diffEl.textContent = level.difficulty;
  diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
  diffEl.title = level.search
    ? `About ${Math.round(level.search)} arrows to check per move on average`
    : '';
  winShown = false;
  lastTick = performance.now();
  renderer.setBoard(session.board);
  renderer.resize();
  $('#tip').textContent = level.tip ?? '';
  updateHud();
  updateFitButton();
}

function updateHud(lostHeart = false) {
  const s = session;
  if (!s) return;
  const hearts = $('#hearts');
  hearts.innerHTML = Array.from({ length: START_HEARTS }, (_, i) => heartIcon(i < s.hearts)).join('');
  if (lostHeart) hearts.children[s.hearts]?.classList.add('lost');
  $('#stats').innerHTML = `Free <b>${s.freeCount}</b> · Left <b>${s.remaining}</b>`;
  $('#hint-count').textContent = String(s.hints);
  $<HTMLButtonElement>('#hint').disabled = s.hints === 0 || s.won || s.autoFinishing;
  updateTimer();
}

function updateTimer() {
  if (session) $('#timer').textContent = fmt(session.elapsedMs);
}

function updateFitButton() {
  $('#fit').hidden = renderer.camera.isFitted;
}

function handleTap(x: number, y: number) {
  const s = session;
  if (!s || modalOpen()) return;
  const id = renderer.hitTest(x, y);
  if (id === null) return;
  const res: TapResult = s.tap(id);
  if (res.kind === 'exit') {
    renderer.addExit(res.arrow, res.distToEdge);
    renderer.hintId = s.hintId;
    sfx.whoosh();
    if (s.shouldAutoFinish()) autoFinish();
    updateHud();
  } else if (res.kind === 'blocked') {
    renderer.addBump(res.arrow, res.distToBlocker);
    sfx.thud();
    shell.vibrate(res.lostHeart ? [30, 40, 30] : 25);
    updateHud(res.lostHeart);
    if (res.outOfHearts) setTimeout(showOutOfHearts, 450);
  }
}

function autoFinish() {
  const s = session!;
  const list = s.startAutoFinish();
  renderer.hintId = null;
  // Fire the arrows off one at a time in quick succession. The gap is long enough
  // that each launch reads as its own beat, and shrinks on big boards so the
  // whole sequence stays under about two and a half seconds.
  const gap = Math.max(45, Math.min(120, 2500 / Math.max(1, list.length)));
  list.forEach(({ arrow, distToEdge }, i) => {
    renderer.addExit(arrow, distToEdge, i * gap, 450);
    setTimeout(() => sfx.whoosh(0.12), i * gap);
  });
  if (list.length) toast('All clear! Finishing up…');
}

function showOutOfHearts() {
  const s = session;
  if (!s || !s.awaitingContinue) return;
  openModal(
    `<h2>Out of hearts</h2>
     <p>You can keep going, but this clear won't earn any stars.</p>
     <div class="actions">
       <button class="btn" data-action="continue">Keep going</button>
       <button class="btn secondary" data-action="restart">Restart level</button>
     </div>`,
    (action) => {
      if (action === 'continue') {
        s.continueWithoutHearts();
        closeModal();
        updateHud();
      } else restartLevel();
    },
    false,
  );
}

function restartLevel() {
  if (!session) return;
  closeModal();
  beginSession(session.level);
}

function showWin() {
  const s = session!;
  winShown = true;
  const stars = s.stars();
  const { newBest } = recordClear(progress, s.level.number, stars, s.elapsedMs);
  sfx.chime();
  renderer.confetti();
  shell.vibrate([20, 60, 20]);
  const prev = progress.levels[s.level.number];
  setTimeout(() => {
    if (session !== s) return;
    openModal(
      `<h2>Level ${s.level.number} cleared</h2>
       <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
       <div class="result-line">Time ${fmt(s.elapsedMs)} ${
         newBest ? '<span class="best">· New best!</span>' : `· Best ${fmt(prev.bestMs)}`
       }</div>
       ${s.continued ? '<p>Finished after running out of hearts: no stars this time.</p>' : ''}
       <div class="actions">
         <button class="btn" data-action="next">Next level</button>
         <div class="row">
           <button class="btn small secondary" data-action="replay">Replay</button>
           <button class="btn small secondary" data-action="levels">${'Levels'}</button>
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

$('#hint').addEventListener('click', () => {
  sfx.unlock();
  const s = session;
  if (!s) return;
  const a = s.useHint();
  if (!a) return;
  renderer.hintId = a.id;
  const head = a.cells[a.cells.length - 1];
  renderer.camera.reveal(head.x + 0.5, head.y + 0.5);
  sfx.blip();
  updateHud();
  updateFitButton();
  renderer.invalidate();
});
$('#restart').addEventListener('click', restartLevel);
$('#fit').addEventListener('click', () => {
  renderer.camera.fit();
  renderer.invalidate();
  updateFitButton();
});

attachGestures($('#board'), renderer.camera, {
  onTap: handleTap,
  onViewChange: () => {
    renderer.invalidate();
    updateFitButton();
  },
  onFirstTouch: () => sfx.unlock(),
});

window.addEventListener('resize', () => renderer.resize());

// Timer and win check.
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
  if (s.won && !winShown && !renderer.exitsRunning) showWin();
}, 200);

// Expose a tiny hook for automated browser tests.
(window as unknown as { __game: unknown }).__game = {
  get session() {
    return session;
  },
  renderer,
  progress,
};

return {
  id: 'arrows',
  name: 'Arrow Escape',
  tagline: 'Slide every arrow off the board.',
  icon: logo,
  summary: () => {
    const started = Object.keys(progress.levels).length > 0;
    return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
  },
  enter: () => show('home'),
  leave: () => {
    loadToken++;
    session = null;
    renderer.board = null;
  },
  resetProgress: () => resetProgress(progress),
  modalLocked: () => !!session?.awaitingContinue,
};
}
