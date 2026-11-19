import { fmt } from '../../shared/format';
import { extraIcons, icons, pairsLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildPairsLevel } from './core/levels';
import { PairsLevel } from './core/types';
import { Session } from './game/session';
import { loadPairs, PairsProgress, recordPairsClear, resetPairs } from './game/storage';
import { PairsRenderer } from './render/renderer';

export function createPairs(shell: Shell): GameModule {
  const progress: PairsProgress = loadPairs();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<PairsLevel>(
    buildPairsLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'pr-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="pr-home">
    <div class="logo">${pairsLogo}</div>
    <h1>Layer Pairs</h1>
    <p>Clear the pile two at a time: tap two free tiles with the same picture. A tile is free when nothing covers it and one side is open.</p>
    <button class="btn" id="pr-play"></button>
    <button class="btn secondary" id="pr-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="pr-settings-home">Settings</button>
    <button class="btn secondary" id="pr-hub">All puzzles</button>
    <div class="total" id="pr-total"></div>
  </section>

  <section class="screen" id="pr-levels">
    <div class="levels-head">
      <button class="icon-btn" id="pr-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Layer Pairs</h2>
    </div>
    <div class="level-grid" id="pr-grid"></div>
  </section>

  <section class="screen" id="pr-game">
    <header class="topbar">
      <button class="icon-btn" id="pr-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="pr-title"></b><span id="pr-diff"></span></div>
      <button class="icon-btn" id="pr-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="pr-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="pr-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="pr-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="pr-stats"></div>
      <div class="timer" id="pr-timer">0:00</div>
      <button class="icon-btn" id="pr-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="pr-hint-count"></span></button>
    </div>
    <p class="tip" id="pr-tip"></p>
    <div class="stage" id="pr-stage">
      <canvas id="pr-board"></canvas>
      <div class="loading" id="pr-loading" hidden>Stacking the tiles…</div>
    </div>
    <div class="mode-bar"><button class="btn small secondary" id="pr-shuffle">Shuffle <span id="pr-shuffle-count"></span></button></div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#pr-board');
  const renderer = new PairsRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`pr-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#pr-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#pr-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#pr-grid');
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

  $('#pr-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#pr-play').addEventListener('click', () => startLevel(progress.current));
  $('#pr-open-levels').addEventListener('click', () => show('levels'));
  $('#pr-levels-back').addEventListener('click', () => show('home'));
  $('#pr-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#pr-settings-home').addEventListener('click', shell.openSettings);
  $('#pr-settings').addEventListener('click', shell.openSettings);
  $('#pr-hub').addEventListener('click', shell.goHub);
  $('#pr-theme').addEventListener('click', shell.cycleTheme);

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
    renderer.setView(null);
    $('#pr-title').textContent = `Level ${n}`;
    $('#pr-diff').textContent = '';
    $('#pr-tip').textContent = '';
    $('#pr-stats').textContent = '';
    $('#pr-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#pr-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: PairsLevel) {
    session = new Session(level);
    const diffEl = $('#pr-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.score !== undefined ? `${Math.round(level.score * 100)}% of random playthroughs get stuck` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#pr-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#pr-stats').innerHTML = `Free <b>${s.freeMatched}</b> · Left <b>${s.left}</b>`;
    $<HTMLButtonElement>('#pr-undo').disabled = !s.canUndo || s.won;
    $('#pr-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#pr-hint').disabled = s.hints === 0 || s.won;
    $('#pr-shuffle-count').textContent = `(${s.shuffles})`;
    $<HTMLButtonElement>('#pr-shuffle').disabled = s.shuffles === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#pr-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    renderer.invalidate();
    if (session?.won) setTimeout(showWin, 350);
    else if (session?.stuck) setTimeout(showStuck, 400);
  }

  // ---------- Input ----------
  // Tap a free tile to pick it up (it lifts a little), then a free tile with the same
  // picture to clear both. Tapping a covered tile gives a small shake.
  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen()) return;
    sfx.unlock();
    const r = canvas.getBoundingClientRect();
    const i = renderer.tileAt(e.clientX - r.left, e.clientY - r.top);
    if (i === null) return;
    const before = s.selected;
    const res = s.tap(i);
    if (!res) return;
    if (res === 'blocked') {
      renderer.shake(i);
      shell.vibrate(12);
    } else if (res === 'match') {
      renderer.removed([before!, i]);
      sfx.ding();
      shell.vibrate(14);
    } else {
      sfx.blip();
      shell.vibrate(6);
    }
    afterMove();
  });

  $('#pr-undo').addEventListener('click', () => {
    const s = session;
    if (!s || s.won || s.undo() === null) return;
    sfx.blip();
    afterMove();
  });

  $('#pr-hint').addEventListener('click', () => {
    const s = session;
    if (!s) return;
    const h = s.hint();
    if (h === null) return;
    if (h === 'dead') {
      shell.toast('No way out from here: undo or shuffle');
      return;
    }
    sfx.ding();
    shell.vibrate(15);
    afterMove();
  });

  function shuffle() {
    const s = session;
    if (!s || !s.shuffle()) return;
    closeModal();
    sfx.whoosh();
    shell.vibrate(20);
    afterMove();
  }
  $('#pr-shuffle').addEventListener('click', shuffle);

  function showStuck() {
    const s = session;
    if (!s || !s.stuck || modalOpen() || !$('#pr-game').classList.contains('active')) return;
    openModal(
      `<h2>No pairs left</h2>
       <p>Nothing free has a match. Undo is free; a shuffle deals the tiles left so they can all be cleared, for a star.</p>
       <div class="actions">
         <button class="btn" data-action="undo">Undo</button>
         <div class="row">
           <button class="btn small secondary" data-action="shuffle" ${s.shuffles ? '' : 'disabled'}>Shuffle (${s.shuffles})</button>
           <button class="btn small secondary" data-action="restart">Restart</button>
         </div>
       </div>`,
      (action) => {
        if (action === 'undo') {
          closeModal();
          s.undo();
          afterMove();
        } else if (action === 'shuffle') shuffle();
        else restartLevel();
      },
      false,
    );
  }

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#pr-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordPairsClear(progress, s.level.number, stars, s.undos, s.elapsedMs);
    sfx.chime();
    renderer.celebrate();
    shell.vibrate([20, 60, 20]);
    const used = s.hintsUsed + s.shufflesUsed;
    const note = stars < 3 ? `<p>Each hint or shuffle costs a star. Clear the pile without them for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number}: table cleared</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(s.elapsedMs)} · ${used} ${used === 1 ? 'hint or shuffle' : 'hints and shuffles'} ${
           newBestTime ? (prev ? '<span class="best">· New best time!</span>' : '') : `· Best ${fmt(prev!.bestMs)}`
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
  }).observe($('#pr-stage'));

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
  (window as unknown as { __pairs: unknown }).__pairs = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'pairs',
    name: 'Layer Pairs',
    tagline: 'Clear a layered pile two matching tiles at a time.',
    icon: pairsLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      session = null;
        renderer.setView(null);
    },
    resetProgress: () => resetPairs(progress),
    modalLocked: () => winShown,
  };
}
