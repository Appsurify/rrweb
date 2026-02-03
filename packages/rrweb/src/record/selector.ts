import type { SelectorOptions } from '@appsurify-testmap/rrweb-types';
import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';
import { generateSEQL, type GeneratorOptions } from '@whenessel/seql-js';
import { closestElementOfNode } from '../utils';

export type NormalizedSelectorOptions = {
  maxPathDepth: number;
  enableSvgFingerprint?: boolean;
  confidenceThreshold?: number;
  fallbackToBody?: boolean;
};

const defaultSelectorOptions: NormalizedSelectorOptions = {
  maxPathDepth: 10,
  enableSvgFingerprint: true,
  confidenceThreshold: 0.0,
  fallbackToBody: true,
};

export function normalizeSelectorOptions(
  selector?: boolean | SelectorOptions,
): NormalizedSelectorOptions | null {
  if (selector === false) {
    return null;
  }
  if (selector === true || selector === undefined) {
    return { ...defaultSelectorOptions };
  }
  return {
    maxPathDepth: selector.maxPathDepth ?? defaultSelectorOptions.maxPathDepth,
    enableSvgFingerprint:
      selector.enableSvgFingerprint ?? defaultSelectorOptions.enableSvgFingerprint,
    confidenceThreshold:
      selector.confidenceThreshold ?? defaultSelectorOptions.confidenceThreshold,
    fallbackToBody:
      selector.fallbackToBody ?? defaultSelectorOptions.fallbackToBody,
  };
}

export function resolveNodeSelector(
  node: Node,
  mirror: Mirror,
  selectorOptions: NormalizedSelectorOptions | null,
  options?: { force?: boolean },
): string | undefined {
  const nodeMeta = mirror.getMeta(node);
  const nodeExisting = nodeMeta?.selector;
  if (nodeExisting && !options?.force) {
    return nodeExisting;
  }

  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : closestElementOfNode(node);
  if (!element) {
    return nodeExisting;
  }

  const elementMeta = mirror.getMeta(element);
  const elementExisting = elementMeta?.selector;
  if (elementExisting && !options?.force) {
    return elementExisting;
  }
  if (!selectorOptions) {
    return elementExisting ?? nodeExisting;
  }

  const seqlOptions: GeneratorOptions = {
    maxPathDepth: selectorOptions.maxPathDepth,
    enableSvgFingerprint: selectorOptions.enableSvgFingerprint,
    fallbackToBody: selectorOptions.fallbackToBody,
  };

  try {
    const selector = generateSEQL(element, seqlOptions);
    if (selector) {
      if (elementMeta) {
        elementMeta.selector = selector;
      } else if (nodeMeta) {
        nodeMeta.selector = selector;
      }
      return selector;
    }
  } catch {
    // ignore selector generation errors
  }

  return elementExisting ?? nodeExisting;
}
