import { fmt } from '../../shared/format';
import { extraIcons, icons, loopLogo, pauseIcon, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildLoopLevel } from './core/levels';
import { starsFor } from './core/rules';
import { Events, LoopSim, Snapshot, STEP_HZ } from './core/sim';
import { LoopLevel } from './core/types';
import { LoopProgress, loadLoop, recordLoopClear, resetLoop } from './game/storage';
import { LoopRenderer } from './render/renderer';

type Phase = 'playing' | 'paused' | 'over';

export function createLoop(shell: Shell): GameModule {
  const progress: LoopProgress = loadLoop();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<LoopLevel>(
    buildLoopLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'lp-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="lp-home">
    <div class="logo">${loopLogo}</div>
    <h1>Colour Loop</h1>
    <p>Tip crates of cubes onto the turning belt and let the trays sort them by colour. Don't let the belt jam.</p>
    <button class="btn" id="lp-play"></button>
    <button class="btn secondary" id="lp-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="lp-settings-home">Settings</button>
    <button class="btn secondary" id="lp-hub">All puzzles</button>
    <div class="total" id="lp-total"></div>
  </section>

  <section class="screen" id="lp-levels">
    <div class="levels-head">
      <button class="icon-btn" id="lp-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Colour Loop</h2>
    </div>
    <div class="level-grid" id="lp-grid"></div>
  </section>

  <section class="screen" id="lp-game">
    <header class="topbar">
      <button class="icon-btn" id="lp-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="lp-title"></b><span id="lp-diff"></span></div>
      <button class="icon-btn" id="lp-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="lp-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="lp-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="lp-undo" aria-label="Undo last tap">${extraIcons.undo}<span class="badge" id="lp-undo-count" hidden></span></button>
      <div class="stats" id="lp-stats"></div>
      <div class="timer" id="lp-timer">0:00</div>
      <button class="icon-btn" id="lp-pause" aria-label="Pause">${pauseIcon}</button>
    </div>
    <p class="tip" id="lp-tip"></p>
    <div class="stage" id="lp-stage">
      <canvas id="lp-board"></canvas>
      <div class="loading" id="lp-loading" hidden>Loading the crates…</div>
      <div class="snake-overlay" id="lp-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#lp-board');
  const renderer = new LoopRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`lp-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
    else pause();
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#lp-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#lp-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#lp-grid');
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

  $('#lp-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#lp-play').addEventListener('click', () => startLevel(progress.current));
  $('#lp-open-levels').addEventListener('click', () => show('levels'));
  $('#lp-levels-back').addEventListener('click', () => show('home'));
  $('#lp-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#lp-settings-home').addEventListener('click', shell.openSettings);
  $('#lp-settings').addEventListener('click', shell.openSettings);
  $('#lp-hub').addEventListener('click', shell.goHub);
  $('#lp-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let sim: LoopSim | null = null;
  let level: LoopLevel | null = null;
  let phase: Phase = 'playing';
  let loadToken = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let winShown = false;
  /** The belt just before each tap, newest last. Undo goes back to the newest. */
  let history: Snapshot[] = [];
  let undos = 0;

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    sim = null;
    renderer.setSim(null);
    $('#lp-title').textContent = `Level ${n}`;
    $('#lp-diff').textContent = '';
    $('#lp-tip').textContent = '';
    $('#lp-stats').textContent = '';
    $('#lp-loading').hidden = false;
    const l = await levels.get(n);
    if (token !== loadToken) return;
    $('#lp-loading').hidden = true;
    begin(l);
    void levels.get(n + 1); // warm up the next one
  }

  function begin(l: LoopLevel) {
    level = l;
    sim = new LoopSim(l);
    renderer.setSim(sim);
    phase = 'playing';
    acc = 0;
    last = performance.now();
    winShown = false;
    history = [];
    undos = 0;
    const diffEl = $('#lp-diff');
    diffEl.textContent = l.difficulty;
    diffEl.className = `diff-${l.difficulty.split(' ')[0]}`;
    diffEl.title = l.score !== undefined ? `Score ${l.score} (how often careless taps jam the belt, a clock, covered crates)` : '';
    $('#lp-tip').textContent = l.tip ?? '';
    renderer.resize();
    setOverlay(null);
    updateHud();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function setOverlay(text: string | null) {
    const o = $('#lp-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  const simMs = (ticks: number) => (ticks * 1000) / STEP_HZ;

  function updateHud() {
    const s = sim;
    if (!s) return;
    $('#lp-stats').innerHTML = `Trays <b>${s.traysLeft}</b> · Belt <b>${s.load}/${s.capacity}</b>`;
    $<HTMLButtonElement>('#lp-undo').disabled = !history.length || s.won;
    const badge = $('#lp-undo-count');
    badge.hidden = undos === 0;
    badge.textContent = String(undos);
    $<HTMLButtonElement>('#lp-pause').disabled = phase !== 'playing';
    updateTimer();
  }
  function updateTimer() {
    const s = sim;
    if (!s) return;
    const limit = s.level.limitTicks;
    const el = $('#lp-timer');
    // With a clock, count down; without, count up.
    el.textContent = limit ? fmt(Math.max(0, simMs(limit - s.ticks) + 999)) : fmt(simMs(s.ticks));
    el.classList.toggle('low', limit > 0 && limit - s.ticks < 10 * STEP_HZ);
  }

  function resume() {
    if (phase !== 'paused') return;
    phase = 'playing';
    last = performance.now();
    setOverlay(null);
    updateHud();
  }

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    setOverlay('Paused. Tap to carry on');
    updateHud();
  }
  $('#lp-pause').addEventListener('click', pause);

  /** Tip the front crate of a column onto the belt. */
  function tap(col: number) {
    const s = sim;
    if (!s || phase === 'over' || modalOpen()) return;
    sfx.unlock();
    if (phase === 'paused') {
      resume();
      return;
    }
    if (!s.canTap(col)) return;
    history.push(s.snapshot());
    s.tap(col);
    renderer.tapped(col);
    sfx.whoosh(0.14);
    shell.vibrate(8);
    updateHud();
  }

  function undo() {
    const s = sim;
    const snap = history.pop();
    if (!s || !snap || s.won) return;
    closeModal();
    s.restore(snap);
    renderer.clearMotion();
    undos++;
    acc = 0;
    last = performance.now();
    phase = 'playing';
    setOverlay(null);
    sfx.blip();
    updateHud();
  }
  $('#lp-undo').addEventListener('click', undo);

  function handle(ev: Events) {
    renderer.handle(ev);
    if (ev.shipped.length) {
      sfx.ding();
      shell.vibrate(12);
    } else if (ev.taken.length) sfx.blip();
    if (ev.dropped.length || ev.taken.length) updateHud();
    if (ev.won) {
      phase = 'over';
      updateHud();
      setTimeout(showWin, 450);
    } else if (ev.jammed) {
      phase = 'over';
      sfx.thud();
      shell.vibrate([30, 40, 30]);
      updateHud();
      setTimeout(showJam, 700);
    } else if (ev.timeUp) {
      phase = 'over';
      sfx.thud();
      shell.vibrate([30, 40, 30]);
      updateHud();
      setTimeout(showTimeUp, 400);
    }
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    const s = sim;
    if (!s) return;
    const stepMs = 1000 / STEP_HZ;
    if (phase === 'playing') {
      if (modalOpen() || document.visibilityState !== 'visible') pause();
      else {
        acc += dt;
        while (acc >= stepMs && phase === 'playing') {
          acc -= stepMs;
          handle(s.step());
        }
        updateTimer();
      }
    }
    const part = phase === 'playing' ? acc / stepMs : 0;
    renderer.draw(Math.min(1, (s.sub + part) / s.level.ticksPerSlot));
  }

  // ---------- Input ----------
  const stage = $('#lp-stage');
  stage.addEventListener('pointerdown', (e) => {
    if (!sim || modalOpen()) return;
    if (phase === 'paused') {
      sfx.unlock();
      resume();
      return;
    }
    const r = canvas.getBoundingClientRect();
    const col = renderer.colAt(e.clientX - r.left, e.clientY - r.top);
    if (col >= 0) tap(col);
  });

  document.addEventListener('keydown', (e) => {
    if (!sim || !$('#lp-game').classList.contains('active') || modalOpen()) return;
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      tap(Number(e.key) - 1);
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (phase === 'playing') pause();
      else resume();
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      e.preventDefault();
      undo();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function restartLevel() {
    if (!level) return;
    closeModal();
    begin(level);
  }
  $('#lp-restart').addEventListener('click', restartLevel);

  function showJam() {
    const s = sim;
    if (!s || !level || !s.jammed) return;
    openModal(
      `<h2>Belt jammed</h2>
       <p>The belt filled up with cubes no tray was ready for. Undo takes back your last tap.</p>
       <div class="actions">
         <button class="btn" data-action="undo">Undo last tap</button>
         <div class="row">
           <button class="btn small secondary" data-action="restart">Restart</button>
           <button class="btn small secondary" data-action="levels">Levels</button>
         </div>
       </div>`,
      (action) => {
        if (action === 'undo') undo();
        else if (action === 'restart') restartLevel();
        else {
          closeModal();
          show('levels');
        }
      },
      false,
    );
  }

  function showTimeUp() {
    const s = sim;
    if (!s || !level || !s.timeUp) return;
    openModal(
      `<h2>Out of time</h2>
       <p>${s.traysLeft} ${s.traysLeft === 1 ? 'tray' : 'trays'} left. Have another go?</p>
       <div class="actions">
         <button class="btn" data-action="restart">Try again</button>
         <button class="btn secondary" data-action="levels">Levels</button>
       </div>`,
      (action) => {
        if (action === 'restart') restartLevel();
        else {
          closeModal();
          show('levels');
        }
      },
      false,
    );
  }

  function showWin() {
    const s = sim;
    if (!s || !level || winShown || !s.won) return;
    winShown = true;
    const l = level;
    const stars = starsFor(undos);
    const used = undos;
    const ms = simMs(s.ticks);
    const { newBestTime, prev } = recordLoopClear(progress, l.number, stars, used, ms);
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    const note = stars < 3 ? '<p>Clear it with no undos for three stars.</p>' : '';
    setTimeout(() => {
      if (level !== l) return;
      openModal(
        `<h2>Level ${l.number} cleared</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(ms)} · ${used} ${used === 1 ? 'undo' : 'undos'} ${
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
          if (action === 'next') startLevel(l.number + 1);
          else if (action === 'replay') startLevel(l.number);
          else if (action === 'levels') {
            closeModal();
            show('levels');
          }
        },
        false,
      );
    }, 700);
  }

  // Re-measure whenever the stage changes size (window resize, the tip reflowing).
  new ResizeObserver(() => {
    if (sim) renderer.resize();
  }).observe(stage);

  // Hook for automated browser tests.
  (window as unknown as { __loop: unknown }).__loop = {
    get sim() {
      return sim;
    },
    get level() {
      return level;
    },
    get phase() {
      return phase;
    },
    get undos() {
      return undos;
    },
    renderer,
    progress,
    tap,
    undo,
  };

  return {
    id: 'loop',
    name: 'Colour Loop',
    tagline: 'Tip crates onto a turning belt and sort the cubes by colour.',
    icon: loopLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      cancelAnimationFrame(raf);
      raf = 0;
      sim = null;
      level = null;
      history = [];
      renderer.setSim(null);
    },
    resetProgress: () => resetLoop(progress),
    modalLocked: () => winShown || !!sim?.jammed || !!sim?.timeUp,
  };
}
