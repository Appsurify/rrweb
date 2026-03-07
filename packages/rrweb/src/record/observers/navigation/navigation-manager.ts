import type { NavigationData, NavigationSamplingConfig } from '@appsurify-testmap/rrweb-types';
import { mutationObserverCtor } from '@appsurify-testmap/rrweb-utils';
import { callbackWrapper } from '../../error-handler';

const DEFAULT_SETTLE_TIMEOUT = 150;
const DEFAULT_MAX_WAIT = 5000;
const DEFAULT_DEBOUNCE = 100;

export class NavigationManager {
  private frozen = false;
  private locked = false;
  private disabled = false;

  private settleTimeout: number;
  private maxWait: number;
  private debounceMs: number;

  private settlingObserver: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private settleCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMutationTime = 0;
  private pendingNavigation: NavigationData | null = null;

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
  }

  handleNavigation(data: NavigationData): void {
    if (this.disabled) return;
    if (this.locked) return;

    if (this.pendingNavigation) {
      // Flush interrupted navigation immediately before DOM transitions away
      this.cancelTimers();
      this.disconnectSettlingObserver();
      // Safe to null before onSnapshot: the callback only receives isCheckout boolean
      // and reads the current URL from document.location, not from pendingNavigation.
      this.pendingNavigation = null;
      this.onSnapshot(true);
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
