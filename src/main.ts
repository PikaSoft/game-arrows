import './styles.css';
import { Sfx, vibrate } from './audio/sfx';
import { difficultyOf } from './core/levels';
import { Level } from './core/types';
import { LevelSource } from './game/levelSource';
import { Session, START_DROPS, TapResult } from './game/session';
import { load, Progress, recordClear, resetProgress, save } from './game/storage';
import { attachGestures } from './input/gestures';
import { Renderer } from './render/renderer';
import { dropIcon, icons, logo, starIcon } from './ui/icons';
import { applyTheme, resolveTheme, THEME_ORDER, themeLabel } from './ui/themes';

const progress: Progress = load();
const sfx = new Sfx();
sfx.enabled = progress.settings.sound;
const levels = new LevelSource();

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const app = $('#app');

app.innerHTML = `
  <section class="screen home" id="home">
    <div class="logo">${logo}</div>
    <h1>Arrow Escape</h1>
    <p>Tap an arrow to send it off the board. It can only go if nothing is in its way.</p>
    <button class="btn" id="play"></button>
    <button class="btn secondary" id="open-levels">Levels</button>
    <button class="btn secondary" id="open-settings-home">Settings</button>
    <div class="total" id="total-stars"></div>
  </section>

  <section class="screen" id="levels">
    <div class="levels-head">
      <button class="icon-btn" id="levels-back" aria-label="Back">${icons.back}</button>
      <h2>Levels</h2>
    </div>
    <div class="level-grid" id="level-grid"></div>
  </section>

  <section class="screen" id="game">
    <header class="topbar">
      <button class="icon-btn" id="game-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="level-title"></b><span id="level-diff"></span></div>
      <button class="icon-btn" id="restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="open-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="drops" id="drops" aria-label="Water drops"></div>
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

  <div class="modal" id="modal" hidden><div class="card" id="card"></div></div>
  <div class="toast" id="toast"></div>
`;

// ---------- Theme ----------
let theme = resolveTheme(progress.theme);
applyTheme(theme);
const renderer = new Renderer($<HTMLCanvasElement>('#board'), theme);
function setTheme(id: string) {
  progress.theme = id;
  save(progress);
  theme = resolveTheme(id);
  applyTheme(theme);
  renderer.theme = theme;
  renderer.invalidate();
}
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (progress.theme === 'auto') setTheme('auto');
  });
} catch {
  /* old browsers */
}

// ---------- Screens ----------
type ScreenId = 'home' | 'levels' | 'game';
function show(id: ScreenId) {
  for (const s of app.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
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
$('#open-settings-home').addEventListener('click', openSettings);
$('#open-settings').addEventListener('click', openSettings);
$('#theme').addEventListener('click', () => {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(progress.theme) + 1) % THEME_ORDER.length];
  setTheme(next);
  toast(themeLabel(next));
});

// ---------- Toast & modal ----------
let toastTimer = 0;
function toast(msg: string) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1600);
}

function openModal(html: string, onClick: (action: string, el: HTMLElement) => void, dismissable = true) {
  const modal = $('#modal');
  const card = $('#card');
  card.innerHTML = html;
  modal.hidden = false;
  modal.onclick = (e) => {
    if (e.target === modal && dismissable) closeModal();
  };
  card.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (b) onClick(b.dataset.action!, b);
  };
}
function closeModal() {
  $('#modal').hidden = true;
}
const modalOpen = () => !$('#modal').hidden;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen() && !(session?.awaitingContinue)) closeModal();
});

function openSettings() {
  const sw = (id: string, on: boolean) => `<button class="switch" role="switch" data-action="${id}" aria-checked="${on}"></button>`;
  const opts = THEME_ORDER.map((id) => `<option value="${id}" ${id === progress.theme ? 'selected' : ''}>${themeLabel(id)}</option>`).join('');
  openModal(
    `<h2>Settings</h2>
     <div class="setting"><span>Sound</span>${sw('sound', progress.settings.sound)}</div>
     <div class="setting"><span>Vibration</span>${sw('haptics', progress.settings.haptics)}</div>
     <div class="setting"><span>Colours</span><select class="select" id="theme-select">${opts}</select></div>
     <div class="actions" style="margin-top:18px">
       <button class="btn small" data-action="close">Done</button>
       <button class="btn small secondary" data-action="reset">Reset progress</button>
     </div>`,
    (action, el) => {
      if (action === 'sound' || action === 'haptics') {
        progress.settings[action] = !progress.settings[action];
        el.setAttribute('aria-checked', String(progress.settings[action]));
        sfx.enabled = progress.settings.sound;
        save(progress);
        if (action === 'haptics' && progress.settings.haptics) vibrate(30);
      } else if (action === 'reset') {
        if (el.dataset.confirm) {
          resetProgress(progress);
          closeModal();
          toast('Progress reset');
          show('home');
        } else {
          el.dataset.confirm = '1';
          el.textContent = 'Tap again to erase all progress';
          el.classList.add('danger');
        }
      } else if (action === 'close') closeModal();
    },
  );
  $<HTMLSelectElement>('#theme-select').addEventListener('change', (e) => setTheme((e.target as HTMLSelectElement).value));
}

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
  const diff = difficultyOf(n);
  const diffEl = $('#level-diff');
  diffEl.textContent = diff;
  diffEl.className = `diff-${diff.split(' ')[0]}`;
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
  winShown = false;
  lastTick = performance.now();
  renderer.setBoard(session.board);
  renderer.resize();
  $('#tip').textContent = level.tip ?? '';
  updateHud();
  updateFitButton();
}

function updateHud(lostDrop = false) {
  const s = session;
  if (!s) return;
  const drops = $('#drops');
  drops.innerHTML = Array.from({ length: START_DROPS }, (_, i) => dropIcon(i < s.drops)).join('');
  if (lostDrop) drops.children[s.drops]?.classList.add('lost');
  $('#stats').innerHTML = `Free <b>${s.freeCount}</b> · Left <b>${s.remaining}</b>`;
  $('#hint-count').textContent = String(s.hints);
  $<HTMLButtonElement>('#hint').disabled = s.hints === 0 || s.won || s.autoFinishing;
  updateTimer();
}

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
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
    if (progress.settings.haptics) vibrate(res.lostDrop ? [30, 40, 30] : 25);
    updateHud(res.lostDrop);
    if (res.outOfDrops) setTimeout(showOutOfDrops, 450);
  }
}

function autoFinish() {
  const s = session!;
  const list = s.startAutoFinish();
  renderer.hintId = null;
  const gap = Math.min(70, 1400 / Math.max(1, list.length));
  list.forEach(({ arrow, distToEdge }, i) => renderer.addExit(arrow, distToEdge, i * gap));
  for (let i = 0; i < Math.min(list.length, 6); i++) setTimeout(() => sfx.whoosh(), i * Math.max(gap, 90));
  if (list.length) toast('All clear! Finishing up…');
}

function showOutOfDrops() {
  const s = session;
  if (!s || !s.awaitingContinue) return;
  openModal(
    `<h2>Out of water</h2>
     <p>You can keep going, but this clear won't earn any stars.</p>
     <div class="actions">
       <button class="btn" data-action="continue">Keep going</button>
       <button class="btn secondary" data-action="restart">Restart level</button>
     </div>`,
    (action) => {
      if (action === 'continue') {
        s.continueWithoutDrops();
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
  if (progress.settings.haptics) vibrate([20, 60, 20]);
  const prev = progress.levels[s.level.number];
  setTimeout(() => {
    if (session !== s) return;
    openModal(
      `<h2>Level ${s.level.number} cleared</h2>
       <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
       <div class="result-line">Time ${fmt(s.elapsedMs)} ${
         newBest ? '<span class="best">· New best!</span>' : `· Best ${fmt(prev.bestMs)}`
       }</div>
       ${s.continued ? '<p>Finished after running out of water: no stars this time.</p>' : ''}
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

show('home');
