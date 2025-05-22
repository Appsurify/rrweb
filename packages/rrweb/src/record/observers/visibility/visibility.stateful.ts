type MarginFunction = (rootRect: DOMRect) => DOMRect;

type Rect = Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>;

type VisibilityEntry = {
  target: Element;
  isVisible: boolean;
  isStyleVisible: boolean;
  intersectionRatio: number;
  intersectionRect: Rect;
  oldValue: VisibilityEntry | null;
};

type ObserverOptions = {
  debounce?: number;
  throttle?: number;
  threshold?: number;
  rafThrottle?: number;
  sensitivity?: number;
  mode?: 'debounce' | 'throttle' | 'none';
  root?: Element | null;
  rootMargin?: string;
  emitInitial?: boolean;
};

function parseRootMargin(marginStr: string): MarginFunction {
  const parts = marginStr.trim().split(/\s+/);
  const getValue = (val: string, size: number) =>
    val.endsWith('%')
      ? (parseFloat(val) / 100) * size
      : parseFloat(val) || 0;

  return function (rootRect: DOMRect): DOMRect {
    const top = getValue(parts[0] || '0px', rootRect.height);
    const right = getValue(parts[1] || parts[0] || '0px', rootRect.width);
    const bottom = getValue(parts[2] || parts[0] || '0px', rootRect.height);
    const left = getValue(parts[3] || parts[1] || parts[0] || '0px', rootRect.width);
    return { top, right, bottom, left, width: 0, height: 0 } as DOMRect;
  };
}

function getRootRect(root: Element | null): DOMRect {
  return root
    ? root.getBoundingClientRect()
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function expandRootRect(rect: DOMRect, marginFn: MarginFunction): DOMRect {
  const margin = marginFn(rect);
  return new DOMRect(
    rect.left - margin.left,
    rect.top - margin.top,
    rect.width + margin.left + margin.right,
    rect.height + margin.top + margin.bottom
  );
}

function computeIntersectionRect(a: DOMRect, b: DOMRect): Rect {
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  const bottom = Math.min(a.bottom, b.bottom);
  const right = Math.min(a.right, b.right);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return { top, left, bottom, right, width, height };
}

function computeIntersectionRatio(elRect: DOMRect, intersectionRect: Rect): number {
  const elArea = elRect.width * elRect.height;
  const intArea = intersectionRect.width * intersectionRect.height;
  return elArea > 0 ? intArea / elArea : 0;
}

function emptyRect(): Rect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
}

function isStyleVisible(el: Element): boolean {
  const style = getComputedStyle(el);
  return style &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity || '1') > 0;
}

export function VisibilityObserver(
  callback: (entries: VisibilityEntry[]) => void,
  options: ObserverOptions = {}
) {
  const observedElements = new Map<Element, VisibilityEntry | null>();
  const debounceDelay = typeof options?.debounce === 'number' ? options.debounce : null;
  const throttleDelay = typeof options?.throttle === 'number' ? options.throttle : null;
  const threshold = options?.threshold ?? 0.5;
  const rafThrottle = options?.rafThrottle ?? 100;
  const sensitivity = options?.sensitivity ?? 0.05;
  let mode = options?.mode || 'debounce';
  const root = options.root ?? null;
  const rootMargin = parseRootMargin(options.rootMargin ?? '0px');

  const emitInitial = options?.emitInitial || false;

  if (debounceDelay && throttleDelay) {
    console.warn('[VisibilityObserver] Both debounce and throttle set; using debounce by default');
    mode = 'debounce';
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastThrottleCall = 0;
  let hasInitialized = false;
  const buffer = new Map<Element, VisibilityEntry>();
  let animationFrameId: number | null = null;

  function emitBuffered() {
    if (buffer.size > 0) {
      const finalEntries = Array.from(buffer.values());
      buffer.clear();
      callback(finalEntries);
    }
  }

  function scheduleEmit() {
    if (!hasInitialized) {
      hasInitialized = true;
      if (!emitInitial) {
        buffer.clear();
        return;
      }
    }

    if (mode === 'debounce' && debounceDelay !== null) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(emitBuffered, debounceDelay);
    } else if (mode === 'throttle' && throttleDelay !== null) {
      const now = performance.now() + performance.timeOrigin;
      if (now - lastThrottleCall >= throttleDelay) {
        lastThrottleCall = now;
        emitBuffered();
      }
    } else {
      emitBuffered();
    }
  }

  let lastLoop = 0;
  function loop(timestamp: number) {
    if (timestamp - lastLoop >= rafThrottle) {
      lastLoop = timestamp;

      let hasChanges = false;
      const rootRect = getRootRect(root);
      const expandedRoot = expandRootRect(rootRect, rootMargin);

      observedElements.forEach((prev, el) => {
        const elRect = el.getBoundingClientRect();

        let intersectionRect: Rect = emptyRect();
        let intersectionRatio = 0;

        if (elRect.width > 0 && elRect.height > 0) {
          intersectionRect = computeIntersectionRect(elRect, expandedRoot);
          intersectionRatio = computeIntersectionRatio(elRect, intersectionRect);
          intersectionRatio = Math.round(intersectionRatio * 100) / 100;
        }

        const isStyle = isStyleVisible(el);
        const current = {
          target: el,
          intersectionRect,
          intersectionRatio,
          isStyleVisible: isStyle,
        };

        const prevIntersectionRatio = prev?.intersectionRatio ?? 0.0;
        const currentIntersectionRatio = current.intersectionRatio;

        if (prevIntersectionRatio !== currentIntersectionRatio) {
          const prevIsVisible = prev?.isStyleVisible && prevIntersectionRatio > threshold;
          const currentIsVisible = current.isStyleVisible && currentIntersectionRatio > threshold;

          if (!prev || prevIsVisible !== currentIsVisible || Math.abs(currentIntersectionRatio - prevIntersectionRatio) > sensitivity) {
            const entry: VisibilityEntry = {
              target: el,
              isVisible: currentIsVisible,
              isStyleVisible: current.isStyleVisible,
              intersectionRatio: currentIntersectionRatio,
              intersectionRect,
              oldValue: prev
            };

            buffer.set(el, entry);
            observedElements.set(el, entry);
            hasChanges = true;
          }
        }
      });

      if (hasChanges) scheduleEmit();
    }

    animationFrameId = requestAnimationFrame(loop);
  }

  animationFrameId = requestAnimationFrame(loop);

  return {
    observe(el: Element) {
      if (!observedElements.has(el)) {
        observedElements.set(el, null);
      }
    },
    unobserve(el: Element) {
      observedElements.delete(el);
      buffer.delete(el);
    },
    disconnect() {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      observedElements.clear();
      buffer.clear();
    },
    setMode(newMode: 'debounce' | 'throttle' | 'none') {
      if (['debounce', 'throttle', 'none'].includes(newMode)) {
        mode = newMode;
      } else {
        console.warn('[VisibilityObserver] Invalid mode:', newMode);
      }
    },
    updateOptions(opts: Partial<ObserverOptions>) {
      if (typeof opts.debounce === 'number') options.debounce = opts.debounce;
      if (typeof opts.throttle === 'number') options.throttle = opts.throttle;
      if (opts.mode) {
        if (['debounce', 'throttle', 'none'].includes(opts.mode)) {
          mode = opts.mode;
        } else {
          console.warn('[VisibilityObserver] Invalid mode:', opts.mode);
        }
      }
    }
  };
}

// const vo = VisibilityObserver((entries) => {
//   console.log('VisibilityObserver [rAF]', entries);
// }, {
//   threshold: 0.5,
//   debounce: 100,
//   rafThrottle: 10,
// });
//
// const mo = new MutationObserver((mutations) => {
//   mutations.forEach(m => {
//     m.addedNodes.forEach(n => {
//       if (n.nodeType === Node.ELEMENT_NODE) {
//         vo.observe(n as Element);
//         (n as HTMLElement).querySelectorAll('*').forEach(el => vo.observe(el));
//       }
//     });
//     m.removedNodes.forEach(n => {
//       if (n.nodeType === Node.ELEMENT_NODE) {
//         vo.unobserve(n as Element);
//       }
//     });
//   });
// });
//
// mo.observe(document.body, { childList: true, subtree: true });
// document.body.querySelectorAll('*').forEach(el => vo.observe(el));
