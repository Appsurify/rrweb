import type { NavigationData, NavigationSamplingConfig } from '@appsurify-testmap/rrweb-types';
import { mutationObserverCtor } from '@appsurify-testmap/rrweb-utils';
import { callbackWrapper } from '../../error-handler';

const DEFAULT_SETTLE_TIMEOUT = 150;
const DEFAULT_MAX_WAIT = 5000;
const DEFAULT_DEBOUNCE = 100;
const DEFAULT_SAME_URL_COALESCE_MS = 2000;

/**
 * True when `a` and `b` address the same document and differ only by their
 * #fragment — i.e. this is an in-page anchor move, not a route change.
 * Falls back to `false` (treat as a real navigation) if either href is not a
 * parseable absolute URL, so an unexpected input can never suppress a snapshot.
 */
function isSameDocumentFragmentChange(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.origin === ub.origin &&
      ua.pathname === ub.pathname &&
      ua.search === ub.search &&
      ua.hash !== ub.hash
    );
  } catch {
    return false;
  }
}

export class NavigationManager {
  private frozen = false;
  private locked = false;
  private disabled = false;

  private settleTimeout: number;
  private maxWait: number;
  private debounceMs: number;
  private sameUrlCoalesceMs: number;

  private settlingObserver: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private settleCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMutationTime = 0;
  private pendingNavigation: NavigationData | null = null;

  // Bookkeeping for same-URL coalescing: avoid duplicate FullSnapshots when
  // SPAs re-fire history.replaceState/pushState with the same URL during
  // data hydration. Updated whenever a snapshot is actually taken.
  private lastSnapshotHref: string | null = null;
  private lastSnapshotAt = 0;

  private doc: Document;
  private onSnapshot: (isCheckout: boolean, hrefOverride?: string) => void;

  constructor(options: {
    doc: Document;
    config: NavigationSamplingConfig;
    onSnapshot: (isCheckout: boolean, hrefOverride?: string) => void;
  }) {
    const { doc, config, onSnapshot } = options;
    this.doc = doc;
    this.onSnapshot = callbackWrapper(onSnapshot);
    this.settleTimeout = config.settleTimeout ?? DEFAULT_SETTLE_TIMEOUT;
    this.maxWait = config.maxWait ?? DEFAULT_MAX_WAIT;
    this.debounceMs = config.debounce ?? DEFAULT_DEBOUNCE;
    this.sameUrlCoalesceMs =
      config.sameUrlCoalesceMs ?? DEFAULT_SAME_URL_COALESCE_MS;

    // Pre-arm the same-URL guard with the URL the recorder is about to
    // capture in its initial takeFullSnapshot(). Without this, a same-URL
    // SPA navigation arriving shortly after init() would still produce a
    // duplicate FullSnapshot of the initial page.
    const win = this.doc.defaultView;
    if (win) {
      this.lastSnapshotHref = win.location.href;
      this.lastSnapshotAt =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
  }

  handleNavigation(data: NavigationData): void {
    if (this.disabled) return;
    if (this.locked) return;

    // A pending navigation for a DIFFERENT url means we are leaving a route
    // that never got its snapshot: it was still inside the debounce+settle
    // window (>= debounceMs + settleTimeout). Automated tests click through
    // routes far faster than that, so dropping the pending here — as this used
    // to do — silently lost every route the run passed through, leaving only
    // the first page in the report.
    //
    // Flush it instead. This runs synchronously from the pushState/popstate
    // handler, i.e. BEFORE the SPA re-renders for the new route, so the DOM
    // still holds the route we are leaving. We label the snapshot with the
    // pending route's own href (location.href already points at the next one).
    //
    // Exception: a change that only moves the #fragment (same path+query) is
    // not treated as leaving a route. Scroll-spy widgets replaceState a new
    // #section on every scroll step, and each of those URLs is distinct, so
    // sameUrlCoalesceMs — which only matches identical hrefs — would not stop
    // them; without this guard a fast scroll through N sections would force N
    // full-DOM snapshots. Such a navigation still becomes pending below, so a
    // route the user actually dwells on is captured once it settles.
    if (
      this.pendingNavigation &&
      this.pendingNavigation.href !== data.href &&
      !isSameDocumentFragmentChange(this.pendingNavigation.href, data.href)
    ) {
      this.flushPending(this.pendingNavigation.href);
    }

    // Same-URL coalescing: if a snapshot for this URL was taken recently,
    // skip entirely. The SPA is bouncing on the same page (typical during
    // data hydration / replaceState patterns) — the DOM grows naturally and
    // either the active settle observer or the next legitimate navigation
    // will capture the final state.
    //
    // This must be evaluated AFTER the flush above: the flush moves
    // lastSnapshotHref to the route being left, so a genuine return to an
    // earlier URL (home → apartments → back to home) is no longer mistaken for
    // a hydration bounce and suppressed.
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (
      this.sameUrlCoalesceMs > 0 &&
      this.lastSnapshotHref !== null &&
      this.lastSnapshotHref === data.href &&
      now - this.lastSnapshotAt < this.sameUrlCoalesceMs
    ) {
      return;
    }

    // Pending for the same URL: keep settling — DOM mutations during the active
    // observer window reset the settle timer naturally and the snapshot taken at
    // the end reflects the final hydrated state.
    if (this.pendingNavigation && this.pendingNavigation.href === data.href) {
      return;
    }

    this.cancelTimers();
    this.disconnectSettlingObserver();

    // Store as pending
    this.pendingNavigation = data;

    if (this.frozen) {
      // Will restart when unfrozen
      return;
    }

    this.startDebounce();
  }

  /**
   * Snapshot the pending route immediately, labelled with `href` rather than
   * location.href, and clear the pending state. Used when a navigation arrives
   * before the pending route had a chance to settle.
   */
  private flushPending(href: string): void {
    this.cancelTimers();
    this.disconnectSettlingObserver();
    this.pendingNavigation = null;
    // onSnapshot -> takeFullSnapshot -> markSnapshotTaken(href) updates
    // lastSnapshotHref/At, so we deliberately do not set them here.
    this.onSnapshot(true, href);
  }

  cancelPending(): void {
    this.cancelTimers();
    this.disconnectSettlingObserver();
    this.pendingNavigation = null;
  }

  /**
   * Notify the manager that a FullSnapshot was just emitted (by any path:
   * init, executeCheckout, or this manager itself). Ensures subsequent
   * navigation events targeting the same URL within the coalesce window
   * are correctly suppressed even when the snapshot did not originate here.
   */
  markSnapshotTaken(href?: string): void {
    const win = this.doc.defaultView;
    // `href` is the route the snapshot actually depicts. It differs from
    // location.href when we flush the route being left (see flushPending), and
    // keying the coalesce guard off location.href there would wrongly suppress
    // the snapshot of the route we are navigating TO.
    this.lastSnapshotHref = href ?? (win ? win.location.href : null);
    this.lastSnapshotAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  freeze(): void {
    this.frozen = true;
    this.cancelTimers();
    this.disconnectSettlingObserver();
  }

  unfreeze(): void {
    this.frozen = false;
    // Restart settling if we have a pending navigation
    if (this.pendingNavigation && !this.locked && !this.disabled) {
      this.startDebounce();
    }
  }

  lock(): void {
    this.locked = true;
    this.cancelTimers();
    this.disconnectSettlingObserver();
  }

  unlock(): void {
    this.locked = false;
    // Discard pending navigation — the snapshot that caused lock/unlock
    // already captured the current state
    this.pendingNavigation = null;
  }

  unsetFrozen(): void {
    this.frozen = false;
  }

  reset(): void {
    this.cancelTimers();
    this.disconnectSettlingObserver();
    this.pendingNavigation = null;
    this.frozen = false;
    this.locked = false;
    this.lastSnapshotHref = null;
    this.lastSnapshotAt = 0;
  }

  destroy(): void {
    // Flush pending navigation snapshot synchronously before teardown.
    // This handles the case where continuous DOM mutations (e.g. typing into
    // form fields) prevent the settle timer from completing before the
    // recording is stopped.
    const pendingHref = this.pendingNavigation?.href ?? null;
    this.reset();
    this.disabled = true;
    if (pendingHref !== null) {
      // Record the URL of this final snapshot so a subsequent same-URL
      // navigation in a re-started recorder lifecycle would still coalesce.
      this.lastSnapshotHref = pendingHref;
      this.lastSnapshotAt =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      // At teardown the document has settled on the pending route, so its DOM
      // and href agree; passing the href explicitly keeps this path consistent
      // with flushPending rather than relying on location.href.
      this.onSnapshot(true, pendingHref);
    }
  }

  private startDebounce(): void {
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.startDOMSettling();
    }, this.debounceMs);
  }

  private startDOMSettling(): void {
    if (this.frozen || this.locked || this.disabled) return;

    this.lastMutationTime = performance.now();

    // Create MutationObserver using untainted constructor
    const ObserverCtor = mutationObserverCtor() as typeof MutationObserver;
    this.settlingObserver = new ObserverCtor(() => {
      this.lastMutationTime = performance.now();
      // Reset settle check timer on each mutation
      if (this.settleCheckTimer !== null) {
        clearTimeout(this.settleCheckTimer);
      }
      this.settleCheckTimer = setTimeout(
        () => this.checkSettled(),
        this.settleTimeout,
      );
    });

    this.settlingObserver.observe(this.doc, {
      childList: true,
      subtree: true,
    });

    // Start initial settle check timer
    this.settleCheckTimer = setTimeout(
      () => this.checkSettled(),
      this.settleTimeout,
    );

    // Safety max wait timer
    this.maxWaitTimer = setTimeout(() => {
      this.maxWaitTimer = null;
      this.completeSettling();
    }, this.maxWait);
  }

  private checkSettled(): void {
    this.settleCheckTimer = null;
    const elapsed = performance.now() - this.lastMutationTime;
    if (elapsed >= this.settleTimeout) {
      this.completeSettling();
    } else {
      // Not yet settled, schedule another check
      this.settleCheckTimer = setTimeout(
        () => this.checkSettled(),
        this.settleTimeout - elapsed,
      );
    }
  }

  private completeSettling(): void {
    if (this.frozen || this.locked || this.disabled) return;
    if (!this.pendingNavigation) return;

    // Cleanup
    this.cancelTimers();
    this.disconnectSettlingObserver();
    this.pendingNavigation = null;

    // Re-check same-URL coalescing at emit time. The pending may have been
    // for an intermediate URL the SPA bounced through and reverted; the
    // current URL might already match the last snapshot we took. In that
    // case, don't emit a duplicate FullSnapshot — the active settle observer
    // already captured DOM mutations during this window via incremental events.
    const win = this.doc.defaultView;
    const currentHref = win ? win.location.href : null;
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (
      this.sameUrlCoalesceMs > 0 &&
      this.lastSnapshotHref !== null &&
      currentHref === this.lastSnapshotHref &&
      now - this.lastSnapshotAt < this.sameUrlCoalesceMs
    ) {
      return;
    }

    // Mark this URL as just-snapshotted so subsequent same-URL navigation
    // events within the coalesce window are skipped.
    this.lastSnapshotHref = currentHref;
    this.lastSnapshotAt = now;

    // Take snapshot synchronously — the settle timer already ensured DOM
    // stability (no mutations for settleTimeout ms) and rrweb's snapshot()
    // reads the DOM tree synchronously. Deferring via rAF creates a race
    // condition with destroy() where pendingNavigation is already null but
    // the snapshot hasn't been taken yet.
    this.onSnapshot(true);
  }

  private cancelTimers(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.settleCheckTimer !== null) {
      clearTimeout(this.settleCheckTimer);
      this.settleCheckTimer = null;
    }
    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  private disconnectSettlingObserver(): void {
    if (this.settlingObserver) {
      this.settlingObserver.disconnect();
      this.settlingObserver = null;
    }
  }
}
