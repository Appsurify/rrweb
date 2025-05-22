import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';
import type {
  SamplingStrategy,
  visibilityMutationCallback,
  visibilityMutation,
} from '@appsurify-testmap/rrweb-types';
import { computeVisibility, type VisibilityCheckEntry } from './visibility';

export class VisibilityManager {
  private frozen = false;
  private locked = false;
  private pending: Map<Element, visibilityMutation> = new Map();
  private mirror: Mirror;
  private mutationCb: visibilityMutationCallback;
  private rafId: number | null = null;
  private rafThrottle: number;
  private lastFlushTime = 0;

  private elements: Set<Element> = new Set();
  private previousState: Map<Element, VisibilityCheckEntry> = new Map();
  private root: Element | null = null;
  private threshold: number;
  private sensitivity: number;
  private rootMargin: string;
  private hasInitialized = false;
  private mode: 'debounce' | 'throttle' | 'none' = 'none';
  private debounce = 50;
  private throttle = 100;
  private buffer: Map<Element, visibilityMutation> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastThrottleTime = 0;
  private disabled = false;
  private notifyActivity?: (count: number) => void;

  constructor(options: {
    doc: Document;
    mirror: Mirror;
    sampling: SamplingStrategy['visibility'];
    mutationCb: visibilityMutationCallback;
    notifyActivity?: (count: number) => void;
  }) {
    const { doc, mirror, sampling, mutationCb, notifyActivity } = options;
    this.mirror = mirror;
    this.mutationCb = mutationCb;
    this.notifyActivity = notifyActivity;

    this.rootMargin = '0px';

    if (sampling === false) {
      this.disabled = true;
      return;
    }

    const visibilitySampling =
      typeof sampling === 'object' && sampling !== null ? sampling : {};

    this.mode = (visibilitySampling?.mode as typeof this.mode) ?? 'none';
    this.debounce = Number(visibilitySampling?.debounce ?? 100);
    this.throttle = Number(visibilitySampling?.throttle ?? 100);
    this.threshold = Number(visibilitySampling?.threshold ?? 0.5);
    this.sensitivity = Number(visibilitySampling?.sensitivity ?? 0.05);
    this.rafThrottle =  Number(visibilitySampling?.rafThrottle ?? 100);

    doc.querySelectorAll('*').forEach((el) => this.observe(el));

    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            this.observe(n as Element);
            (n as Element).querySelectorAll('*').forEach((el) => this.observe(el));
          }
        });
        m.removedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            this.unobserve(n as Element);
          }
        });
      });
    });
    mo.observe(doc.body, { childList: true, subtree: true });

    this.startPendingFlushLoop();
  }

  private startPendingFlushLoop() {
    if (this.disabled) return;
    const loop = (timestamp: number) => {
      if (timestamp - this.lastFlushTime >= this.rafThrottle) {
        this.lastFlushTime = timestamp;
        this.flushPendingVisibilityMutations();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  public flushPendingVisibilityMutations() {
    if (this.disabled) return;
    if (this.frozen || this.locked || this.elements.size === 0) return;

    const state = computeVisibility(this.elements, this.previousState, {
      root: this.root,
      threshold: this.threshold,
      sensitivity: this.sensitivity,
      rootMargin: this.rootMargin,
    });

    for (const [el, entry] of state.entries()) {
      const old = this.previousState.get(el);
      const changed =
        !old ||
        old.isVisible !== entry.isVisible ||
        Math.abs(old.intersectionRatio - entry.intersectionRatio) > this.sensitivity;

      if (changed) {
        const id = this.mirror.getId(el);
        if (id !== -1) {
          this.buffer.set(el, {
            id,
            isVisible: entry.isVisible,
            ratio: entry.intersectionRatio,
          });
        }
        this.previousState.set(el, entry);
      }
    }

    this.previousState = state;

    if (!this.hasInitialized) {
      this.hasInitialized = true;
      this.buffer.clear();
      return;
    }

    this.scheduleEmit();

  }

  private scheduleEmit() {
    if (this.mode === 'debounce') {
      clearTimeout(this.debounceTimer!);
      this.debounceTimer = setTimeout(() => this.flushBuffer(), this.debounce);
    } else if (this.mode === 'throttle') {
      const now = performance.now();
      if (now - this.lastThrottleTime >= this.throttle) {
        this.lastThrottleTime = now;
        this.flushBuffer();
      }
    } else {
      this.flushBuffer();
    }
  }

  private flushBuffer() {
    if (this.buffer.size === 0) return;
    this.notifyActivity?.(this.buffer.size);
    this.mutationCb({ mutations: Array.from(this.buffer.values()) });
    this.buffer.clear();
  }

  public observe(el: Element) {
    if (this.disabled) return;
    this.elements.add(el);
  }

  public unobserve(el: Element) {
    if (this.disabled) return;
    this.elements.delete(el);
    this.previousState.delete(el);
    this.pending.delete(el);
  }

  public freeze() {
    this.frozen = true;
  }

  public unfreeze() {
    this.frozen = false;
  }

  public lock() {
    this.locked = true;
  }

  public unlock() {
    this.locked = false;
  }

  public reset() {
    this.elements.clear();
    this.previousState.clear();
    this.pending.clear();
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
