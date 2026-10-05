import type { Page, Request } from '@playwright/test';
import type { SettleBeforeStopOptions } from './config';

export const defaultSettleOptions: Required<SettleBeforeStopOptions> = {
  networkIdle: true,
  domQuietMs: 300,
  timeout: 5000,
};

// Same quiet window Playwright uses for its own 'networkidle' lifecycle event.
const NETWORK_QUIET_MS = 500;

// Long-lived streams never "finish" — counting them would always burn the
// whole timeout on pages that hold one open.
const IGNORED_RESOURCE_TYPES = new Set(['eventsource', 'websocket']);

export function resolveSettleOptions(
  value: false | SettleBeforeStopOptions | undefined,
): Required<SettleBeforeStopOptions> | null {
  if (value === false) return null;
  return { ...defaultSettleOptions, ...(value ?? {}) };
}

/**
 * Tracks in-flight requests of a page from the Node side.
 *
 * page.waitForLoadState('networkidle') is not enough for SPAs: Playwright
 * fires 'networkidle' once per document and never clears it, so XHR/fetch
 * started after a client-side route change (e.g. login → dashboard data) is
 * invisible to it and the wait resolves immediately.
 */
export class NetworkTracker {
  private inflight = new Set<Request>();
  private lastActivity = 0;

  constructor(page: Page) {
    page.on('request', (request) => {
      if (IGNORED_RESOURCE_TYPES.has(request.resourceType())) return;
      this.inflight.add(request);
      this.lastActivity = Date.now();
    });
    const done = (request: Request) => {
      if (this.inflight.delete(request)) this.lastActivity = Date.now();
    };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    // A navigation abandons the old document's requests without always
    // reporting them as failed.
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        for (const request of this.inflight) {
          if (request.frame() === frame && !request.isNavigationRequest()) {
            this.inflight.delete(request);
          }
        }
      }
    });
  }

  /** URLs of requests still in flight, for diagnostics. */
  pending(limit = 3): string[] {
    return [...this.inflight].slice(0, limit).map((r) => r.url().slice(0, 120));
  }

  /** Resolves once no request has been in flight for `quietMs`, or at `deadline`. */
  async waitForQuiet(quietMs: number, deadline: number, isAborted: () => boolean) {
    for (;;) {
      if (isAborted()) return false;
      const now = Date.now();
      if (now >= deadline) return false;
      const quietFor = now - this.lastActivity;
      if (this.inflight.size === 0 && quietFor >= quietMs) return true;
      const step = this.inflight.size === 0 ? quietMs - quietFor : 50;
      await new Promise((r) => setTimeout(r, Math.max(10, Math.min(step, deadline - now))));
    }
  }
}

// In-page state of the DOM watcher; a window property so a later evaluate
// can pick up the observer started by an earlier one.
const WATCH_KEY = '__testmapSettleDomWatch';
type DomWatch = { last: number; observer: MutationObserver };

/**
 * Starts recording the time of the latest DOM mutation in the page. Started
 * together with the network wait, so DOM quiet time accumulated meanwhile
 * counts — an idle page costs max(network, domQuietMs), not their sum.
 */
async function startDomWatch(page: Page) {
  await page.evaluate((key) => {
    const w = window as unknown as Record<string, DomWatch | undefined>;
    w[key]?.observer.disconnect();
    const watch: DomWatch = {
      last: performance.now(),
      observer: new MutationObserver(() => {
        watch.last = performance.now();
      }),
    };
    watch.observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    w[key] = watch;
  }, WATCH_KEY);
}

/**
 * Waits in the page until the DOM has had no mutations for `quietMs` — counted
 * from the last mutation seen by startDomWatch, or from now if the watcher is
 * gone (the page navigated). Resolves `false` when `timeoutMs` elapses first.
 */
async function waitForDomQuiet(page: Page, quietMs: number, timeoutMs: number) {
  const inPage = page.evaluate(
    ({ key, quietMs, timeoutMs }) =>
      new Promise<boolean>((resolve) => {
        const w = window as unknown as Record<string, DomWatch | undefined>;
        let watch = w[key];
        if (!watch) {
          const fresh: DomWatch = {
            last: performance.now(),
            observer: new MutationObserver(() => {
              fresh.last = performance.now();
            }),
          };
          fresh.observer.observe(document, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });
          watch = fresh;
        }
        const active = watch;
        const capAt = performance.now() + timeoutMs;
        const check = () => {
          const now = performance.now();
          const quietFor = now - active.last;
          if (quietFor >= quietMs || now >= capAt) {
            active.observer.disconnect();
            delete w[key];
            resolve(quietFor >= quietMs);
            return;
          }
          setTimeout(check, Math.min(quietMs - quietFor, capAt - now));
        };
        check();
      }),
    { key: WATCH_KEY, quietMs, timeoutMs },
  );
  // Guard against a page whose main thread is blocked: the in-page timers
  // could never fire, and page.evaluate has no timeout of its own.
  let guard: ReturnType<typeof setTimeout> | undefined;
  const nodeCap = new Promise<boolean>((resolve) => {
    guard = setTimeout(() => resolve(false), timeoutMs + 250);
  });
  try {
    return await Promise.race([inPage, nodeCap]);
  } finally {
    clearTimeout(guard);
  }
}

/**
 * Best-effort wait for the page to stop changing before the recorder stops:
 * first the network goes quiet, then the DOM. Everything fits in
 * `options.timeout`; when it runs out we simply return. Never throws.
 */
export async function settlePage(
  page: Page,
  network: NetworkTracker,
  options: Required<SettleBeforeStopOptions>,
): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + Math.max(0, options.timeout);
  const remaining = () => deadline - Date.now();
  const notes: string[] = [];
  let networkMs = 0;

  try {
    if (options.domQuietMs > 0) {
      await startDomWatch(page).catch(() => notes.push('DOM watch not started'));
    }
    if (options.networkIdle) {
      // Equivalent to waitForLoadState('networkidle') — same 500 ms window,
      // all frames — but also sees requests made after the document's own
      // 'networkidle' already fired (SPA route changes).
      const quiet = await network.waitForQuiet(
        NETWORK_QUIET_MS,
        deadline,
        () => page.isClosed(),
      );
      if (!quiet) notes.push(`network still busy: ${network.pending().join(', ')}`);
      networkMs = Date.now() - startedAt;
    }
    if (options.domQuietMs > 0 && remaining() > 0 && !page.isClosed()) {
      const quiet = await waitForDomQuiet(page, options.domQuietMs, remaining());
      if (!quiet) notes.push('DOM still mutating');
    }
  } catch (error) {
    // Closed page, navigation mid-evaluate, etc. — stop with what we have.
    notes.push(`aborted (${(error as Error)?.message ?? error})`);
  }
  console.debug(
    `[${Date.now()}] [recorder] settle: done in ${Date.now() - startedAt}ms ` +
      `(network ${networkMs}ms)${notes.length ? ' — ' + notes.join('; ') : ''}`,
  );
}
