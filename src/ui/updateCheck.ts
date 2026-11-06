declare const __BUILD_ID__: string;

/** Id of the build this page was loaded from. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

const CHECK_EVERY_MS = 15 * 60 * 1000;

/** True when the server reports a build that differs from the one running. */
export function isOutdated(running: string, live: unknown): boolean {
  const build = (live as { build?: unknown } | null)?.build;
  return typeof build === 'string' && build !== '' && build !== running;
}

async function fetchLiveBuild(): Promise<unknown> {
  const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`version check failed: ${res.status}`);
  return res.json();
}

/** Refresh the cached index.html first so the reload can't come back from a stale cache. */
async function reloadToLatest() {
  try {
    await fetch('./', { cache: 'reload' });
  } catch {
    // Offline or blocked; a plain reload is still the best we can do.
  }
  location.reload();
}

function showBanner() {
  if (document.getElementById('update-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.className = 'update-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `
    <span>A new version of Arrow Escape is available.</span>
    <button class="btn small" data-action="reload">Reload</button>
    <button class="update-close" data-action="later" aria-label="Not now">&times;</button>`;
  bar.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'reload') {
      bar.querySelector<HTMLButtonElement>('[data-action="reload"]')!.disabled = true;
      void reloadToLatest();
    } else if (action === 'later') {
      bar.remove();
    }
  });
  document.body.appendChild(bar);
}

/**
 * Checks for a newer deployed build on start, whenever the tab comes back into view,
 * and every 15 minutes. Shows a reload prompt once one is found. Does nothing in dev.
 */
export function startUpdateCheck() {
  if (!import.meta.env.PROD) return;
  let found = false;
  let lastCheck = 0;
  const check = async () => {
    if (found || !navigator.onLine) return;
    lastCheck = Date.now();
    try {
      if (isOutdated(BUILD_ID, await fetchLiveBuild())) {
        found = true;
        showBanner();
      }
    } catch {
      // Network hiccups are fine; try again on the next trigger.
    }
  };
  void check();
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    // Throttle so flipping between apps doesn't hammer the server.
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60_000) void check();
  });
}
