type Rect = Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>;

export type VisibilityCheckEntry = {
  target: Element;
  isVisible: boolean;
  isCSSVisible: boolean;
  isViewportVisible: boolean;
  hasSize: boolean;
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
  const opacityCache = new Map<Element, boolean>();

  for (const el of elements) {
    const elRect = el.getBoundingClientRect();
    const elHasSize = elRect.width > 0 && elRect.height > 0;

    let intersectionRect: Rect = emptyRect();
    let intersectionRatio = 0;

    if (elHasSize) {
      intersectionRect = computeIntersectionRect(elRect, expandedRoot);
      intersectionRatio = computeIntersectionRatio(elRect, intersectionRect);
      intersectionRatio = Math.round(intersectionRatio * 100) / 100;
    }

    const ownStyleVis = isOwnStyleVisible(el);
    // Gate: only walk ancestors when own style passes
    const isCSSVisible = ownStyleVis && isAncestorOpacityVisible(el, opacityCache);
    const isViewportVisible = elHasSize && intersectionRatio > 0;
    const isVisible = isCSSVisible && isViewportVisible && intersectionRatio > threshold;

    const old = previous.get(el) ?? null;
    const prevRatio = old?.intersectionRatio ?? 0;
    const wasVisible = old?.isCSSVisible && prevRatio > threshold;

    const changed =
      !old ||
      wasVisible !== isVisible ||
      old.isCSSVisible !== isCSSVisible ||
      old.hasSize !== elHasSize ||
      Math.abs(intersectionRatio - prevRatio) > sensitivity;

    if (changed) {
      current.set(el, {
        target: el,
        isVisible,
        isCSSVisible,
        isViewportVisible,
        hasSize: elHasSize,
        intersectionRatio,
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

function isOwnStyleVisible(el: Element): boolean {
  const style = getComputedStyle(el);
  return style &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    (parseFloat(style.opacity) || 0) > 0;
}

function isAncestorOpacityVisible(el: Element, cache: Map<Element, boolean>): boolean {
  const visited: Element[] = [];
  let node: Element | null = el.parentElement;
  while (node) {
    const cached = cache.get(node);
    if (cached !== undefined) {
      // Backfill all visited nodes with the cached result
      for (const v of visited) cache.set(v, cached);
      return cached;
    }
    const s = getComputedStyle(node);
    if ((parseFloat(s.opacity) || 0) <= 0) {
      cache.set(node, false);
      for (const v of visited) cache.set(v, false);
      return false;
    }
    visited.push(node);
    node = node.parentElement;
  }
  // Full chain confirmed visible — safe to cache true
  for (const v of visited) cache.set(v, true);
  return true;
}
