type Rect = Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>;

export type VisibilityCheckEntry = {
  target: Element;
  isVisible: boolean;
  isStyleVisible: boolean;
  intersectionRatio: number;
  intersectionRect: Rect;
  oldValue: VisibilityCheckEntry | null;
};

export function computeVisibility(
  elements: Iterable<Element>,
  previous: Map<Element, VisibilityCheckEntry>,
  options?: {
    root?: Element | null;
    threshold?: number;
    sensitivity?: number;
    rootMargin?: string;
  }
): Map<Element, VisibilityCheckEntry> {
  const root = options?.root ?? null;
  const threshold = options?.threshold ?? 0.5;
  const sensitivity = options?.sensitivity ?? 0.05;
  const rootMarginFn = parseRootMargin(options?.rootMargin ?? '0px');

  const current: Map<Element, VisibilityCheckEntry> = new Map();
  const rootRect = getRootRect(root);
  const expandedRoot = expandRootRect(rootRect, rootMarginFn);

  for (const el of elements) {
    const elRect = el.getBoundingClientRect();

    let intersectionRect: Rect = emptyRect();
    let intersectionRatio = 0;

    if (elRect.width > 0 && elRect.height > 0) {
      intersectionRect = computeIntersectionRect(elRect, expandedRoot);
      intersectionRatio = computeIntersectionRatio(elRect, intersectionRect);
      intersectionRatio = Math.round(intersectionRatio * 100) / 100;
    }

    const isStyle = isStyleVisible(el);
    const old = previous.get(el) ?? null;

    const prevRatio = old?.intersectionRatio ?? 0;
    const currRatio = intersectionRatio;
    const wasVisible = old?.isStyleVisible && prevRatio > threshold;
    const nowVisible = isStyle && currRatio > threshold;

    const changed =
      !old ||
      wasVisible !== nowVisible ||
      (
        wasVisible !== nowVisible &&
        Math.abs(currRatio - prevRatio) > sensitivity
      );

    if (changed) {
      current.set(el, {
        target: el,
        isVisible: nowVisible,
        isStyleVisible: isStyle,
        intersectionRatio: currRatio,
        intersectionRect,
        oldValue: old,
      });
    } else {
      current.set(el, old);
    }
  }

  return current;
}

function parseRootMargin(marginStr: string): (rootRect: DOMRect) => DOMRect {
  const parts = marginStr.trim().split(/\s+/);
  const getValue = (val: string, size: number) =>
    val.endsWith('%') ? (parseFloat(val) / 100) * size : parseFloat(val) || 0;

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

function expandRootRect(rect: DOMRect, marginFn: (rootRect: DOMRect) => DOMRect): DOMRect {
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
