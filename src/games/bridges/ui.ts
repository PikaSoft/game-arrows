import { fmt } from '../../shared/format';
import { bridgesLogo, heartIcon, icons, starIcon } from '../../shared/icons';
import { LevelSource } from '../../shared/levelSource';
import { GameModule, Shell } from '../types';
import { buildBridgesLevel } from './core/levels';
import { BridgesLevel } from './core/types';
import { Session, START_HEARTS } from './game/session';
import { BridgesProgress, loadBridges, recordBridgesClear, resetBridges } from './game/storage';
import { BridgesRenderer } from './render/renderer';

export function createBridges(shell: Shell): GameModule {
  const progress: BridgesProgress = loadBridges();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  const levels = new LevelSource<BridgesLevel>(
    buildBridgesLevel,
    () => new Worker(new URL('./game/levelWorker.ts', import.meta.url), { type: 'module' }),
  );

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'ib-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="ib-home">
    <div class="logo">${bridgesLogo}</div>
    <h1>Island Bridges</h1>
    <p>Join the islands with straight bridges. Each number says how many bridges that island needs, and every island must be joined up.</p>
    <button class="btn" id="ib-play"></button>
    <button class="btn secondary" id="ib-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="ib-settings-home">Settings</button>
    <button class="btn secondary" id="ib-hub">All puzzles</button>
    <div class="total" id="ib-total"></div>
  </section>

  <section class="screen" id="ib-levels">
    <div class="levels-head">
      <button class="icon-btn" id="ib-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Island Bridges</h2>
    </div>
    <div class="level-grid" id="ib-grid"></div>
  </section>

  <section class="screen" id="ib-game">
    <header class="topbar">
      <button class="icon-btn" id="ib-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="ib-title"></b><span id="ib-diff"></span></div>
      <button class="icon-btn" id="ib-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="ib-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="ib-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="hearts" id="ib-hearts" aria-label="Hearts"></div>
      <div class="stats" id="ib-stats"></div>
      <div class="timer" id="ib-timer">0:00</div>
      <button class="icon-btn" id="ib-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="ib-hint-count"></span></button>
    </div>
    <p class="tip" id="ib-tip"></p>
    <div class="stage" id="ib-stage">
      <canvas id="ib-board"></canvas>
      <div class="loading" id="ib-loading" hidden>Charting the islands…</div>
    </div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#ib-board');
  const renderer = new BridgesRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`ib-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#ib-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#ib-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#ib-grid');
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

  $('#ib-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#ib-play').addEventListener('click', () => startLevel(progress.current));
  $('#ib-open-levels').addEventListener('click', () => show('levels'));
  $('#ib-levels-back').addEventListener('click', () => show('home'));
  $('#ib-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#ib-settings-home').addEventListener('click', shell.openSettings);
  $('#ib-settings').addEventListener('click', shell.openSettings);
  $('#ib-hub').addEventListener('click', shell.goHub);
  $('#ib-theme').addEventListener('click', shell.cycleTheme);

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
    press = null;
    renderer.setView(null);
    $('#ib-title').textContent = `Level ${n}`;
    $('#ib-diff').textContent = '';
    $('#ib-tip').textContent = '';
    $('#ib-stats').textContent = '';
    $('#ib-loading').hidden = false;
    const level = await levels.get(n);
    if (token !== loadToken) return;
    $('#ib-loading').hidden = true;
    beginSession(level);
    void levels.get(n + 1); // warm up the next one
  }

  function beginSession(level: BridgesLevel) {
    session = new Session(level);
    mapLinks(level);
    press = null;
    const diffEl = $('#ib-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = level.hardest ? `Hardest step needed: ${level.hardest}` : '';
    winShown = false;
    lastTick = performance.now();
    renderer.setView(session);
    // Fill the tip first: it changes the stage's height, which resize() measures.
    $('#ib-tip').textContent = level.tip ?? '';
    renderer.resize();
    updateHud();
  }

  function updateHud(lostHeart = false) {
    const s = session;
    if (!s) return;
    const hearts = $('#ib-hearts');
    hearts.innerHTML = Array.from({ length: START_HEARTS }, (_, i) => heartIcon(!s.continued && i < s.hearts)).join('');
    if (lostHeart) hearts.children[s.hearts]?.classList.add('lost');
    $('#ib-stats').innerHTML = `Islands <b>${s.islandsDone}/${s.level.islands.length}</b>`;
    $('#ib-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#ib-hint').disabled = s.hints === 0 || s.won;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#ib-timer').textContent = fmt(session.elapsedMs);
  }

  // ---------- Building ----------
  // Drag from an island toward another to build a bridge between them; the link it would
  // use is previewed while dragging. Or tap the water between two islands. Each drag or
  // tap adds one bridge.
  interface Press {
    pointer: number;
    /** The island pressed, or null for water. */
    island: number | null;
    x: number;
    y: number;
    link: number | null;
  }
  let press: Press | null = null;

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** For each island, the link leaving it right, down, left and up (or -1). */
  let around: number[][] = [];
  function mapLinks(level: BridgesLevel) {
    around = level.islands.map(() => [-1, -1, -1, -1]);
    level.links.forEach((l, k) => {
      around[l.a][l.across ? 0 : 1] = k;
      around[l.b][l.across ? 2 : 3] = k;
    });
  }

  const islandAt = (x: number, y: number): number | null => {
    const s = session;
    if (!s) return null;
    const i = s.level.islands.findIndex((p) => p.x === x && p.y === y);
    return i < 0 ? null : i;
  };

  /**
   * The link through a square of water. Where two links cross, the tap must lean along
   * one of them (off the middle of the square); a tap in the middle is too close to call,
   * so it returns 'unclear' rather than guess and risk a heart.
   */
  function linkThrough(x: number, y: number, fx: number, fy: number): number | null | 'unclear' {
    const s = session!;
    const c = y * s.level.w + x;
    const here = s.level.links.map((l, k) => (l.cells.includes(c) ? k : -1)).filter((k) => k >= 0);
    if (here.length < 2) return here[0] ?? null;
    const built = here.filter((k) => s.bridges[k] > 0);
    if (built.length === 1) return built[0];
    if (Math.abs(Math.abs(fx) - Math.abs(fy)) < 0.12) return 'unclear';
    const across = Math.abs(fy) < Math.abs(fx);
    return here.find((k) => s.level.links[k].across === across) ?? here[0];
  }

  function build(k: number) {
    const s = session!;
    const r = s.build(k);
    if (!r) return;
    const l = s.level.links[k];
    if ('blocked' in r) {
      renderer.shake(l.a);
      renderer.shake(l.b);
      shell.vibrate(12);
      shell.toast(r.blocked === 'cross' ? 'Bridges can\'t cross' : r.blocked === 'double' ? 'Two bridges at most' : 'That island has all its bridges');
      return;
    }
    if (r.ok) {
      sfx.blip();
      shell.vibrate(8);
    } else {
      renderer.flash(k);
      sfx.thud();
      shell.vibrate([20, 40, 20]);
    }
    updateHud(!r.ok && !s.continued);
    renderer.invalidate();
    if (r.outOfHearts) setTimeout(showOutOfHearts, 450);
    if (s.won) setTimeout(showWin, 250);
  }

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || s.won || s.awaitingContinue || modalOpen() || press) return;
    sfx.unlock();
    const p = local(e);
    const sq = renderer.squareAt(p.x, p.y);
    if (!sq) return;
    canvas.setPointerCapture(e.pointerId);
    const island = islandAt(sq.x, sq.y);
    press = { pointer: e.pointerId, island, x: p.x, y: p.y, link: null };
    if (island !== null) {
      renderer.from = island;
      renderer.invalidate();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const d = press;
    if (!d || d.pointer !== e.pointerId || d.island === null) return;
    const p = local(e);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    // Point the way the finger has moved furthest, once it has moved a little.
    let k: number | null = null;
    if (Math.hypot(dx, dy) > renderer.cell * 0.4) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
      const l = around[d.island][dir];
      k = l >= 0 ? l : null;
    }
    if (k !== d.link) {
      d.link = k;
      renderer.preview = k;
      renderer.invalidate();
    }
  });

  const endPress = (e: PointerEvent, cancelled: boolean) => {
    const d = press;
    if (!d || d.pointer !== e.pointerId) return;
    press = null;
    renderer.from = null;
    renderer.preview = null;
    renderer.invalidate();
    if (cancelled || !session) return;
    if (d.island !== null) {
      if (d.link !== null) build(d.link);
      return;
    }
    // A tap on water (that didn't wander off its square).
    const p = local(e);
    const a = renderer.squareAt(d.x, d.y);
    const b = renderer.squareAt(p.x, p.y);
    if (!a || !b || a.x !== b.x || a.y !== b.y) return;
    const k = linkThrough(a.x, a.y, a.fx, a.fy);
    if (k === 'unclear') shell.toast('Two bridges could pass here: tap nearer one, or drag from an island');
    else if (k !== null) build(k);
  };
  canvas.addEventListener('pointerup', (e) => endPress(e, false));
  canvas.addEventListener('pointercancel', (e) => endPress(e, true));

  $('#ib-hint').addEventListener('click', () => {
    const s = session;
    if (!s) return;
    const k = s.hint();
    if (k === null) return;
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
  $('#ib-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordBridgesClear(progress, s.level.number, stars, s.mistakes, s.elapsedMs);
    sfx.chime();
    renderer.celebrate();
    shell.vibrate([20, 60, 20]);
    const what = `Level ${s.level.number}: all joined up`;
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
         <div class="result-line">${fmt(s.elapsedMs)} · ${s.mistakes} ${s.mistakes === 1 ? 'mistake' : 'mistakes'} ${
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
  }).observe($('#ib-stage'));

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
  (window as unknown as { __bridges: unknown }).__bridges = {
    get session() {
      return session;
    },
    renderer,
    progress,
  };

  return {
    id: 'bridges',
    name: 'Island Bridges',
    tagline: 'Join the islands with straight bridges that never cross.',
    icon: bridgesLogo,
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
    resetProgress: () => resetBridges(progress),
    modalLocked: () => winShown || !!session?.awaitingContinue,
  };
}
