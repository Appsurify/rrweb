import type { NavigationData, NavigationSamplingConfig } from '@appsurify-testmap/rrweb-types';
import { mutationObserverCtor } from '@appsurify-testmap/rrweb-utils';
import { callbackWrapper } from '../../error-handler';

const DEFAULT_SETTLE_TIMEOUT = 150;
const DEFAULT_MAX_WAIT = 5000;
const DEFAULT_DEBOUNCE = 100;
const DEFAULT_SAME_URL_COALESCE_MS = 2000;

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
  private onSnapshot: (isCheckout: boolean) => void;

  constructor(options: {
    doc: Document;
    config: NavigationSamplingConfig;
    onSnapshot: (isCheckout: boolean) => void;
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

    // Same-URL coalescing: if a snapshot for this URL was taken recently,
    // skip entirely. The SPA is bouncing on the same page (typical during
    // data hydration / replaceState patterns) — the DOM grows naturally and
    // either the active settle observer or the next legitimate navigation
    // will capture the final state.
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

    if (this.pendingNavigation) {
      // If pending is for the same URL: keep settling — DOM mutations during
      // the active observer window will reset the settle timer naturally and
      // the snapshot taken at the end will reflect the final hydrated state.
      if (this.pendingNavigation.href === data.href) {
        return;
      }
      // Different URL during pending: drop pending WITHOUT flushing. The
      // intermediate URL had no chance to settle (otherwise it would already
      // have produced a snapshot), so emitting a partial FullSnapshot for it
      // is noise. The latest URL becomes the new pending.
      this.cancelTimers();
      this.disconnectSettlingObserver();
      this.pendingNavigation = null;
    } else {
      this.cancelTimers();
      this.disconnectSettlingObserver();
    }

    // Store as pending
    this.pendingNavigation = data;

    if (this.frozen) {
      // Will restart when unfrozen
      return;
    }

    this.startDebounce();
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
  markSnapshotTaken(): void {
    const win = this.doc.defaultView;
    this.lastSnapshotHref = win ? win.location.href : null;
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
    const hadPending = this.pendingNavigation !== null;
    this.reset();
    this.disabled = true;
    if (hadPending) {
      // Record the URL of this final snapshot so a subsequent same-URL
      // navigation in a re-started recorder lifecycle would still coalesce.
      const win = this.doc.defaultView;
      this.lastSnapshotHref = win ? win.location.href : null;
      this.lastSnapshotAt =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.onSnapshot(true);
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
