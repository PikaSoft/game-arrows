import { fmt } from '../../shared/format';
import { heartIcon, icons, starIcon, tonesLogo } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildTonesLevel } from './core/levels';
import { TonesLevel } from './core/types';
import { Mode, Session, START_HEARTS } from './game/session';
import { loadTones, recordTonesClear, resetTones, TonesProgress } from './game/storage';
import { TONE_A, TONE_B, TonesRenderer } from './render/renderer';

/** A small swatch of a tone for the switch: a filled disc or a ring. */
const toneSvg = (m: Mode) =>
  m === 'a'
    ? `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="${TONE_A}"/></svg>`
    : `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="${TONE_B}" stroke-width="3.5"/></svg>`;

export function createTones(shell: Shell): GameModule {
  const progress: TonesProgress = loadTones();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<TonesLevel>(
    buildTonesLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'to-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="to-home">
    <div class="logo">${tonesLogo}</div>
    <h1>Two Tones</h1>
    <p>Fill the grid with orange and blue: never three in a row, every line half and half, and no two lines the same.</p>
    <button class="btn" id="to-play"></button>
    <button class="btn secondary" id="to-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="to-settings-home">Settings</button>
    <button class="btn secondary" id="to-hub">All puzzles</button>
    <div class="total" id="to-total"></div>
  </section>

  <section class="screen" id="to-levels">
    <div class="levels-head">
      <button class="icon-btn" id="to-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Two Tones</h2>
    </div>
    <div class="level-grid" id="to-grid"></div>
  </section>

  <section class="screen" id="to-game">
    <header class="topbar">
      <button class="icon-btn" id="to-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="to-title"></b><span id="to-diff"></span></div>
      <button class="icon-btn" id="to-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="to-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="to-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="to-hearts" aria-label="Hearts"></div>
      <div class="stats" id="to-stats"></div>
      <div class="timer" id="to-timer">0:00</div>
      <button class="icon-btn" id="to-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="to-hint-count"></span></button>
    </div>
    <p class="tip" id="to-tip"></p>
    <div class="stage" id="to-stage">
      <canvas id="to-board"></canvas>
      <div class="loading" id="to-loading" hidden>Building the board…</div>
    </div>
    <div class="mode-bar"><div class="seg" id="to-mode" role="group" aria-label="What a tap does">
      <button data-mode="a" aria-pressed="true">${toneSvg('a')} Orange</button><button data-mode="b" aria-pressed="false">${toneSvg('b')} Blue</button>
    </div></div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#to-board');
  const renderer = new TonesRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`to-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#to-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#to-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#to-grid');
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

  $('#to-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#to-play').addEventListener('click', () => startLevel(progress.current));
  $('#to-open-levels').addEventListener('click', () => show('levels'));
  $('#to-levels-back').addEventListener('click', () => show('home'));
  $('#to-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#to-settings-home').addEventListener('click', shell.openSettings);
  $('#to-settings').addEventListener('click', shell.openSettings);
  $('#to-hub').addEventListener('click', shell.goHub);
  $('#to-theme').addEventListener('click', shell.cycleTheme);

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
    $('#to-title').textContent = `Level ${n}`;
    $('#to-diff').textContent = '';
    $('#to-tip').textContent = '';
    $('#to-stats').textContent = '';
    $('#to-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#to-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: TonesLevel) {
    session = new Session(level);
    if (drag) clearTimeout(drag.timer);
    drag = null;
    setMode('a');
    const diffEl = $('#to-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.hardest ? `Hardest step needed: ${level.hardest}` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#to-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud(lostHeart = false) {
    const s = session;
    if (!s) return;
    const hearts = $('#to-hearts');
    hearts.innerHTML = Array.from({ length: START_HEARTS }, (_, i) => heartIcon(!s.continued && i < s.hearts)).join('');
    if (lostHeart) hearts.children[s.hearts]?.classList.add('lost');
    $('#to-stats').innerHTML = `Left <b>${s.left}</b>`;
    $('#to-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#to-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#to-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Mode ----------
  let mode: Mode = 'a';
  function setMode(m: Mode) {
    mode = m;
    for (const b of $('#to-mode').querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  }
  $('#to-mode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (b) setMode(b.dataset.mode as Mode);
  });

  // ---------- Marking ----------
  // Tap a square to fill it with the switch's tone. Hold it for a moment to use the other
  // tone instead. Drag to paint:
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
  const other = (m: Mode): Mode => (m === 'a' ? 'b' : 'a');

  /** Mark one cell. False if the stroke should stop (a mistake). */
  function markCell(i: number, m: Mode): boolean {
    const s = session!;
    const r = s.mark(i, m);
    if (!r) return true;
    renderer.pop([i]);
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

  $('#to-hint').addEventListener('click', () => {
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

  // Keyboard: arrows move a cursor, 1 or 2 (or A and B) fill with orange or blue, Space
  // switches the tone.
  let cursor = 0;
  document.addEventListener('keydown', (e) => {
    const s = session;
    if (!s || modalOpen() || !$('#to-game').classList.contains('active') || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = s.size;
    const k = e.key.toLowerCase();
    const moves: Record<string, number> = { arrowleft: -1, arrowright: 1, arrowup: -n, arrowdown: n };
    if (k in moves) {
      const x = cursor % n;
      if ((k === 'arrowleft' && x === 0) || (k === 'arrowright' && x === n - 1)) return;
      const next = cursor + moves[k];
      if (next >= 0 && next < n * n) cursor = next;
      renderer.focus = cursor;
    } else if (k === '1' || k === 'a' || k === '2' || k === 'b') {
      if (s.won || s.awaitingContinue) return;
      markCell(cursor, k === '1' || k === 'a' ? 'a' : 'b');
    } else if (k === ' ') setMode(other(mode));
    else return;
    e.preventDefault();
    renderer.invalidate();
  });

  function showOutOfHearts() {
    const s = session;
    if (!s || !s.awaitingContinue) return;
    openModal(
      `<h2>Out of hearts</h2>
       <p>You can keep going, but this board won't earn any stars.</p>
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
  $('#to-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordTonesClear(progress, s.level.number, stars, s.mistakes.size, s.elapsedMs);
    sfx.chime();
    renderer.celebrate();
    shell.vibrate([20, 60, 20]);
    const what = `Level ${s.level.number}: in balance`;
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
    }, 700);
  }

  // Re-measure whenever the stage changes size (window resize, the tip or HUD reflowing).
  new ResizeObserver(() => {
    if (session) renderer.resize();
  }).observe($('#to-stage'));

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
  (window as unknown as { __tones: unknown }).__tones = {
    get session() {
      return session;
    },
    renderer,
    progress,
    setMode,
  };

  return {
    id: 'tones',
    name: 'Two Tones',
    tagline: 'Orange and blue, half and half, never three in a row.',
    icon: tonesLogo,
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
    resetProgress: () => resetTones(progress),
    modalLocked: () => winShown || !!session?.awaitingContinue,
  };
}
