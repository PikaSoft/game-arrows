import { fmt } from '../../shared/format';
import { extraIcons, icons, sandLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildSandLevel } from './core/levels';
import { SandLevel } from './core/types';
import { Session } from './game/session';
import { loadSand, recordSandClear, resetSand, SandProgress } from './game/storage';
import { SandRenderer } from './render/renderer';

export function createSandglass(shell: Shell): GameModule {
  const progress: SandProgress = loadSand();
  const { sfx, toast, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<SandLevel>(
    buildSandLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'sg-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="sg-home">
    <div class="logo">${sandLogo}</div>
    <h1>Sandglass</h1>
    <p>Pour sand from bottle to bottle until each one holds a single colour.</p>
    <button class="btn" id="sg-play"></button>
    <button class="btn secondary" id="sg-open-levels">Levels</button>
    <button class="btn secondary" id="sg-settings-home">Settings</button>
    <button class="btn secondary" id="sg-hub">All puzzles</button>
    <div class="total" id="sg-total"></div>
  </section>

  <section class="screen" id="sg-levels">
    <div class="levels-head">
      <button class="icon-btn" id="sg-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Sandglass</h2>
    </div>
    <div class="level-grid" id="sg-grid"></div>
  </section>

  <section class="screen" id="sg-game">
    <header class="topbar">
      <button class="icon-btn" id="sg-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="sg-title"></b><span id="sg-diff"></span></div>
      <button class="icon-btn" id="sg-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="sg-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="sg-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="sg-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="sg-stats"></div>
      <div class="timer" id="sg-timer">0:00</div>
      <button class="icon-btn" id="sg-add" aria-label="Add an empty bottle">${extraIcons.addBottle}<span class="badge" id="sg-add-count">1</span></button>
    </div>
    <p class="tip" id="sg-tip"></p>
    <div class="stage" id="sg-stage">
      <canvas id="sg-board"></canvas>
      <div class="loading" id="sg-loading" hidden>Filling bottles…</div>
    </div>
  </section>`;

  const renderer = new SandRenderer($<HTMLCanvasElement>('#sg-board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`sg-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#sg-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#sg-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#sg-grid');
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

  $('#sg-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#sg-play').addEventListener('click', () => startLevel(progress.current));
  $('#sg-open-levels').addEventListener('click', () => show('levels'));
  $('#sg-levels-back').addEventListener('click', () => show('home'));
  $('#sg-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#sg-settings-home').addEventListener('click', shell.openSettings);
  $('#sg-settings').addEventListener('click', shell.openSettings);
  $('#sg-hub').addEventListener('click', shell.goHub);
  $('#sg-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let session: Session | null = null;
  let loadToken = 0;
  let lastTick = performance.now();
  let winShown = false;
  let stuckShown = false;

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    session = null;
    renderer.setView(null);
    $('#sg-title').textContent = `Level ${n}`;
    $('#sg-diff').textContent = '';
    $('#sg-tip').textContent = '';
    $('#sg-stats').textContent = '';
    $('#sg-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#sg-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: SandLevel) {
    session = new Session(level);
    const diffEl = $('#sg-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.score ? `About ${level.score.toFixed(2)} pours to try per move on average to find a safe one` : '';
    winShown = false;
    stuckShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    renderer.resize();
    $('#sg-tip').textContent = level.tip ?? '';
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#sg-stats').innerHTML = `Moves <b>${s.moves}</b> · Par <b>${s.level.par}</b>`;
    $<HTMLButtonElement>('#sg-undo').disabled = !s.canUndo || s.won;
    $<HTMLButtonElement>('#sg-add').disabled = s.addedBottle || s.won;
    $('#sg-add-count').textContent = s.addedBottle ? '0' : '1';
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#sg-timer').textContent = fmt(session.elapsedMs);
  }

  /** Try to pour from one bottle into another and play the result. */
  function tryPour(from: number, to: number) {
    const s = session!;
    renderer.selected = null;
    const res = s.pour(from, to);
    if (res.kind === 'invalid') {
      renderer.shake(from);
      sfx.thud();
      shell.vibrate(25);
      renderer.invalidate();
      return;
    }
    renderer.pour(res.from, res.to, res.color, res.amount, res.before);
    sfx.pour(0.25 + res.amount * 0.08);
    if (res.completed) {
      renderer.complete(res.to);
      sfx.ding(0.4);
      shell.vibrate(15);
    }
    updateHud();
    if (s.won) setTimeout(showWin, 750);
    else if (s.stuck) setTimeout(showStuck, 750);
  }

  function select(i: number) {
    const s = session!;
    if (!s.bottles[i].length) return;
    renderer.selected = i;
    sfx.blip();
    renderer.invalidate();
  }

  function handleTap(i: number | null) {
    const s = session;
    if (!s || s.won || modalOpen()) return;
    sfx.unlock();
    const sel = renderer.selected;
    if (i === null) {
      renderer.selected = null;
      renderer.invalidate();
      return;
    }
    if (sel === null) select(i);
    else if (sel === i) {
      renderer.selected = null;
      renderer.invalidate();
    } else tryPour(sel, i);
  }

  // Pointer input: tap-tap, or drag a bottle onto another.
  const canvas = $<HTMLCanvasElement>('#sg-board');
  let press: { id: number; index: number | null; x: number; y: number; dragging: boolean } | null = null;
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!session || session.won || modalOpen() || press) return;
    const p = pos(e);
    press = { id: e.pointerId, index: renderer.hitTest(p.x, p.y), x: p.x, y: p.y, dragging: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId || press.index === null || !session) return;
    const p = pos(e);
    if (!press.dragging) {
      if (Math.hypot(p.x - press.x, p.y - press.y) < 10 || !session.bottles[press.index].length) return;
      press.dragging = true;
      sfx.unlock();
      const slot = renderer.slots[press.index];
      renderer.selected = null;
      renderer.drag = { index: press.index, x: p.x, y: p.y, dx: press.x - slot.x, dy: press.y - slot.base };
    }
    renderer.drag!.x = p.x;
    renderer.drag!.y = p.y;
    renderer.invalidate();
  });
  const endPress = (e: PointerEvent, cancelled: boolean) => {
    if (!press || press.id !== e.pointerId) return;
    const pr = press;
    press = null;
    if (pr.dragging) {
      renderer.drag = null;
      const p = pos(e);
      const target = cancelled ? null : renderer.hitTest(p.x, p.y, pr.index!);
      if (target !== null && session) tryPour(pr.index!, target);
      else renderer.invalidate();
    } else if (!cancelled) handleTap(pr.index);
  };
  canvas.addEventListener('pointerup', (e) => endPress(e, false));
  canvas.addEventListener('pointercancel', (e) => endPress(e, true));

  $('#sg-undo').addEventListener('click', () => {
    const s = session;
    if (!s || !s.undo()) return;
    renderer.selected = null;
    renderer.setView(s);
    sfx.blip();
    stuckShown = false;
    updateHud();
  });

  function addBottle() {
    const s = session;
    if (!s || !s.addBottle()) return;
    renderer.selected = null;
    renderer.setView(s);
    sfx.blip();
    toast('Extra bottle added: two stars at most');
    stuckShown = false;
    updateHud();
  }
  $('#sg-add').addEventListener('click', addBottle);

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#sg-restart').addEventListener('click', restartLevel);

  function showStuck() {
    const s = session;
    if (!s || !s.stuck || stuckShown || modalOpen()) return;
    stuckShown = true;
    const body = s.shuttling
      ? `<h2>Going in circles</h2>
       <p>The only pour left moves the same colour back and forth between two bottles. Step back, add a spare bottle, or start over.</p>`
      : `<h2>No moves left</h2>
       <p>There is nowhere left to pour. Step back, add a spare bottle, or start over.</p>`;
    openModal(
      `${body}
       <div class="actions">
         <button class="btn" data-action="undo">Undo</button>
         ${s.addedBottle ? '' : '<button class="btn secondary" data-action="add">Add a bottle</button>'}
         <button class="btn secondary" data-action="restart">Restart level</button>
       </div>`,
      (action) => {
        closeModal();
        if (action === 'undo') $('#sg-undo').click();
        else if (action === 'add') addBottle();
        else restartLevel();
      },
    );
  }

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestMoves, prev } = recordSandClear(progress, s.level.number, stars, s.moves, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    let note = '';
    if (s.addedBottle) note = '<p>You used the extra bottle, so two stars is the most for this clear.</p>';
    else if (stars < 3) note = `<p>Finish in ${s.level.par} moves or fewer for three stars.</p>`;
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number} sorted</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.moves} moves (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
           newBestMoves ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${prev!.bestMoves} moves`
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

  window.addEventListener('resize', () => {
    if (session) renderer.resize();
  });

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
  (window as unknown as { __sand: unknown }).__sand = {
    get session() {
      return session;
    },
    renderer,
    progress,
    tryPour: (a: number, b: number) => tryPour(a, b),
  };

  return {
    id: 'sandglass',
    name: 'Sandglass',
    tagline: 'Pour the sand until every bottle is one colour.',
    icon: sandLogo,
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
    resetProgress: () => resetSand(progress),
    modalLocked: () => winShown,
  };
}
