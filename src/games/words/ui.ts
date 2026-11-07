import { fmt } from '../../shared/format';
import { icons, starIcon, wordsLogo } from '../../shared/icons';
import { GameModule, Shell } from '../types';
import { pointsFor } from './core/trie';
import { WordsLevel } from './core/types';
import { Session } from './game/session';
import { WordsSource } from './game/source';
import { loadWords, recordRound, resetWords, WordsProgress } from './game/storage';
import { WordsRenderer } from './render/renderer';

type Phase = 'ready' | 'running' | 'paused' | 'over';

export function createWords(shell: Shell): GameModule {
  const progress: WordsProgress = loadWords();
  const { sfx, openModal, closeModal, modalOpen } = shell;
  let levels: WordsSource | null = null;
  const source = () => (levels ??= new WordsSource());

  const root = document.createElement('div');
  root.className = 'game-root';
  root.id = 'wd-root';
  shell.app.append(root);
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  root.innerHTML = `
  <section class="screen home" id="wd-home">
    <div class="logo">${wordsLogo}</div>
    <h1>Word Grid</h1>
    <p>Trace words through touching letters before time runs out. Find enough of them for stars.</p>
    <button class="btn" id="wd-play"></button>
    <button class="btn secondary" id="wd-open-levels">Levels</button>
    <button class="btn secondary" id="wd-settings-home">Settings</button>
    <button class="btn secondary" id="wd-hub">All puzzles</button>
    <div class="total" id="wd-total"></div>
  </section>

  <section class="screen" id="wd-levels">
    <div class="levels-head">
      <button class="icon-btn" id="wd-levels-back" aria-label="Back">${icons.back}</button>
      <h2>Word Grid</h2>
    </div>
    <div class="level-grid" id="wd-grid"></div>
  </section>

  <section class="screen" id="wd-game">
    <header class="topbar">
      <button class="icon-btn" id="wd-back" aria-label="Back">${icons.back}</button>
      <div class="title"><b id="wd-title"></b><span id="wd-diff"></span></div>
      <button class="icon-btn" id="wd-restart" aria-label="Restart level">${icons.restart}</button>
      <button class="icon-btn" id="wd-theme" aria-label="Change colours">${icons.palette}</button>
      <button class="icon-btn" id="wd-settings" aria-label="Settings">${icons.gear}</button>
    </header>
    <div class="hud">
      <div class="timer" id="wd-timer">0:00</div>
      <div class="stats" id="wd-stats"></div>
      <button class="icon-btn" id="wd-hint" aria-label="Hint">${icons.bulb}<span class="badge" id="wd-hint-count"></span></button>
    </div>
    <p class="tip" id="wd-tip"></p>
    <div class="word-line" id="wd-word"></div>
    <div class="stage" id="wd-stage">
      <canvas id="wd-board"></canvas>
      <div class="loading" id="wd-loading" hidden>Shuffling letters…</div>
      <div class="snake-overlay" id="wd-overlay" hidden><span></span></div>
    </div>
    <div class="found-list" id="wd-found"></div>
  </section>`;

  const canvas = $<HTMLCanvasElement>('#wd-board');
  const renderer = new WordsRenderer(canvas, shell.theme());
  shell.onTheme((t) => {
    renderer.theme = t;
    renderer.invalidate();
  });

  // ---------- Screens ----------
  function show(id: 'home' | 'levels' | 'game') {
    shell.show(`wd-${id}`);
    if (id !== 'game') pause();
    if (id === 'home') {
      $('#wd-play').textContent = progress.current === 1 && !progress.levels[1] ? 'Play' : `Play level ${progress.current}`;
      const t = totalStars();
      $('#wd-total').innerHTML = t ? `${starIcon(true)} ${t} stars collected` : '';
      void source(); // start the worker (and the word list) loading early
    }
    if (id === 'levels') renderLevels();
    if (id === 'game') requestAnimationFrame(() => renderer.resize());
  }
  const totalStars = () => Object.values(progress.levels).reduce((s, l) => s + l.stars, 0);

  function renderLevels() {
    const tiles: string[] = [];
    for (let n = 1; n <= progress.unlocked + 1; n++) {
      if (n > progress.unlocked) {
        tiles.push(`<button class="tile locked" disabled aria-label="Level ${n}, locked">${icons.lock}</button>`);
        break;
      }
      const rec = progress.levels[n];
      const stars = rec ? [0, 1, 2].map((i) => starIcon(i < rec.stars)).join('') : '';
      tiles.push(`<button class="${n === progress.current ? 'tile current' : 'tile'}" data-level="${n}" aria-label="Level ${n}"><b>${n}</b><span class="stars">${stars}</span></button>`);
    }
    const grid = $('#wd-grid');
    grid.innerHTML = tiles.join('');
    grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
  }

  $('#wd-grid').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
    if (t) startLevel(Number(t.dataset.level));
  });
  $('#wd-play').addEventListener('click', () => startLevel(progress.current));
  $('#wd-open-levels').addEventListener('click', () => show('levels'));
  $('#wd-levels-back').addEventListener('click', () => show('home'));
  $('#wd-back').addEventListener('click', () => {
    closeModal();
    show('home');
  });
  $('#wd-settings-home').addEventListener('click', shell.openSettings);
  $('#wd-settings').addEventListener('click', shell.openSettings);
  $('#wd-hub').addEventListener('click', shell.goHub);
  $('#wd-theme').addEventListener('click', shell.cycleTheme);
  $('#wd-restart').addEventListener('click', () => session && startLevel(session.level.number));

  // ---------- Game ----------
  let session: Session | null = null;
  let phase: Phase = 'ready';
  let loadToken = 0;
  let lastTick = performance.now();
  let path: number[] = [];
  let pointer: number | null = null;

  async function startLevel(n: number) {
    closeModal();
    show('game');
    const token = ++loadToken;
    session = null;
    phase = 'ready';
    renderer.letters = [];
    renderer.invalidate();
    $('#wd-title').textContent = `Level ${n}`;
    $('#wd-diff').textContent = '';
    $('#wd-tip').textContent = '';
    $('#wd-stats').textContent = '';
    $('#wd-found').innerHTML = '';
    $('#wd-word').textContent = '';
    setOverlay(null);
    $('#wd-loading').hidden = false;
    const level = await source().get(n);
    if (token !== loadToken) return;
    $('#wd-loading').hidden = true;
    begin(level);
    void source().get(n + 1); // warm up the next one
  }

  function begin(level: WordsLevel) {
    session = new Session(level);
    phase = 'ready';
    path = [];
    renderer.size = level.size;
    renderer.letters = level.letters;
    renderer.path = [];
    renderer.hint = [];
    const diffEl = $('#wd-diff');
    diffEl.textContent = level.difficulty;
    diffEl.className = `diff-${level.difficulty.split(' ')[0]}`;
    diffEl.title = `${level.words.length} words hidden in this grid`;
    $('#wd-tip').textContent = level.tip ?? '';
    renderFound();
    setWord('');
    setOverlay('Tap to start the clock');
    renderer.resize();
    updateHud();
  }

  function setOverlay(text: string | null) {
    const o = $('#wd-overlay');
    o.hidden = !text;
    o.querySelector('span')!.textContent = text ?? '';
  }

  function setWord(text: string, kind = '') {
    const el = $('#wd-word');
    el.textContent = text ? text.toUpperCase() : ' ';
    el.className = `word-line ${kind}`;
  }

  function updateHud() {
    const s = session;
    if (!s) return;
    const [a, b, c] = s.level.targets;
    const n = s.found.length;
    // Each star target, lit once reached.
    const mark = (t: number) => `<span class="${n >= t ? 'got' : ''}">${starIcon(n >= t)}${t}</span>`;
    $('#wd-stats').innerHTML = `Words <b>${n}</b> · ${s.points} pts · <span class="targets">${mark(a)} ${mark(b)} ${mark(c)}</span>`;
    $('#wd-hint-count').textContent = String(s.hints);
    $<HTMLButtonElement>('#wd-hint').disabled = s.hints === 0 || phase !== 'running';
    updateTimer();
  }
  function updateTimer() {
    const s = session;
    if (!s) return;
    const el = $('#wd-timer');
    el.textContent = fmt(Math.max(0, Math.ceil(s.leftMs / 1000) * 1000));
    el.classList.toggle('low', s.leftMs < 15000 && phase === 'running');
  }

  function renderFound() {
    const s = session;
    if (!s) return;
    $('#wd-found').innerHTML = s.found
      .slice()
      .reverse()
      .map((w) => `<span class="chip">${w}<small>${pointsFor(w)}</small></span>`)
      .join('');
  }

  function go() {
    if (!session || phase === 'over' || modalOpen()) return;
    sfx.unlock();
    if (phase === 'ready' || phase === 'paused') {
      phase = 'running';
      lastTick = performance.now();
      setOverlay(null);
      updateHud();
    }
  }

  function pause() {
    if (phase !== 'running') return;
    phase = 'paused';
    endTrace(false);
    setOverlay('Paused. Tap to carry on');
    updateHud();
  }

  // The clock runs only while the round is on screen and nothing is covering it.
  setInterval(() => {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    const s = session;
    if (!s || phase !== 'running') return;
    if (modalOpen() || document.visibilityState !== 'visible') return pause();
    s.leftMs -= Math.min(dt, 1000);
    updateTimer();
    if (s.over) finish();
  }, 100);

  // ---------- Tracing ----------
  // Press on a letter and drag through touching letters; going back over the last one
  // takes it off. Let go to try the word.
  const cellUnder = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = session;
    if (!s || modalOpen() || pointer !== null) return;
    if (phase !== 'running') {
      go();
      return;
    }
    const i = cellUnder(e);
    if (i === null) return;
    pointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    path = [i];
    sync();
  });

  canvas.addEventListener('pointermove', (e) => {
    const s = session;
    if (!s || pointer !== e.pointerId) return;
    const i = cellUnder(e);
    if (i === null || i === path[path.length - 1]) return;
    if (path.length > 1 && i === path[path.length - 2]) path.pop();
    else if (s.canExtend(path, i)) path.push(i);
    else return;
    shell.vibrate(4);
    sync();
  });

  function sync() {
    renderer.path = path;
    renderer.invalidate();
    if (session) setWord(session.spell(path));
  }

  function endTrace(submit: boolean) {
    const s = session;
    pointer = null;
    const traced = path;
    path = [];
    renderer.path = [];
    renderer.invalidate();
    if (!s || !submit || !traced.length) return;
    const r = s.submit(traced);
    if (r.kind === 'new') {
      renderer.show(traced, 'new');
      renderer.hint = s.hint ? renderer.hint : [];
      setWord(`${r.word} +${r.points}`, 'good');
      sfx.ding();
      shell.vibrate(12);
      renderFound();
      updateHud();
      if (s.found.length === s.level.words.length) finish();
    } else if (r.kind === 'again') {
      renderer.show(traced, 'again');
      setWord(`${r.word}: already found`, 'meh');
      sfx.blip();
    } else if (r.kind === 'unknown') {
      renderer.show(traced, 'unknown');
      setWord(`${r.word}: not a word`, 'bad');
      sfx.thud();
      shell.vibrate(20);
    } else setWord('');
  }
  canvas.addEventListener('pointerup', (e) => {
    if (pointer === e.pointerId) endTrace(true);
  });
  canvas.addEventListener('pointercancel', (e) => {
    if (pointer === e.pointerId) endTrace(false);
  });
  $('#wd-overlay').addEventListener('click', go);
  $('#wd-stage').addEventListener('pointerdown', (e) => {
    if (e.target !== canvas && phase !== 'running') go();
  });

  $('#wd-hint').addEventListener('click', () => {
    const s = session;
    if (!s || phase !== 'running') return;
    const h = s.useHint();
    if (!h) return;
    renderer.hint = h.path.slice(0, 2);
    renderer.invalidate();
    setWord(`${h.word[0]}${h.word[1]}${' _'.repeat(h.word.length - 2)}  (${h.word.length} letters)`, 'meh');
    sfx.ding();
    updateHud();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });

  function finish() {
    const s = session;
    if (!s || phase === 'over') return;
    phase = 'over';
    endTrace(false);
    renderer.hint = [];
    updateHud();
    const stars = s.stars;
    const prev = recordRound(progress, s.level.number, stars, s.points, s.found.length);
    if (stars) {
      sfx.chime();
      shell.vibrate([20, 60, 20]);
    } else sfx.thud();
    const longest = s.found.slice().sort((a, b) => b.length - a.length)[0];
    const missed = s.missed(8);
    const best = prev && s.points > prev.bestPoints ? '<span class="best"> · New best!</span>' : '';
    const l = s.level;
    setTimeout(() => {
      if (session !== s) return;
      openModal(
        `<h2>${stars ? `Level ${l.number}: time's up` : 'Not quite'}</h2>
         <div class="big-stars">${[0, 1, 2].map((i) => starIcon(i < stars)).join('')}</div>
         <div class="result-line">${s.found.length} of ${l.words.length} words · ${s.points} points${best}</div>
         ${longest ? `<p>Longest word: <b>${longest}</b></p>` : ''}
         ${stars ? '' : `<p>Find ${l.targets[0]} words for a star and the next level.</p>`}
         ${missed.length ? `<p class="missed">Some you missed: ${missed.map((w) => `<span class="chip">${w}</span>`).join(' ')}</p>` : ''}
         <div class="actions">
           ${stars ? '<button class="btn" data-action="next">Next level</button>' : '<button class="btn" data-action="replay">Try again</button>'}
           <div class="row">
             ${stars ? '<button class="btn small secondary" data-action="replay">Replay</button>' : ''}
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
    }, 500);
  }

  new ResizeObserver(() => {
    if (session) renderer.resize();
  }).observe($('#wd-stage'));

  // Hook for automated browser tests.
  (window as unknown as { __words: unknown }).__words = {
    get session() {
      return session;
    },
    get phase() {
      return phase;
    },
    renderer,
    progress,
  };

  return {
    id: 'words',
    name: 'Word Grid',
    tagline: 'Trace words through touching letters against the clock.',
    icon: wordsLogo,
    summary: () => {
      const started = Object.keys(progress.levels).length > 0;
      return { status: started ? `Level ${progress.current}` : 'Start playing', stars: totalStars() };
    },
    enter: () => show('home'),
    leave: () => {
      loadToken++;
      pause();
      session = null;
      renderer.letters = [];
    },
    resetProgress: () => resetWords(progress),
    modalLocked: () => phase === 'over',
  };
}
