import './styles.css';
import { createArrows } from './games/arrows/ui';
import { createCrates } from './games/crates/ui';
import { createLights } from './games/lights/ui';
import { createLines } from './games/lines/ui';
import { createPipes } from './games/pipes/ui';
import { createSandglass } from './games/sandglass/ui';
import { createSnakeGame } from './games/snake/ui';
import { createSqueeze } from './games/squeeze/ui';
import { GameModule, Shell } from './games/types';
import { hubLogo, starIcon } from './shared/icons';
import { loadSettings, saveSettings } from './shared/settings';
import { Sfx, vibrate } from './shared/sfx';
import { applyTheme, resolveTheme, Theme, THEME_ORDER, themeLabel } from './shared/themes';
import { startUpdateCheck } from './shared/updateCheck';

const settings = loadSettings();
const sfx = new Sfx();
sfx.enabled = settings.sound;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const app = $('#app');

app.innerHTML = `
  <section class="screen hub" id="hub">
    <div class="hub-head">
      <div class="logo">${hubLogo}</div>
      <h1>Pocket Puzzles</h1>
      <p>Pick a puzzle. Your progress in each one is saved on this device.</p>
    </div>
    <div class="game-cards" id="game-cards"></div>
    <button class="btn secondary" id="hub-settings">Settings</button>
  </section>
  <div class="modal" id="modal" hidden><div class="card" id="card"></div></div>
  <div class="toast" id="toast"></div>
`;

// ---------- Theme ----------
let theme = resolveTheme(settings.theme);
applyTheme(theme);
const themeListeners: ((t: Theme) => void)[] = [];
function setTheme(id: string) {
  settings.theme = id;
  saveSettings(settings);
  theme = resolveTheme(id);
  applyTheme(theme);
  for (const fn of themeListeners) fn(theme);
}
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') setTheme('auto');
  });
} catch {
  /* old browsers */
}

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

// ---------- Screens & routing ----------
function show(id: string) {
  for (const s of app.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
}

const games: GameModule[] = [];
let activeGame: GameModule | null = null;

function goHub() {
  if (location.hash && location.hash !== '#/') location.hash = '#/';
  else route();
}

function route() {
  const id = location.hash.replace(/^#\/?/, '').split('/')[0];
  const game = games.find((g) => g.id === id) ?? null;
  closeModal();
  if (activeGame && activeGame !== game) activeGame.leave();
  activeGame = game;
  if (game) game.enter();
  else {
    renderHub();
    show('hub');
  }
}

function renderHub() {
  $('#game-cards').innerHTML = games
    .map((g) => {
      const s = g.summary();
      return `<button class="game-card" data-game="${g.id}">
        <span class="game-icon">${g.icon}</span>
        <span class="game-text">
          <b>${g.name}</b>
          <span class="tagline">${g.tagline}</span>
          <span class="game-status">${s.status}${s.stars ? ` · ${starIcon(true)} ${s.stars}` : ''}</span>
        </span>
      </button>`;
    })
    .join('');
}

$('#game-cards').addEventListener('click', (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>('[data-game]');
  if (!c) return;
  sfx.unlock();
  location.hash = `#/${c.dataset.game}`;
});

// ---------- Settings ----------
function openSettings() {
  const sw = (id: string, on: boolean) => `<button class="switch" role="switch" data-action="${id}" aria-checked="${on}"></button>`;
  const opts = THEME_ORDER.map((id) => `<option value="${id}" ${id === settings.theme ? 'selected' : ''}>${themeLabel(id)}</option>`).join('');
  const resets = games
    .map((g) => `<button class="btn small secondary" data-action="reset" data-game="${g.id}">Reset ${g.name}</button>`)
    .join('');
  openModal(
    `<h2>Settings</h2>
     <div class="setting"><span>Sound</span>${sw('sound', settings.sound)}</div>
     <div class="setting"><span>Vibration</span>${sw('haptics', settings.haptics)}</div>
     <div class="setting"><span>Colours</span><select class="select" id="theme-select">${opts}</select></div>
     <div class="actions" style="margin-top:18px">
       <button class="btn small" data-action="close">Done</button>
       <div class="row">${resets}</div>
     </div>`,
    (action, el) => {
      if (action === 'sound' || action === 'haptics') {
        settings[action] = !settings[action];
        el.setAttribute('aria-checked', String(settings[action]));
        sfx.enabled = settings.sound;
        saveSettings(settings);
        if (action === 'haptics' && settings.haptics) vibrate(30);
      } else if (action === 'reset') {
        const g = games.find((x) => x.id === el.dataset.game)!;
        if (el.dataset.confirm) {
          g.resetProgress();
          closeModal();
          toast(`${g.name} progress reset`);
          route();
        } else {
          el.dataset.confirm = '1';
          el.textContent = `Tap again to erase ${g.name} progress`;
          el.classList.add('danger');
        }
      } else if (action === 'close') closeModal();
    },
  );
  $<HTMLSelectElement>('#theme-select').addEventListener('change', (e) => setTheme((e.target as HTMLSelectElement).value));
}
$('#hub-settings').addEventListener('click', openSettings);

// ---------- Games ----------
const shell: Shell = {
  app,
  sfx,
  settings,
  theme: () => theme,
  onTheme: (fn) => themeListeners.push(fn),
  setTheme,
  cycleTheme: () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length];
    setTheme(next);
    toast(themeLabel(next));
  },
  show,
  goHub,
  toast,
  openModal,
  closeModal,
  modalOpen,
  openSettings,
  vibrate: (p) => {
    if (settings.haptics) vibrate(p);
  },
};

games.push(
  createArrows(shell),
  createSandglass(shell),
  createSnakeGame(shell, 'classic'),
  createSnakeGame(shell, 'trails'),
  createSqueeze(shell),
  createPipes(shell),
  createLines(shell),
  createCrates(shell),
  createLights(shell),
);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen() && !activeGame?.modalLocked?.()) closeModal();
});
window.addEventListener('hashchange', route);

(window as unknown as { __shell: unknown }).__shell = { settings, games };

route();
startUpdateCheck();
