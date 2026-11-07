import { fmt } from '../../shared/format';
import { extraIcons, icons, linesLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildLinesLevel } from './core/levels';
import { LinesLevel } from './core/types';
import { Session } from './game/session';
import { LinesProgress, loadLines, recordLinesClear, resetLines } from './game/storage';
import { LinesRenderer } from './render/renderer';

export function createLines(shell: Shell): GameModule {
  const progress: LinesProgress = loadLines();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<LinesLevel>(
    buildLinesLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'cl-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="cl-home">
    <div class="logo">${linesLogo}</div>
    <h1>Colour Lines</h1>
    <p>Join each pair of dots with a line. Lines can't cross, and together they fill the board.</p>
    <button class="btn" id="cl-play"></button>
    <button class="btn secondary" id="cl-open-levels">Levels</button>
    <button class="btn secondary" id="cl-settings-home">Settings</button>
    <button class="btn secondary" id="cl-hub">All puzzles</button>
    <div class="total" id="cl-total"></div>
  </section>

  <section class="screen" id="cl-levels">
    <div class="levels-head">
      <button class="icon-btn" id="cl-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Colour Lines</h2>
    </div>
    <div class="level-grid" id="cl-grid"></div>
  </section>

  <section class="screen" id="cl-game">
    <header class="topbar">
      <button class="icon-btn" id="cl-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="cl-title"></b><span id="cl-diff"></span></div>
      <button class="icon-btn" id="cl-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="cl-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="cl-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="cl-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="cl-stats"></div>
      <div class="timer" id="cl-timer">0:00</div>
      <button class="icon-btn" id="cl-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="cl-hint-count"></span></button>
    </div>
    <p class="tip" id="cl-tip"></p>
    <div class="stage" id="cl-stage">
      <canvas id="cl-board"></canvas>
      <div class="loading" id="cl-loading" hidden>Building the board…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#cl-board');
  const renderer = new LinesRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`cl-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#cl-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#cl-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#cl-grid');
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

  $('#cl-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#cl-play').addEventListener('click', () => startLevel(progress.current));
  $('#cl-open-levels').addEventListener('click', () => show('levels'));
  $('#cl-levels-back').addEventListener('click', () => show('home'));
  $('#cl-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#cl-settings-home').addEventListener('click', shell.openSettings);
  $('#cl-settings').addEventListener('click', shell.openSettings);
  $('#cl-hub').addEventListener('click', shell.goHub);
  $('#cl-theme').addEventListener('click', shell.cycleTheme);

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
    pointer = null;
    renderer.setView(null);
    $('#cl-title').textContent = `Level ${n}`;
    $('#cl-diff').textContent = '';
    $('#cl-tip').textContent = '';
    $('#cl-stats').textContent = '';
    $('#cl-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#cl-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: LinesLevel) {
    session = new Session(level);
    pointer = null;
    const diffEl = $('#cl-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title =
      level.score !== undefined ? `On average ${level.score.toFixed(2)} line ends to look at for each one with only one way to go` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#cl-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#cl-stats').innerHTML = `Lines <b>${s.joined}/${s.colours}</b> · Filled <b>${s.filledPercent}%</b>`;
    $<HTMLButtonElement>('#cl-undo').disabled = !s.canUndo || s.won;
    $('#cl-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#cl-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#cl-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    renderer.invalidate();
    if (session?.won) setTimeout(showWin, 350);
  }

  // ---------- Drawing ----------
  // Press on a dot (or a line's loose end) and drag. The line follows the finger cell by
  // cell; a quick drag across several cells is walked one step at a time, so it never
  // jumps over anything.
  let pointer: number | null = null;

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Colours joined right now, to spot the moment one gets joined. */
  const joinedSet = (s: Session) => new Set(s.dots.map((_, c) => c).filter((c) => s.isComplete(c)));
  let joinedBefore = new Set<number>();

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || pointer !== null) return;
    sfx.unlock();
    const p = local(e);
    const cell = renderer.cellAt(p.x, p.y);
    if (cell === null) return;
    joinedBefore = joinedSet(s);
    if (s.begin(cell) === null) return;
    pointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    renderer.finger = p;
    shell.vibrate(8);
    noteJoins();
  });

  /** Walk the line toward the cell under the finger, one neighbouring cell at a time. */
  function walkTo(tx: number, ty: number) {
    const s = session!;
    const w = s.w;
    for (let guard = 0; guard < 64; guard++) {
      const head = s.head;
      if (head === null) return;
      const hx = head % w;
      const hy = (head / w) | 0;
      const dx = tx - hx;
      const dy = ty - hy;
      if (!dx && !dy) return;
      const stepX = dx ? head + Math.sign(dx) : -1;
      const stepY = dy ? head + Math.sign(dy) * w : -1;
      const first = Math.abs(dx) >= Math.abs(dy) ? [stepX, stepY] : [stepY, stepX];
      if (!first.some((c) => c >= 0 && s.extend(c))) return;
    }
  }

  function noteJoins() {
    const s = session!;
    const now = joinedSet(s);
    for (const c of now) {
      if (joinedBefore.has(c)) continue;
      renderer.joined(c);
      sfx.ding();
      shell.vibrate(15);
    }
    joinedBefore = now;
  }

  canvas.addEventListener('pointermove', (e) => {
    const s = session;
    if (!s || pointer !== e.pointerId) return;
    const p = local(e);
    renderer.finger = p;
    const f = renderer.toCell(p.x, p.y);
    const tx = Math.max(0, Math.min(s.w - 1, Math.floor(f.x)));
    const ty = Math.max(0, Math.min(s.h - 1, Math.floor(f.y)));
    walkTo(tx, ty);
    noteJoins();
    updateHud();
    renderer.invalidate();
  });

  const endDrag = (e: PointerEvent) => {
    const s = session;
    if (!s || pointer !== e.pointerId) return;
    pointer = null;
    renderer.finger = null;
    s.end();
    afterMove();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  $('#cl-undo').addEventListener('click', () => {
    const s = session;
    if (!s || s.won || !s.undo()) return;
    sfx.blip();
    afterMove();
  });

  $('#cl-hint').addEventListener('click', () => {
    const s = session;
    if (!s || s.hint() === null) return;
    sfx.ding();
    shell.vibrate(15);
    joinedBefore = joinedSet(s);
    afterMove();
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#cl-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordLinesClear(progress, s.level.number, stars, s.moves, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note = stars < 3 ? `<p>Solve it without hints for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number} filled</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(s.elapsedMs)} · ${s.moves} ${s.moves === 1 ? 'line' : 'lines'} drawn ${
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
  }).observe($('#cl-stage'));

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
  (window as unknown as { __lines: unknown }).__lines = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'lines',
    name: 'Colour Lines',
    tagline: 'Join each pair of dots and fill the whole board.',
    icon: linesLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      session?.end();
      session = null;
      pointer = null;
      renderer.setView(null);
    },
    resetProgress: () => resetLines(progress),
    modalLocked: () => winShown,
  };
}
