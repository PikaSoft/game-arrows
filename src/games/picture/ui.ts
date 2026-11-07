import { fmt } from '../../shared/format';
import { heartIcon, icons, pictureLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildPictureLevel } from './core/levels';
import { PictureLevel } from './core/types';
import { Mode, Session, START_HEARTS } from './game/session';
import { loadPicture, PictureProgress, recordPictureClear, resetPicture } from './game/storage';
import { PictureRenderer } from './render/renderer';

export function createPicture(shell: Shell): GameModule {
  const progress: PictureProgress = loadPicture();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<PictureLevel>(
    buildPictureLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'pg-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="pg-home">
    <div class="logo">${pictureLogo}</div>
    <h1>Picture Grid</h1>
    <p>The numbers tell you the runs of filled squares in each row and column. Work them out to reveal a picture.</p>
    <button class="btn" id="pg-play"></button>
    <button class="btn secondary" id="pg-open-levels">Levels</button>
    <button class="btn secondary" id="pg-settings-home">Settings</button>
    <button class="btn secondary" id="pg-hub">All puzzles</button>
    <div class="total" id="pg-total"></div>
  </section>

  <section class="screen" id="pg-levels">
    <div class="levels-head">
      <button class="icon-btn" id="pg-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Picture Grid</h2>
    </div>
    <div class="level-grid" id="pg-grid"></div>
  </section>

  <section class="screen" id="pg-game">
    <header class="topbar">
      <button class="icon-btn" id="pg-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="pg-title"></b><span id="pg-diff"></span></div>
      <button class="icon-btn" id="pg-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="pg-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="pg-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="pg-hearts" aria-label="Hearts"></div>
      <div class="stats" id="pg-stats"></div>
      <div class="timer" id="pg-timer">0:00</div>
      <button class="icon-btn" id="pg-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="pg-hint-count"></span></button>
    </div>
    <p class="tip" id="pg-tip"></p>
    <div class="stage" id="pg-stage">
      <canvas id="pg-board"></canvas>
      <div class="loading" id="pg-loading" hidden>Building the board…</div>
    </div>
    <div class="mode-bar"><div class="seg" id="pg-mode" role="group" aria-label="What a tap does">
      <button data-mode="fill" aria-pressed="true">Fill</button><button data-mode="cross" aria-pressed="false">Cross</button>
    </div></div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#pg-board');
  const renderer = new PictureRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`pg-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#pg-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#pg-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#pg-grid');
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

  $('#pg-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#pg-play').addEventListener('click', () => startLevel(progress.current));
  $('#pg-open-levels').addEventListener('click', () => show('levels'));
  $('#pg-levels-back').addEventListener('click', () => show('home'));
  $('#pg-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#pg-settings-home').addEventListener('click', shell.openSettings);
  $('#pg-settings').addEventListener('click', shell.openSettings);
  $('#pg-hub').addEventListener('click', shell.goHub);
  $('#pg-theme').addEventListener('click', shell.cycleTheme);

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
    $('#pg-title').textContent = `Level ${n}`;
    $('#pg-diff').textContent = '';
    $('#pg-tip').textContent = '';
    $('#pg-stats').textContent = '';
    $('#pg-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#pg-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: PictureLevel) {
    session = new Session(level);
    drag = null;
    setMode('fill');
    const diffEl = $('#pg-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title =
      level.score !== undefined ? `On average ${level.score.toFixed(2)} open squares for each one line logic settles in a pass` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#pg-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud(lostHeart = false) {
    const s = session;
    if (!s) return;
    const hearts = $('#pg-hearts');
    hearts.innerHTML = Array.from({ length: START_HEARTS }, (_, i) => heartIcon(!s.continued && i < s.hearts)).join('');
    if (lostHeart) hearts.children[s.hearts]?.classList.add('lost');
    const [f, t] = s.found;
    $('#pg-stats').innerHTML = `Found <b>${f}/${t}</b>`;
    $('#pg-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#pg-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#pg-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Mode ----------
  let mode: Mode = 'fill';
  function setMode(m: Mode) {
    mode = m;
    for (const b of $('#pg-mode').querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  }
  $('#pg-mode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (b) setMode(b.dataset.mode as Mode);
  });

  // ---------- Marking ----------
  // Press a square to mark it (fill or cross, by the mode). Drag along its row or column
  // to mark more in one go; the drag stops at the first mistake.
  interface Drag {
    pointer: number;
    start: number;
    /** 'x' along the row, 'y' down the column, or null until the finger leaves the square. */
    axis: 'x' | 'y' | null;
    stopped: boolean;
  }
  let drag: Drag | null = null;

  const cellUnder = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
  };

  /** Mark one cell. False if the drag should stop (a mistake). */
  function markCell(i: number): boolean {
    const s = session!;
    const r = s.mark(i, mode);
    if (!r) return true;
    renderer.pop([i, ...r.crossed]);
    if (r.ok) {
      sfx.blip();
      shell.vibrate(6);
    } else {
      sfx.thud();
      shell.vibrate([20, 40, 20]);
    }
    updateHud(!r.ok && !s.continued);
    renderer.invalidate();
    if (r.outOfHearts) setTimeout(showOutOfHearts, 450);
    if (s.won) {
      drag = null;
      renderer.focus = null;
      setTimeout(showWin, 250);
    }
    return r.ok;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || s.awaitingContinue || modalOpen() || drag) return;
    sfx.unlock();
    const i = cellUnder(e);
    if (i === null) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { pointer: e.pointerId, start: i, axis: null, stopped: false };
    renderer.focus = i;
    if (!markCell(i)) drag.stopped = true;
    renderer.invalidate();
  });

  canvas.addEventListener('pointermove', (e) => {
    const d = drag;
    const s = session;
    if (!d || d.pointer !== e.pointerId || !s) return;
    const i = cellUnder(e);
    if (i === null) return;
    const w = s.w;
    const sx = d.start % w;
    const sy = (d.start / w) | 0;
    let x = i % w;
    let y = (i / w) | 0;
    if (!d.axis && i !== d.start) d.axis = Math.abs(x - sx) >= Math.abs(y - sy) ? 'x' : 'y';
    // Keep to the line the drag started along.
    if (d.axis === 'x') y = sy;
    if (d.axis === 'y') x = sx;
    renderer.focus = y * w + x;
    renderer.invalidate();
    if (d.stopped || !d.axis) return;
    const len = d.axis === 'x' ? x - sx : y - sy;
    const step = Math.sign(len);
    for (let k = 1; k <= Math.abs(len); k++) {
      const c = d.axis === 'x' ? sy * w + sx + k * step : (sy + k * step) * w + sx;
      if (!markCell(c)) {
        d.stopped = true;
        break;
      }
      if (!drag) return;
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    drag = null;
    renderer.focus = null;
    renderer.invalidate();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  $('#pg-hint').addEventListener('click', () => {
    const s = session;
    if (!s) return;
    const i = s.hint();
    if (i === null) return;
    renderer.pop([i]);
    sfx.ding();
    shell.vibrate(15);
    updateHud();
    renderer.invalidate();
    if (s.won) setTimeout(showWin, 250);
  });

  function showOutOfHearts() {
    const s = session;
    if (!s || !s.awaitingContinue) return;
    openModal(
      `<h2>Out of hearts</h2>
       <p>You can keep going, but this picture won't earn any stars.</p>
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
  $('#pg-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordPictureClear(progress, s.level.number, stars, s.mistakes.size, s.elapsedMs);
    sfx.chime();
    renderer.celebrate();
    shell.vibrate([20, 60, 20]);
    const what = s.level.name ? `It's ${s.level.name}!` : `Level ${s.level.number} done`;
    const note = s.continued
      ? '<p>Finished after running out of hearts: no stars this time.</p>'
      : stars < 3
        ? '<p>Finish with no mistakes for three stars.</p>'
        : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>${what}</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(s.elapsedMs)} · ${s.mistakes.size} ${s.mistakes.size === 1 ? 'mistake' : 'mistakes'} ${
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
    }, 1100);
  }

  // Re-measure whenever the stage changes size (window resize, the tip or HUD reflowing).
  new ResizeObserver(() => {
    if (session) renderer.resize();
  }).observe($('#pg-stage'));

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
  (window as unknown as { __picture: unknown }).__picture = {
    get session() {
      return session;
    },
    renderer,
    progress,
    setMode,
  };

  return {
    id: 'picture',
    name: 'Picture Grid',
    tagline: 'Use the number clues to fill the grid and reveal a picture.',
    icon: pictureLogo,
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
    resetProgress: () => resetPicture(progress),
    modalLocked: () => winShown || !!session?.awaitingContinue,
  };
}
