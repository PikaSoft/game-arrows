import { fmt } from '../../shared/format';
import { flipLogo, icons, starIcon } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { buildFlipLevel } from './core/levels';
import { FlipLevel } from './core/types';
import { Session } from './game/session';
import { FlipProgress, loadFlip, recordFlipClear, resetFlip } from './game/storage';
import { pictureName, pictureSvg } from './render/pictures';

/** How long a missed pair stays up before turning back by itself. */
const MISS_SHOW_MS = 900;

export function createFlip(shell: Shell): GameModule {
  const progress: FlipProgress = loadFlip();
  const { sfx, openModal, closeModal, modalOpen } = shell;

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'pf-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="pf-home">
    <div class="logo">${flipLogo}</div>
    <h1>Pair Flip</h1>
    <p>Turn cards over two at a time and find every matching pair. Remember where the pictures were.</p>
    <button class="btn" id="pf-play"></button>
    <button class="btn secondary" id="pf-open-levels">Levels</button>
    <button class="btn secondary" data-help>How to play</button>
    <button class="btn secondary" id="pf-settings-home">Settings</button>
    <button class="btn secondary" id="pf-hub">All puzzles</button>
    <div class="total" id="pf-total"></div>
  </section>

  <section class="screen" id="pf-levels">
    <div class="levels-head">
      <button class="icon-btn" id="pf-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Pair Flip</h2>
    </div>
    <div class="level-grid" id="pf-grid"></div>
  </section>

  <section class="screen" id="pf-game">
    <header class="topbar">
      <button class="icon-btn" id="pf-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="pf-title"></b><span id="pf-diff"></span></div>
      <button class="icon-btn" id="pf-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="pf-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" data-help aria-label="How to play">${icons.help}</button>
      <button class="icon-btn" id="pf-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="stats" id="pf-stats"></div>
      <div class="timer" id="pf-timer">0:00</div>
    </div>
    <p class="tip" id="pf-tip"></p>
    <div class="stage pf-stage" id="pf-stage">
      <div class="pf-cards" id="pf-cards" role="grid"></div>
    </div>
  </section>`;

  // ---------- Screens ----------
  type ScreenId = 'home' | 'levels' | 'game';
  function show(id: ScreenId) {
    shell.show(`pf-${id}`);
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(fit);
  }

  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderHome() {
    $('#pf-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
    const t = totalStars();
    $('#pf-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
  }

  function renderLevels() {
    const grid = $('#pf-grid');
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

  $('#pf-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#pf-play').addEventListener('click', () => startLevel(progress.current));
  $('#pf-open-levels').addEventListener('click', () => show('levels'));
  $('#pf-levels-back').addEventListener('click', () => show('home'));
  $('#pf-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#pf-settings-home').addEventListener('click', shell.openSettings);
  $('#pf-settings').addEventListener('click', shell.openSettings);
  $('#pf-hub').addEventListener('click', shell.goHub);
  $('#pf-theme').addEventListener('click', shell.cycleTheme);

  // ---------- Game ----------
  let session: Session | null = null;
  let lastTick = performance.now();
  let winShown = false;
  let hideTimer = 0;
  /** True while two cards are sliding past each other; taps wait. */
  let swapping = false;

  function startLevel(n: number) {
    closeModal();
    show('game');
    beginSession(buildFlipLevel(n));
  }

  function beginSession(level: FlipLevel) {
    clearTimeout(hideTimer);
    swapping = false;
    session = new Session(level);
    $('#pf-title').textContent = `Level ${level.number}`;
    const diffEl = $('#pf-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = `${level.faces.length / 2} pairs${level.lookalike ? ', look-alike pictures' : ''}${level.swapEvery ? ', cards that swap' : ''}`;
    winShown = false;
    lastTick = performance.now();
    $('#pf-tip').textContent = level.tip ?? '';
    const cards = $('#pf-cards');
    cards.style.setProperty('--cols', String(level.cols));
    cards.innerHTML = level.faces
      .map(
        (_, i) =>
          `<button class="pf-card" data-card="${i}" aria-label="Card ${i + 1}, face down"><span class="pf-inner"><span class="pf-back"></span><span class="pf-face"></span></span></button>`,
      )
      .join('');
    fit();
    render();
  }

  /** Size the cards so the whole grid fits the stage, cards a little taller than wide. */
  function fit() {
    const s = session;
    if (!s) return;
    const stage = $('#pf-stage');
    const gap = 8;
    const { cols, rows } = s.level;
    const w = (stage.clientWidth - 16 - gap * (cols - 1)) / cols;
    const h = (stage.clientHeight - 16 - gap * (rows - 1)) / rows;
    const cw = Math.max(36, Math.min(w, h / 1.25, 110));
    $('#pf-cards').style.setProperty('--card', `${cw}px`);
  }

  /** Bring every card in line with the session: which are up, and what they show. */
  function render() {
    const s = session;
    if (!s) return;
    for (const el of $('#pf-cards').querySelectorAll<HTMLButtonElement>('.pf-card')) {
      const i = Number(el.dataset.card);
      const up = s.isUp(i);
      el.classList.toggle('up', up);
      el.classList.toggle('done', s.matched[i]);
      const face = el.querySelector('.pf-face')!;
      // Pictures are only in a card while it's up, so a face-down card gives nothing away
      // (a swap moves pictures between face-down cards). Turning down, the picture stays
      // until the card has turned far enough to hide it.
      if (up) face.innerHTML = pictureSvg(s.faces[i]);
      else if (face.innerHTML)
        setTimeout(() => {
          if (!el.classList.contains('up')) face.innerHTML = '';
        }, 300);
      el.setAttribute('aria-label', up ? `Card ${i + 1}, ${pictureName(s.faces[i])}${s.matched[i] ? ', matched' : ''}` : `Card ${i + 1}, face down`);
    }
    updateHud();
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    $('#pf-stats').innerHTML = `Pairs <b>${s.found}/${s.pairs}</b> · Misses <b>${s.misses}</b> · Par <b>${s.level.par}</b>`;
    updateTimer();
  }
  function updateTimer() {
    if (session) $('#pf-timer').textContent = fmt(session.elapsedMs);
  }

  const cardEl = (i: number) => $<HTMLElement>(`[data-card="${i}"]`);

  /** Turn a missed pair back, then swap two cards if one is due. */
  function hideMiss(swapDue: boolean) {
    clearTimeout(hideTimer);
    const s = session;
    if (!s || !s.hide()) return;
    render();
    if (swapDue) setTimeout(doSwap, 380);
  }

  /** Two face-down cards slide past each other into each other's places. */
  function doSwap() {
    const s = session;
    if (!s || s.won) return;
    const pair = s.swap();
    if (!pair) return;
    const [a, b] = pair.map(cardEl);
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    swapping = true;
    sfx.whoosh();
    shell.vibrate([10, 40, 10]);
    const opts: KeyframeAnimationOptions = { duration: 650, easing: 'ease-in-out' };
    a.classList.add('swap');
    b.classList.add('swap');
    const anims = [
      a.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${rb.left - ra.left}px, ${rb.top - ra.top}px)` }], opts),
      b.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${ra.left - rb.left}px, ${ra.top - rb.top}px)` }], opts),
    ];
    Promise.all(anims.map((x) => x.finished)).finally(() => {
      a.classList.remove('swap');
      b.classList.remove('swap');
      swapping = false;
    });
  }

  let pendingSwap = false;
  $('#pf-cards').addEventListener('click', (e) => {
    const s = session;
    if (!s || s.won || modalOpen() || swapping) return;
    sfx.unlock();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    // A tap while a miss is showing turns it back first.
    if (s.up.length === 2) {
      const due = pendingSwap;
      pendingSwap = false;
      hideMiss(due);
      if (due) return;
    }
    if (!el) return;
    const r = s.tap(Number(el.dataset.card));
    if (r.kind === 'ignored') return;
    if (r.kind === 'first') {
      sfx.blip();
      shell.vibrate(6);
    } else if (r.kind === 'match') {
      sfx.ding();
      shell.vibrate(14);
    } else {
      sfx.thud();
      shell.vibrate(10);
      pendingSwap = r.swapDue;
      hideTimer = window.setTimeout(() => {
        const due = pendingSwap;
        pendingSwap = false;
        hideMiss(due);
      }, MISS_SHOW_MS);
    }
    render();
    if (s.won) setTimeout(showWin, 500);
  });

  function restartLevel() {
    if (!session) return;
    closeModal();
    beginSession(session.level);
  }
  $('#pf-restart').addEventListener('click', restartLevel);

  function showWin() {
    const s = session;
    if (!s || winShown || !s.won) return;
    winShown = true;
    const stars = s.stars();
    const { newBestTime, prev } = recordFlipClear(progress, s.level.number, stars, s.misses, s.elapsedMs);
    sfx.chime();
    shell.vibrate([20, 60, 20]);
    const note = stars < 3 ? `<p>Find every pair with ${s.level.par} misses or fewer for three stars.</p>` : '';
    openModal(
      `<h2>Level ${s.level.number}: all pairs found</h2>
       <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
       <div class="result-line">${s.misses} ${s.misses === 1 ? 'miss' : 'misses'} (par ${s.level.par}) · ${fmt(s.elapsedMs)} ${
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
  }

  new ResizeObserver(() => {
    if (session) fit();
  }).observe($('#pf-stage'));

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
  (window as unknown as { __flip: unknown }).__flip = {
    get session() {
      return session;
    },
    progress,
  };

  return {
    id: 'flip',
    name: 'Pair Flip',
    tagline: 'Turn cards two at a time and find every pair.',
    icon: flipLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      clearTimeout(hideTimer);
      session = null;
    },
    resetProgress: () => resetFlip(progress),
    modalLocked: () => winShown,
  };
}
