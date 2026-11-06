import { fmt } from '../../shared/format';
import { icons, pauseIcon, snakeLogo, starIcon, trailsLogo } from '../../shared/icons';
import { Rng } from '../../shared/rng';
import { GameModule, Shell } from '../types';
import { buildSnakeLevel } from './core/levels';
import { SnakeSim } from './core/sim';
import { Dir, opposite, SnakeLevel } from './core/types';
import {
  ClassicProgress,
  loadClassic,
  loadTrails,
  recordClassicGame,
  recordTrailClear,
  resetClassic,
  resetTrails,
  saveClassic,
  TrailsProgress,
} from './game/storage';
import { attachSwipe, keyDir } from './input/swipe';
import { SnakeRenderer } from './render/renderer';

export type SnakeMode = 'classic' | 'trails';

/** Classic speeds in steps per second. */
const SPEEDS: Record<string, { label: string; base: number }> = {
  slow: { label: 'Slow', base: 6 },
  normal: { label: 'Normal', base: 8 },
  fast: { label: 'Fast', base: 11 },
};
const CLASSIC_W = 15;

type Phase = 'ready' | 'playing' | 'paused' | 'over';

/** Stars for a Snake Trails clear: within par for three, within 1.5 times par for two. */
export const trailStars = (ms: number, par: number) => (ms <= par ? 3 : ms <= par * 1.5 ? 2 : 1);

/** Both snake games share this: `classic` is endless, `trails` has numbered levels with walls. */
export function createSnakeGame(shell: Shell, mode: SnakeMode): GameModule {
  const classic = mode === 'classic';
  const P = classic ? 'sn' : 'st';
  const name = classic ? 'Snake' : 'Snake Trails';
  const logo = classic ? snakeLogo : trailsLogo;
  const cp: ClassicProgress | null = classic ? loadClassic() : null;
  const tp: TrailsProgress | null = classic ? null : loadTrails();
  if (cp && !SPEEDS[cp.speed]) cp.speed = 'normal';
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = `${P}-root`;
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(`#${P}-${sel}`) as T;

  const homeExtra = classic
    ? `<div class="seg" id="${P}-speed" role="group" aria-label="Speed">${Object.entries(SPEEDS)
        .map(([k, v]) => `<button data-speed="${k}">${v.label}</button>`)
        .join('')}</div>`
    : '';
  root.innerHTML = `
  <section class="screen home" id="${P}-home">
    <div class="logo">${logo}</div>
    <h1>${name}</h1>
    <p>${
      classic
        ? 'Eat apples, grow longer, and keep clear of the edges, your own tail and the poison.'
        : 'Steer around the walls and the poison, and eat enough apples to clear each level.'
    }</p>
    ${homeExtra}
    <button class="btn" id="${P}-play"></button>
    ${classic ? '' : `<button class="btn secondary" id="${P}-open-levels">Levels</button>`}
    <button class="btn secondary" id="${P}-settings-home">Settings</button>
    <button class="btn secondary" id="${P}-hub">All puzzles</button>
    <div class="total" id="${P}-total"></div>
  </section>

  ${
    classic
      ? ''
      : `<section class="screen" id="${P}-levels">
    <div class="levels-head">
      <button class="icon-btn" id="${P}-levels-back" aria-label="Back">${icons.back}</button>
      <h2>${name}</h2>
    </div>
    <div class="level-grid" id="${P}-grid"></div>
  </section>`
  }

  <section class="screen" id="${P}-game">
    <header class="topbar">
      <button class="icon-btn" id="${P}-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="${P}-title"></b><span id="${P}-diff"></span></div>
      <button class="icon-btn" id="${P}-restart" aria-label="Restart">${icons.restart}</button>
      <button class="icon-btn" id="${P}-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="${P}-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="${P}-pause" aria-label="Pause">${pauseIcon}</button>
      <div class="stats" id="${P}-stats"></div>
      <div class="timer" id="${P}-timer">0:00</div>
    </div>
    <p class="tip" id="${P}-tip"></p>
    <div class="stage" id="${P}-stage">
      <canvas id="${P}-board"></canvas>
      <div class="snake-overlay" id="${P}-overlay" hidden><span></span></div>
    </div>
  </section>`;

  const renderer = new SnakeRenderer($<HTMLCanvasElement>('board'), shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    if (id !== 'game') stopGame();
    shell.show(`${P}-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
  }

  const totalStars = () => (tp ? Object.values(tp.levels).reduce((s, l) => s + l.stars, 0) : 0);
  const classicBest = () => (cp ? Math.max(0, ...Object.values(cp.best)) : 0);

  function renderHome() {
    if (cp) {
      $('play').textContent = 'Play';
      for (const b of $('speed').querySelectorAll<HTMLElement>('[data-speed]')) {
        b.setAttribute('aria-pressed', String(b.dataset.speed === cp.speed));
      }
      const best = cp.best[cp.speed] ?? 0;
      $('total').textContent = best ? `Best at ${SPEEDS[cp.speed].label.toLowerCase()} speed: ${best} apples` : '';
    } else if (tp) {
      $('play').textContent = tp.current === 1 && !tp.levels[1] ? 'Play' : `Play level ${tp.current}`;
      const t = totalStars();
      $('total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
    }
  }

  function renderLevels() {
    if (!tp) return;
    const grid = $('grid');
    const tiles: string[] = [];
    for (let n = 1; n <= tp.unlocked + 1; n++) {
      if (n > tp.unlocked) {
        tiles.push(`<button class="tile locked" disabled aria-label="Level ${n}, locked">${icons.lock}</button>`);
        break;
      }
      const rec = tp.levels[n];
      const stars = rec ? [0, 1, 2].map((i) => starIcon(i < rec.stars)).join('') : '';
      const cls = n === tp.current ? 'tile current' : 'tile';
      tiles.push(`<button class="${cls}" data-level="${n}" aria-label="Level ${n}"><b>${n}</b><span class="stars">${stars}</span></button>`);
    }
    grid.innerHTML = tiles.join('');
    grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
  }

  if (cp) {
    $('speed').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-speed]');
      if (!b) return;
      cp.speed = b.dataset.speed!;
      saveClassic(cp);
      renderHome();
    });
    $('play').addEventListener('click', startClassic);
  } else {
    $('play').addEventListener('click', () => startLevel(tp!.current));
    $('open-levels').addEventListener('click', () => show('levels'));
    $('levels-back').addEventListener('click', () => show('home'));
    $('grid').addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
      if (t) startLevel(Number(t.dataset.level));
    });
  }
  $('back').addEventListener('click', () => {
    closeModal();
    show(classic ? 'home' : 'levels');
  });
  $('settings-home').addEventListener('click', shell.openSettings);
  $('settings').addEventListener('click', shell.openSettings);
  $('hub').addEventListener('click', shell.goHub);
  $('theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let sim: SnakeSim | null = null;
  let level: SnakeLevel | null = null;
  let phase: Phase = 'ready';
  let elapsedMs = 0;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let winShown = false;

  const speedNow = () => {
    if (level) return level.speed;
    const base = SPEEDS[cp!.speed].base;
    return base + Math.min(5, Math.floor((sim?.eaten ?? 0) / 5) * 0.5);
  };

  function setOverlay(text: string | null) {
    const el = $('overlay');
    el.hidden = !text;
    if (text) el.querySelector('span')!.textContent = text;
  }

  function enterGame(s: SnakeSim) {
    closeModal();
    shell.show(`${P}-game`);
    sim = s;
    phase = 'ready';
    elapsedMs = 0;
    acc = 0;
    winShown = false;
    renderer.setSim(s);
    renderer.resize();
    setOverlay('Swipe or press an arrow key to start');
    updateHud();
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function startClassic() {
    level = null;
    // Pick a board height that fills the screen; the width stays the same.
    shell.show(`${P}-game`);
    renderer.resize();
    const h = Math.max(13, Math.min(24, Math.round(CLASSIC_W / renderer.aspect)));
    const x = Math.floor(CLASSIC_W / 2);
    const y = h - 5;
    const s = new SnakeSim({
      w: CLASSIC_W,
      h,
      start: [0, 1, 2].map((k) => ({ x, y: y + k })),
      dir: 0,
      rng: new Rng(Date.now()),
    });
    $('title').textContent = 'Snake';
    $('diff').textContent = SPEEDS[cp!.speed].label;
    $('diff').className = '';
    $('tip').textContent = '';
    enterGame(s);
  }

  function startLevel(n: number) {
    level = buildSnakeLevel(n);
    const s = new SnakeSim({
      w: level.w,
      h: level.h,
      walls: level.walls,
      start: level.start,
      dir: level.dir,
      target: level.target,
      rng: new Rng(n * 31 + 7),
    });
    $('title').textContent = `Level ${n}`;
    const diff = $('diff');
    diff.textContent = level.difficulty;
    diff.className = `diff-${level.difficulty.split(' ')[0]}`;
    diff.title = `${level.speed} moves a second, ${level.target} apples`;
    $('tip').textContent = level.tip ?? '';
    enterGame(s);
  }

  function stopGame() {
    cancelAnimationFrame(raf);
    raf = 0;
    sim = null;
    renderer.setSim(null);
  }

  function updateHud() {
    const s = sim;
    if (!s) return;
    if (level) $('stats').innerHTML = `Apples <b>${s.eaten}</b> / <b>${s.target}</b> · Par <b>${fmt(level.par)}</b>`;
    else $('stats').innerHTML = `Apples <b>${s.eaten}</b> · Best <b>${Math.max(cp!.best[cp!.speed] ?? 0, s.eaten)}</b>`;
    $<HTMLButtonElement>('pause').disabled = phase !== 'playing';
    updateTimer();
  }
  function updateTimer() {
    $('timer').textContent = fmt(elapsedMs);
  }

  function resume() {
    if (!sim || (phase !== 'ready' && phase !== 'paused') || modalOpen()) return;
    sfx.unlock();
    phase = 'playing';
    last = performance.now();
    setOverlay(null);
    updateHud();
  }

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    setOverlay('Paused. Tap or swipe to carry on');
    updateHud();
  }

  function restart() {
    closeModal();
    if (classic) startClassic();
    else if (level) startLevel(level.number);
  }

  function doStep() {
    const s = sim;
    if (!s) return;
    const r = s.step();
    if (r.ate) {
      sfx.chomp();
      renderer.pop(s.head);
      shell.vibrate(10);
      updateHud();
    }
    if (r.died) {
      phase = 'over';
      renderer.crash();
      sfx.thud();
      shell.vibrate([40, 40, 40]);
      setTimeout(() => showOver(s), 750);
    } else if (r.won) {
      phase = 'over';
      acc = 0;
      renderer.alpha = 1;
      setTimeout(() => showWin(s), 450);
    }
    updateHud();
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 250);
    last = now;
    if (!sim) return;
    if (phase === 'playing') {
      if (modalOpen() || document.visibilityState !== 'visible') pause();
      else {
        elapsedMs += dt;
        acc += dt;
        const stepMs = 1000 / speedNow();
        while (acc >= stepMs && phase === 'playing') {
          acc -= stepMs;
          doStep();
        }
        if (phase === 'playing') renderer.alpha = acc / stepMs;
        updateTimer();
      }
    }
    renderer.invalidate();
  }

  function onDir(d: Dir) {
    const s = sim;
    if (!s || phase === 'over' || modalOpen()) return;
    if (phase === 'playing') s.turn(d);
    else {
      if (d !== opposite(s.heading)) s.turn(d);
      resume();
    }
  }

  function onTap() {
    if (!sim || modalOpen()) return;
    if (phase === 'over') {
      if (!winShown) restart();
    } else resume();
  }

  attachSwipe($('stage'), onDir, onTap);
  $('pause').addEventListener('click', pause);
  $('restart').addEventListener('click', restart);

  document.addEventListener('keydown', (e) => {
    if (!$('game').classList.contains('active') || modalOpen() || !sim) return;
    const d = keyDir(e.key);
    if (d !== undefined) {
      e.preventDefault();
      onDir(d);
    } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (phase === 'playing') pause();
      else onTap();
    } else if (e.key === 'Enter') onTap();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function showOver(s: SnakeSim) {
    if (sim !== s) return;
    if (cp) {
      const { prev, newBest } = recordClassicGame(cp, cp.speed, s.eaten, s.length);
      setOverlay('Tap to play again');
      openModal(
        `<h2>Game over</h2>
         <div class="result-line">${s.eaten} apples · length ${s.length} · ${fmt(elapsedMs)}</div>
         <p>${newBest ? (prev ? '<span class="best">New best!</span>' : 'First game done. Now beat it.') : `Best at this speed: ${prev} apples`}</p>
         <div class="actions">
           <button class="btn" data-action="again">Play again</button>
           <button class="btn small secondary" data-action="home">Home</button>
         </div>`,
        (action) => {
          if (action === 'again') startClassic();
          else show('home');
        },
      );
    } else {
      setOverlay('Tap to try again');
      openModal(
        `<h2>Crashed</h2>
         <p>You ate ${s.eaten} of ${s.target} apples.</p>
         <div class="actions">
           <button class="btn" data-action="retry">Try again</button>
           <button class="btn small secondary" data-action="levels">Levels</button>
         </div>`,
        (action) => {
          if (action === 'retry') restart();
          else {
            closeModal();
            show('levels');
          }
        },
      );
    }
  }

  function showWin(s: SnakeSim) {
    if (sim !== s || winShown) return;
    winShown = true;
    sfx.chime();
    renderer.confetti();
    shell.vibrate([20, 60, 20]);
    if (cp) {
      // Classic only "wins" when the snake fills the whole board.
      const { newBest } = recordClassicGame(cp, cp.speed, s.eaten, s.length);
      openModal(
        `<h2>Board full!</h2>
         <div class="result-line">${s.eaten} apples · ${fmt(elapsedMs)}${newBest ? ' <span class="best">· New best!</span>' : ''}</div>
         <div class="actions"><button class="btn" data-action="again">Play again</button></div>`,
        () => startClassic(),
        false,
      );
      return;
    }
    const lv = level!;
    const stars = trailStars(elapsedMs, lv.par);
    const { prev, newBest } = recordTrailClear(tp!, lv.number, stars, Math.round(elapsedMs));
    const note = stars < 3 ? `<p>Finish within ${fmt(lv.par)} for three stars.</p>` : '';
    setTimeout(() => {
      if (sim !== s) return;
      openModal(
        `<h2>Level ${lv.number} cleared</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${fmt(elapsedMs)} (par ${fmt(lv.par)}) ${
           newBest ? (prev ? '<span class="best">· New best!</span>' : '') : `· Best ${fmt(prev!.bestMs)}`
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
          if (action === 'next') startLevel(lv.number + 1);
          else if (action === 'replay') startLevel(lv.number);
          else {
            closeModal();
            show('levels');
          }
        },
        false,
      );
    }, 500);
  }

  window.addEventListener('resize', () => {
    if (sim) renderer.resize();
  });

  // Hook for automated browser tests.
  (window as unknown as Record<string, unknown>)[classic ? '__snake' : '__trails'] = {
    get sim() {
      return sim;
    },
    get phase() {
      return phase;
    },
    get elapsedMs() {
      return elapsedMs;
    },
    onDir,
    step: doStep,
    resume,
    renderer,
    progress: cp ?? tp,
  };

  return {
    id: classic ? 'snake' : 'snake-trails',
    name,
    tagline: classic ? 'Eat, grow, and don’t bite your tail.' : 'Weave past the walls and clear each level.',
    icon: logo,
    summary: () => {
      if (cp) {
        const best = classicBest();
        return { status: best ? `Best ${best} apple${best === 1 ? '' : 's'}` : 'Start playing', stars: 0 };
      }
      const started = Object.keys(tp!.levels).length > 0;
      return { status: started ? `Level ${tp!.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => stopGame(),
    resetProgress: () => (cp ? resetClassic(cp) : resetTrails(tp!)),
    modalLocked: () => winShown,
  };
}
