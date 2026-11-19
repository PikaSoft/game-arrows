import { fmt } from '../../shared/format';
import { extraIcons, icons, pegsLogo, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildPegsLevel } from './core/levels';
import { PegsLevel } from './core/types';
import { Session } from './game/session';
import { loadPegs, PegsProgress, recordPegsClear, resetPegs } from './game/storage';
import { PegsRenderer } from './render/renderer';

export function createPegs(shell: Shell): GameModule {
  const progress: PegsProgress = loadPegs();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<PegsLevel>(
    buildPegsLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'pj-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="pj-home">
    <div class="logo">${pegsLogo}</div>
    <h1>Peg Jump</h1>
    <p>Jump a peg over its neighbour into an empty hole to take the neighbour off. Finish with one peg, on the ringed hole if you can.</p>
    <button class="btn" id="pj-play"></button>
    <button class="btn secondary" id="pj-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="pj-settings-home">Settings</button>
    <button class="btn secondary" id="pj-hub">All puzzles</button>
    <div class="total" id="pj-total"></div>
  </section>

  <section class="screen" id="pj-levels">
    <div class="levels-head">
      <button class="icon-btn" id="pj-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Peg Jump</h2>
    </div>
    <div class="level-grid" id="pj-grid"></div>
  </section>

  <section class="screen" id="pj-game">
    <header class="topbar">
      <button class="icon-btn" id="pj-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="pj-title"></b><span id="pj-diff"></span></div>
      <button class="icon-btn" id="pj-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="pj-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="pj-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <button class="icon-btn" id="pj-undo" aria-label="Undo">${extraIcons.undo}</button>
      <div class="stats" id="pj-stats"></div>
      <div class="timer" id="pj-timer">0:00</div>
      <button class="icon-btn" id="pj-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="pj-hint-count"></span></button>
    </div>
    <p class="tip" id="pj-tip"></p>
    <div class="stage" id="pj-stage">
      <canvas id="pj-board"></canvas>
      <div class="loading" id="pj-loading" hidden>Setting out the pegs…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#pj-board');
  const renderer = new PegsRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`pj-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#pj-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#pj-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#pj-grid');
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

  $('#pj-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#pj-play').addEventListener('click', () => startLevel(progress.current));
  $('#pj-open-levels').addEventListener('click', () => show('levels'));
  $('#pj-levels-back').addEventListener('click', () => show('home'));
  $('#pj-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#pj-settings-home').addEventListener('click', shell.openSettings);
  $('#pj-settings').addEventListener('click', shell.openSettings);
  $('#pj-hub').addEventListener('click', shell.goHub);
  $('#pj-theme').addEventListener('click', shell.cycleTheme);

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
    $('#pj-title').textContent = `Level ${n}`;
    $('#pj-diff').textContent = '';
    $('#pj-tip').textContent = '';
    $('#pj-stats').textContent = '';
    $('#pj-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#pj-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: PegsLevel) {
    session = new Session(level);
    const diffEl = $('#pj-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.score !== undefined ? `Search effort ${level.score} bits` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#pj-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#pj-stats').innerHTML = `Pegs <b>${s.left}</b> · Jumps <b>${s.moves}</b>`;
    $<HTMLButtonElement>('#pj-undo').disabled = !s.canUndo;
    $('#pj-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#pj-hint').disabled = s.hints === 0 || s.finished;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#pj-timer').textContent = fmt(session.elapsedMs);
  }

  function afterMove() {
    updateHud();
    renderer.invalidate();
    if (session?.cleared) setTimeout(showWin, 450);
    else if (session?.finished) setTimeout(showStuck, 450);
  }

  // ---------- Input ----------
  // Tap a peg to pick it up (the holes it can jump to are marked), then tap one of them.
  // Or drag the peg straight onto the hole. A peg that can't jump gives a small shake.
  let press: { pointer: number; cell: number; picked: boolean } | null = null;
  const cellOf = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
  };

  function tapCell(i: number) {
    const s = session!;
    const res = s.tap(i);
    if (res === 'jump') {
      renderer.jumped(s.lastJump!);
      sfx.blip();
      shell.vibrate(12);
    } else if (res === 'stuck') {
      renderer.shake(i);
      shell.vibrate(12);
    } else if (res) sfx.blip();
    afterMove();
  }

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.finished || modalOpen() || press) return;
    sfx.unlock();
    const i = cellOf(e);
    if (i === null) return;
    canvas.setPointerCapture(e.pointerId);
    // A peg is picked up at once, so its marked holes show while dragging.
    const picked = s.pegs[i] && s.selected !== i;
    press = { pointer: e.pointerId, cell: i, picked };
    if (picked) tapCell(i);
  });

  const endPress = (e: PointerEvent, cancelled: boolean) => {
    const p = press;
    if (!p || p.pointer !== e.pointerId) return;
    press = null;
    const s = session;
    if (!s || cancelled || s.finished) return;
    const i = cellOf(e);
    if (i === null) return;
    if (i !== p.cell) {
      // A drag: drop the picked-up peg on a hole it can jump to.
      if (s.selected === p.cell && !s.pegs[i]) tapCell(i);
      return;
    }
    // A tap on an empty hole jumps there; a tap on the peg already picked up puts it down.
    if (!s.pegs[i] || !p.picked) tapCell(i);
  };
  canvas.addEventListener('pointerup', (e) => endPress(e, false));
  canvas.addEventListener('pointercancel', (e) => endPress(e, true));

  $('#pj-undo').addEventListener('click', () => {
    const s = session;
    if (!s || s.undo() === null) return;
    closeModal();
    winShown = false;
    sfx.blip();
    afterMove();
  });

  $('#pj-hint').addEventListener('click', () => {
    const s = session;
    if (!s) return;
    const h = s.hint();
    if (h === null) return;
    if (h === 'dead') {
      shell.toast('No way to one peg from here: undo');
      return;
    }
    sfx.ding();
    shell.vibrate(15);
    afterMove();
  });

  function showStuck() {
    const s = session;
    if (!s || !s.finished || s.cleared || modalOpen() || !$('#pj-game').classList.contains('active')) return;
    openModal(
      `<h2>No jumps left</h2>
       <p>${s.left} pegs are left. Finish with two or fewer to clear the level. Undo is free.</p>
       <div class="actions">
         <button class="btn" data-action="undo">Undo</button>
         <button class="btn small secondary" data-action="restart">Restart</button>
       </div>`,
      (action) => {
        if (action === 'undo') {
          closeModal();
          session?.undo();
          afterMove();
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
  $('#pj-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.cleared) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordPegsClear(progress, s.level.number, stars, s.moves, s.elapsedMs);
    sfx.chime();
    renderer.celebrate();
    shell.vibrate([20, 60, 20]);
    const how = s.onGoal ? 'one peg, on the ring' : s.left === 1 ? 'one peg' : 'two pegs';
    const note =
      stars < 3
        ? `<p>${s.hintsUsed ? 'Each hint costs a star. ' : ''}${s.onGoal ? '' : 'Finish with one peg on the ring for three stars.'}</p>`
        : '';
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>Level ${s.level.number}: ${how}</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.moves} jumps · ${fmt(s.elapsedMs)} ${
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
  }).observe($('#pj-stage'));

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
  (window as unknown as { __pegs: unknown }).__pegs = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'pegs',
    name: 'Peg Jump',
    tagline: 'Jump pegs over each other until one is left.',
    icon: pegsLogo,
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
    resetProgress: () => resetPegs(progress),
    modalLocked: () => winShown,
  };
}
