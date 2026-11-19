import { fmt } from '../../shared/format';
import { beamsLogo, extraIcons, icons, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildBeamLevel } from './core/levels';
import { BeamLevel, FIXED, MIRROR } from './core/types';
import { Session } from './game/session';
import { BeamsProgress, loadBeams, recordBeamsClear, resetBeams } from './game/storage';
import { BeamRenderer, BeamView } from './render/renderer';

export function createBeams(shell: Shell): GameModule {
  const progress: BeamsProgress = loadBeams();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<BeamLevel>(
    buildBeamLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'mb-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="mb-home">
    <div class="logo">${beamsLogo}</div>
    <h1>Mirror Beam</h1>
    <p>Tap mirrors to turn them so every beam of light reaches the target of its colour.</p>
    <button class="btn" id="mb-play"></button>
    <button class="btn secondary" id="mb-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="mb-settings-home">Settings</button>
    <button class="btn secondary" id="mb-hub">All puzzles</button>
    <div class="total" id="mb-total"></div>
  </section>

  <section class="screen" id="mb-levels">
    <div class="levels-head">
      <button class="icon-btn" id="mb-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Mirror Beam</h2>
    </div>
    <div class="level-grid" id="mb-grid"></div>
  </section>

  <section class="screen" id="mb-game">
    <header class="topbar">
      <button class="icon-btn" id="mb-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="mb-title"></b><span id="mb-diff"></span></div>
      <button class="icon-btn" id="mb-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="mb-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="mb-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="mb-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="mb-stats"></div>
      <div class="timer" id="mb-timer">0:00</div>
      <button class="icon-btn" id="mb-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="mb-hint-count"></span></button>
    </div>
    <p class="tip" id="mb-tip"></p>
    <div class="stage" id="mb-stage">
      <canvas id="mb-board"></canvas>
      <div class="loading" id="mb-loading" hidden>Setting up the mirrors…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#mb-board');
  const renderer = new BeamRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`mb-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#mb-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#mb-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#mb-grid');
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

  $('#mb-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#mb-play').addEventListener('click', () => startLevel(progress.current));
  $('#mb-open-levels').addEventListener('click', () => show('levels'));
  $('#mb-levels-back').addEventListener('click', () => show('home'));
  $('#mb-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#mb-settings-home').addEventListener('click', shell.openSettings);
  $('#mb-settings').addEventListener('click', shell.openSettings);
  $('#mb-hub').addEventListener('click', shell.goHub);
  $('#mb-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let session: Session | null = null;
  let loadToken = 0;
  let lastTick = performance.now();
  let winShown = false;

  const viewOf = (s: Session): BeamView => ({
    w: s.w,
    h: s.h,
    cells: s.level.cells,
    beams: s.level.beams,
    orient: s.orient,
    locked: s.locked,
    get hinted() {
      return s.hinted;
    },
    get status() {
      return s.status;
    },
  });

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    session = null;
    renderer.setView(null);
    $('#mb-title').textContent = `Level ${n}`;
    $('#mb-diff').textContent = '';
    $('#mb-tip').textContent = '';
    $('#mb-stats').textContent = '';
    $('#mb-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#mb-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: BeamLevel) {
    session = new Session(level);
    const diffEl = $('#mb-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.score !== undefined ? `Search effort ${level.score} bits` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(viewOf(session));
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#mb-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    const st = s.status;
    const done = st.reached.filter(Boolean).length;
    const crystals = st.crystals ? ` · Crystals <b>${st.lit.size}/${st.crystals}</b>` : '';
    $('#mb-stats').innerHTML = `Taps <b>${s.moves}</b> · Par <b>${s.level.par}</b> · Lit <b>${done}/${st.reached.length}</b>${crystals}`;
    $<HTMLButtonElement>('#mb-undo').disabled = !s.canUndo || s.won;
    $('#mb-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#mb-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#mb-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    renderer.invalidate();
    if (session?.won) setTimeout(showWin, 350);
  }

  // ---------- Input ----------
  // Tap a mirror to turn it. A press that slides off its cell does nothing.
  let press: { pointer: number; cell: number } | null = null;

  const cellUnder = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || press) return;
    sfx.unlock();
    const i = cellUnder(e);
    if (i === null) return;
    canvas.setPointerCapture(e.pointerId);
    press = { pointer: e.pointerId, cell: i };
  });

  const endPress = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    press = null;
    const s = session;
    if (!s || cancelled || cellUnder(e) !== p.cell) return;
    if (s.tap(p.cell)) {
      sfx.blip();
      shell.vibrate(8);
      afterMove();
    } else if (s.level.cells[p.cell] === FIXED || s.level.cells[p.cell] === MIRROR) {
      // A pinned mirror: shake to show it won't turn.
      renderer.shake(p.cell);
      shell.vibrate(12);
    }
  };
  canvas.addEventListener('pointerup', (e) => endPress(e, false));
  canvas.addEventListener('pointercancel', (e) => endPress(e, true));

  $('#mb-undo').addEventListener('click', () => {
    const s = session;
    if (!s || s.undo() === null) return;
    sfx.blip();
    afterMove();
  });

  $('#mb-hint').addEventListener('click', () => {
    const s = session;
    if (!s || s.hint() === null) return;
    sfx.ding();
    shell.vibrate(15);
    afterMove();
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#mb-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestMoves, prev } = recordBeamsClear(progress, s.level.number, stars, s.moves, s.elapsedMs);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note = stars < 3 ? `<p>Light them all in ${s.level.par} taps or fewer for three stars.</p>` : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number}: all lit</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.moves} taps (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
           newBestMoves ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${prev!.bestMoves} taps`
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
  }).observe($('#mb-stage'));

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
  (window as unknown as { __beams: unknown }).__beams = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'beams',
    name: 'Mirror Beam',
    tagline: 'Turn mirrors so every beam reaches the target of its colour.',
    icon: beamsLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      session = null;
      press = null;
      renderer.setView(null);
    },
    resetProgress: () => resetBeams(progress),
    modalLocked: () => winShown,
  };
}
