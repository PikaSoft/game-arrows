import { fmt } from '../../shared/format';
import { heartIcon, icons, starIcon, tentsLogo } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildTentsLevel } from './core/levels';
import { TentsLevel } from './core/types';
import { Mode, Session, START_HEARTS } from './game/session';
import { loadTents, recordTentsClear, resetTents, TentsProgress } from './game/storage';
import { TentsRenderer } from './render/renderer';

export function createTents(shell: Shell): GameModule {
  const progress: TentsProgress = loadTents();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<TentsLevel>(
    buildTentsLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'tt-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="tt-home">
    <div class="logo">${tentsLogo}</div>
    <h1>Tents and Trees</h1>
    <p>Pitch a tent beside every tree. Tents never touch, and the numbers say how many go in each row and column.</p>
    <button class="btn" id="tt-play"></button>
    <button class="btn secondary" id="tt-open-levels">Levels</button>
    <button class="btn secondary" id="tt-settings-home">Settings</button>
    <button class="btn secondary" id="tt-hub">All puzzles</button>
    <div class="total" id="tt-total"></div>
  </section>

  <section class="screen" id="tt-levels">
    <div class="levels-head">
      <button class="icon-btn" id="tt-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Tents and Trees</h2>
    </div>
    <div class="level-grid" id="tt-grid"></div>
  </section>

  <section class="screen" id="tt-game">
    <header class="topbar">
      <button class="icon-btn" id="tt-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="tt-title"></b><span id="tt-diff"></span></div>
      <button class="icon-btn" id="tt-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="tt-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="tt-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="tt-hearts" aria-label="Hearts"></div>
      <div class="stats" id="tt-stats"></div>
      <div class="timer" id="tt-timer">0:00</div>
      <button class="icon-btn" id="tt-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="tt-hint-count"></span></button>
    </div>
    <p class="tip" id="tt-tip"></p>
    <div class="stage" id="tt-stage">
      <canvas id="tt-board"></canvas>
      <div class="loading" id="tt-loading" hidden>Building the board…</div>
    </div>
    <div class="mode-bar"><div class="seg" id="tt-mode" role="group" aria-label="What a tap does">
      <button data-mode="tent" aria-pressed="true">Tent</button><button data-mode="grass" aria-pressed="false">Grass</button>
    </div></div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#tt-board');
  const renderer = new TentsRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`tt-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#tt-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#tt-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#tt-grid');
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

  $('#tt-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#tt-play').addEventListener('click', () => startLevel(progress.current));
  $('#tt-open-levels').addEventListener('click', () => show('levels'));
  $('#tt-levels-back').addEventListener('click', () => show('home'));
  $('#tt-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#tt-settings-home').addEventListener('click', shell.openSettings);
  $('#tt-settings').addEventListener('click', shell.openSettings);
  $('#tt-hub').addEventListener('click', shell.goHub);
  $('#tt-theme').addEventListener('click', shell.cycleTheme);

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
    $('#tt-title').textContent = `Level ${n}`;
    $('#tt-diff').textContent = '';
    $('#tt-tip').textContent = '';
    $('#tt-stats').textContent = '';
    $('#tt-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#tt-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: TentsLevel) {
    session = new Session(level);
    drag = null;
    setMode('tent');
    const diffEl = $('#tt-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title =
      level.score !== undefined ? `On average ${level.score.toFixed(2)} open squares for each one the rules settle in a pass` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#tt-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud(lostHeart = false) {
    const s = session;
    if (!s) return;
    const hearts = $('#tt-hearts');
    hearts.innerHTML = Array.from({ length: START_HEARTS }, (_, i) => heartIcon(!s.continued && i < s.hearts)).join('');
    if (lostHeart) hearts.children[s.hearts]?.classList.add('lost');
    const [f, t] = s.found;
    $('#tt-stats').innerHTML = `Tents <b>${f}/${t}</b>`;
    $('#tt-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#tt-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#tt-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Mode ----------
  let mode: Mode = 'tent';
  function setMode(m: Mode) {
    mode = m;
    for (const b of $('#tt-mode').querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  }
  $('#tt-mode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (b) setMode(b.dataset.mode as Mode);
  });

  // ---------- Marking ----------
  // Press a square to mark it (tent or grass, by the mode). Drag along its row or column
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
    renderer.pop([i, ...r.grassed]);
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

  $('#tt-hint').addEventListener('click', () => {
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
       <p>You can keep going, but this campsite won't earn any stars.</p>
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
  $('#tt-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordTentsClear(progress, s.level.number, stars, s.mistakes.size, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const what = `Level ${s.level.number}: all pitched`;
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
  }).observe($('#tt-stage'));

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
  (window as unknown as { __tents: unknown }).__tents = {
    get session() {
      return session;
    },
    renderer,
    progress,
    setMode,
  };

  return {
    id: 'tents',
    name: 'Tents and Trees',
    tagline: 'Pitch a tent beside every tree. Tents never touch.',
    icon: tentsLogo,
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
    resetProgress: () => resetTents(progress),
    modalLocked: () => winShown || !!session?.awaitingContinue,
  };
}
