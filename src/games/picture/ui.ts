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
    if (drag) clearTimeout(drag.timer);
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
    if (drag) clearTimeout(drag.timer);
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
  // Tap a square to mark it with the switch's mark (fill or cross). Hold it for a moment
  // to use the other mark instead (so in Fill mode, a long press crosses). Drag to paint:
  // every square the finger passes over gets the stroke's mark. A stroke stops at the
  // first mistake, so one bad stroke costs at most one heart.
  const LONG_PRESS_MS = 400;
  interface Stroke {
    pointer: number;
    start: number;
    /** The mark this stroke paints. Settled by a long press, or by moving off the start. */
    mark: Mode;
    /** True once the start square has been marked (the stroke is under way). */
    started: boolean;
    stopped: boolean;
    /** Last finger position, in canvas pixels, to fill in squares a fast drag skips. */
    lastX: number;
    lastY: number;
    timer: number;
  }
  let drag: Stroke | null = null;

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const other = (m: Mode): Mode => (m === 'fill' ? 'cross' : 'fill');

  /** Mark one cell. False if the stroke should stop (a mistake). */
  function markCell(i: number, m: Mode): boolean {
    const s = session!;
    const r = s.mark(i, m);
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
      if (drag) clearTimeout(drag.timer);
      drag = null;
      renderer.focus = null;
      setTimeout(showWin, 250);
    }
    return r.ok;
  }

  /** Begin painting: mark the start square with the stroke's mark. */
  function startStroke(d: Stroke) {
    if (d.started) return;
    d.started = true;
    clearTimeout(d.timer);
    if (!markCell(d.start, d.mark)) d.stopped = true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || s.awaitingContinue || modalOpen() || drag) return;
    sfx.unlock();
    const p = local(e);
    const i = renderer.cellAt(p.x, p.y);
    if (i === null) return;
    canvas.setPointerCapture(e.pointerId);
    const d: Stroke = { pointer: e.pointerId, start: i, mark: mode, started: false, stopped: false, lastX: p.x, lastY: p.y, timer: 0 };
    // Held still long enough: the other mark.
    d.timer = window.setTimeout(() => {
      if (drag !== d || d.started) return;
      d.mark = other(mode);
      shell.vibrate(25);
      startStroke(d);
    }, LONG_PRESS_MS);
    drag = d;
    renderer.focus = i;
    renderer.invalidate();
  });

  canvas.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || d.pointer !== e.pointerId || !session) return;
    const p = local(e);
    const here = renderer.cellAt(p.x, p.y);
    if (here !== null) renderer.focus = here;
    renderer.invalidate();
    // Leaving the start square before the long press starts a stroke with the switch's mark.
    if (!d.started) {
      if (here === d.start) return;
      startStroke(d);
    }
    if (d.stopped) return;
    // Walk the finger's path in small steps so a quick drag doesn't skip squares.
    const dist = Math.hypot(p.x - d.lastX, p.y - d.lastY);
    const steps = Math.max(1, Math.ceil(dist / (renderer.cell / 4)));
    for (let k = 1; k <= steps; k++) {
      const c = renderer.cellAt(d.lastX + ((p.x - d.lastX) * k) / steps, d.lastY + ((p.y - d.lastY) * k) / steps);
      if (c === null) continue;
      if (!markCell(c, d.mark)) {
        d.stopped = true;
        break;
      }
      if (!drag) return;
    }
    d.lastX = p.x;
    d.lastY = p.y;
  });

  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    const d = drag;
    if (!d || d.pointer !== e.pointerId) return;
    clearTimeout(d.timer);
    drag = null;
    // A quick tap that never moved: mark it with the switch's mark.
    if (!d.started && !cancelled) startStroke(d);
    renderer.focus = null;
    renderer.invalidate();
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

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
      if (drag) clearTimeout(drag.timer);
      drag = null;
      renderer.setView(null);
    },
    resetProgress: () => resetPicture(progress),
    modalLocked: () => winShown || !!session?.awaitingContinue,
  };
}
