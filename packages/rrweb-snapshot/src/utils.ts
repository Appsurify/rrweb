import type {
  idNodeMap,
  MaskInputFn,
  MaskInputOptions,
  nodeMetaMap,
} from './types';

import type {
  documentNode,
  documentTypeNode,
  elementNode,
  IMirror,
  serializedNode,
  serializedNodeWithId,
  textNode,
} from "@appsurify-testmap/rrweb-types";
import { NodeType } from '@appsurify-testmap/rrweb-types';
import dom from '@appsurify-testmap/rrweb-utils';


export function isShadowRoot(n: Node): n is ShadowRoot {
  const hostEl: Element | null =
    // anchor and textarea elements also have a `host` property
    // but only shadow roots have a `mode` property
    (n && 'host' in n && 'mode' in n && dom.host(n as ShadowRoot)) || null;
  return Boolean(
    hostEl && 'shadowRoot' in hostEl && dom.shadowRoot(hostEl) === n,
  );
}

/**
 * To fix the issue https://github.com/rrweb-io/rrweb/issues/933.
 * Some websites use polyfilled shadow dom and this function is used to detect this situation.
 */
export function isNativeShadowDom(shadowRoot: ShadowRoot): boolean {
  return Object.prototype.toString.call(shadowRoot) === '[object ShadowRoot]';
}

/**
 * Browsers sometimes destructively modify the css rules they receive.
 * This function tries to rectify the modifications the browser made to make it more cross platform compatible.
 * @param cssText - output of `CSSStyleRule.cssText`
 * @returns `cssText` with browser inconsistencies fixed.
 */
function fixBrowserCompatibilityIssuesInCSS(cssText: string): string {
  /**
   * Chrome outputs `-webkit-background-clip` as `background-clip` in `CSSStyleRule.cssText`.
   * But then Chrome ignores `background-clip` as css input.
   * Re-introduce `-webkit-background-clip` to fix this issue.
   */
  if (
    cssText.includes(' background-clip: text;') &&
    !cssText.includes(' -webkit-background-clip: text;')
  ) {
    cssText = cssText.replace(
      /\sbackground-clip:\s*text;/g,
      ' -webkit-background-clip: text; background-clip: text;',
    );
  }
  return cssText;
}

// Remove this declaration once typescript has added `CSSImportRule.supportsText` to the lib.
declare interface CSSImportRule extends CSSRule {
  readonly href: string;
  readonly layerName: string | null;
  readonly media: MediaList;
  readonly styleSheet: CSSStyleSheet;
  /**
   * experimental API, currently only supported in firefox
   * https://developer.mozilla.org/en-US/docs/Web/API/CSSImportRule/supportsText
   */
  readonly supportsText?: string | null;
}

/**
 * Browsers sometimes incorrectly escape `@import` on `.cssText` statements.
 * This function tries to correct the escaping.
 * more info: https://bugs.chromium.org/p/chromium/issues/detail?id=1472259
 * @param cssImportRule
 * @returns `cssText` with browser inconsistencies fixed, or null if not applicable.
 */
export function escapeImportStatement(rule: CSSImportRule): string {
  const { cssText } = rule;
  if (cssText.split('"').length < 3) return cssText;

  const statement = ['@import', `url(${JSON.stringify(rule.href)})`];
  if (rule.layerName === '') {
    statement.push(`layer`);
  } else if (rule.layerName) {
    statement.push(`layer(${rule.layerName})`);
  }
  if (rule.supportsText) {
    statement.push(`supports(${rule.supportsText})`);
  }
  if (rule.media.length) {
    statement.push(rule.media.mediaText);
  }
  return statement.join(' ') + ';';
}

/*
 * serialize the css rules from the .sheet property
 * for <link rel="stylesheet"> elements, this is the only way of getting the rules without a FETCH
 * for <style> elements, this is less preferable to looking at childNodes[0].textContent
 * (which will include vendor prefixed rules which may not be used or visible to the recorded browser,
 * but which might be needed by the replayer browser)
 * however, at snapshot time, we don't know whether the style element has suffered
 * any programmatic manipulation prior to the snapshot, in which case the .sheet would be more up to date
 */
export function stringifyStylesheet(s: CSSStyleSheet): string | null {
  try {
    const rules = s.rules || s.cssRules;
    if (!rules) {
      return null;
    }
    let sheetHref = s.href;
    if (!sheetHref && s.ownerNode && s.ownerNode.ownerDocument) {
      // an inline <style> element
      sheetHref = s.ownerNode.ownerDocument.location.href;
    }
    const stringifiedRules = Array.from(rules, (rule: CSSRule) =>
      stringifyRule(rule, sheetHref),
    ).join('');
    return fixBrowserCompatibilityIssuesInCSS(stringifiedRules);
  } catch (error) {
    return null;
  }
}

export function stringifyRule(rule: CSSRule, sheetHref: string | null): string {
  if (isCSSImportRule(rule)) {
    let importStringified;
    try {
      importStringified =
        // for same-origin stylesheets,
        // we can access the imported stylesheet rules directly
        stringifyStylesheet(rule.styleSheet) ||
        // work around browser issues with the raw string `@import url(...)` statement
        escapeImportStatement(rule);
    } catch (error) {
      importStringified = rule.cssText;
    }
    if (rule.styleSheet.href) {
      // url()s within the imported stylesheet are relative to _that_ sheet's href
      return absolutifyURLs(importStringified, rule.styleSheet.href);
    }
    return importStringified;
  } else {
    let ruleStringified = rule.cssText;
    if (isCSSStyleRule(rule) && rule.selectorText.includes(':')) {
      // Safari does not escape selectors with : properly
      // see https://bugs.webkit.org/show_bug.cgi?id=184604
      ruleStringified = fixSafariColons(ruleStringified);
    }
    if (sheetHref) {
      return absolutifyURLs(ruleStringified, sheetHref);
    }
    return ruleStringified;
  }
}

export function fixSafariColons(cssStringified: string): string {
  // Replace e.g. [aa:bb] with [aa\\:bb]
  const regex = /(\[(?:[\w-]+)[^\\])(:(?:[\w-]+)\])/gm;
  return cssStringified.replace(regex, '$1\\$2');
}

export function isCSSImportRule(rule: CSSRule): rule is CSSImportRule {
  return 'styleSheet' in rule;
}

export function isCSSStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return 'selectorText' in rule;
}

export class Mirror implements IMirror<Node> {
  private idNodeMap: idNodeMap = new Map();
  private nodeMetaMap: nodeMetaMap = new WeakMap();

  getId(n: Node | undefined | null): number {
    if (!n) return -1;

    const id = this.getMeta(n)?.id;

    // if n is not a serialized Node, use -1 as its id.
    return id ?? -1;
  }

  getNode(id: number): Node | null {
    return this.idNodeMap.get(id) || null;
  }

  getIds(): number[] {
    return Array.from(this.idNodeMap.keys());
  }

  getMeta(n: Node): serializedNodeWithId | null {
    return this.nodeMetaMap.get(n) || null;
  }

  // removes the node from idNodeMap
  // doesn't remove the node from nodeMetaMap
  removeNodeFromMap(n: Node) {
    const id = this.getId(n);
    this.idNodeMap.delete(id);

    if (n.childNodes) {
      n.childNodes.forEach((childNode) =>
        this.removeNodeFromMap(childNode as unknown as Node),
      );
    }
  }
  has(id: number): boolean {
    return this.idNodeMap.has(id);
  }

  hasNode(node: Node): boolean {
    return this.nodeMetaMap.has(node);
  }

  add(n: Node, meta: serializedNodeWithId) {
    const id = meta.id;
    this.idNodeMap.set(id, n);
    this.nodeMetaMap.set(n, meta);
  }

  replace(id: number, n: Node) {
    const oldNode = this.getNode(id);
    if (oldNode) {
      const meta = this.nodeMetaMap.get(oldNode);
      if (meta) this.nodeMetaMap.set(n, meta);
    }
    this.idNodeMap.set(id, n);
  }

  reset() {
    this.idNodeMap = new Map();
    this.nodeMetaMap = new WeakMap();
  }
}

export function createMirror(): Mirror {
  return new Mirror();
}

export function maskInputValue({
  element,
  maskInputOptions,
  tagName,
  type,
  value,
  maskInputFn,
}: {
  element: HTMLElement;
  maskInputOptions: MaskInputOptions;
  tagName: string;
  type: string | null;
  value: string | null;
  maskInputFn?: MaskInputFn;
}): string {
  let text = value || '';
  const actualType = type && toLowerCase(type);

  if (
    maskInputOptions[tagName.toLowerCase() as keyof MaskInputOptions] ||
    (actualType && maskInputOptions[actualType as keyof MaskInputOptions])
  ) {
    if (maskInputFn) {
      text = maskInputFn(text, element);
    } else {
      text = '*'.repeat(text.length);
    }
  }
  return text;
}

export function toLowerCase<T extends string>(str: T): Lowercase<T> {
  return str.toLowerCase() as unknown as Lowercase<T>;
}

const ORIGINAL_ATTRIBUTE_NAME = '__rrweb_original__';
type PatchedGetImageData = {
  [ORIGINAL_ATTRIBUTE_NAME]: CanvasImageData['getImageData'];
} & CanvasImageData['getImageData'];

export function is2DCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;

  const chunkSize = 50;

  // get chunks of the canvas and check if it is blank
  for (let x = 0; x < canvas.width; x += chunkSize) {
    for (let y = 0; y < canvas.height; y += chunkSize) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const getImageData = ctx.getImageData as PatchedGetImageData;
      const originalGetImageData =
        ORIGINAL_ATTRIBUTE_NAME in getImageData
          ? getImageData[ORIGINAL_ATTRIBUTE_NAME]
          : getImageData;
      // by getting the canvas in chunks we avoid an expensive
      // `getImageData` call that retrieves everything
      // even if we can already tell from the first chunk(s) that
      // the canvas isn't blank
      const pixelBuffer = new Uint32Array(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        originalGetImageData.call(
          ctx,
          x,
          y,
          Math.min(chunkSize, canvas.width - x),
          Math.min(chunkSize, canvas.height - y),
        ).data.buffer,
      );
      if (pixelBuffer.some((pixel) => pixel !== 0)) return false;
    }
  }
  return true;
}

export function isNodeMetaEqual(a: serializedNode, b: serializedNode): boolean {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === NodeType.Document)
    return a.compatMode === (b as documentNode).compatMode;
  else if (a.type === NodeType.DocumentType)
    return (
      a.name === (b as documentTypeNode).name &&
      a.publicId === (b as documentTypeNode).publicId &&
      a.systemId === (b as documentTypeNode).systemId
    );
  else if (
    a.type === NodeType.Comment ||
    a.type === NodeType.Text ||
    a.type === NodeType.CDATA
  )
    return a.textContent === (b as textNode).textContent;
  else if (a.type === NodeType.Element)
    return (
      a.tagName === (b as elementNode).tagName &&
      JSON.stringify(a.attributes) ===
        JSON.stringify((b as elementNode).attributes) &&
      a.isSVG === (b as elementNode).isSVG &&
      a.needBlock === (b as elementNode).needBlock
    );
  return false;
}

/**
 * Get the type of an input element.
 * This takes care of the case where a password input is changed to a text input.
 * In this case, we continue to consider this of type password, in order to avoid leaking sensitive data
 * where passwords should be masked.
 */
export function getInputType(element: HTMLElement): Lowercase<string> | null {
  // when omitting the type of input element(e.g. <input />), the type is treated as text
  const type = (element as HTMLInputElement).type;

  return element.hasAttribute('data-rr-is-password')
    ? 'password'
    : type
    ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      toLowerCase(type)
    : null;
}

/**
 * Extracts the file extension from an a path, considering search parameters and fragments.
 * @param path - Path to file
 * @param baseURL - [optional] Base URL of the page, used to resolve relative paths. Defaults to current page URL.
 */
export function extractFileExtension(
  path: string,
  baseURL?: string,
): string | null {
  let url;
  try {
    url = new URL(path, baseURL ?? window.location.href);
  } catch (err) {
    return null;
  }
  const regex = /\.([0-9a-z]+)(?:$)/i;
  const match = url.pathname.match(regex);
  return match?.[1] ?? null;
}

function extractOrigin(url: string): string {
  let origin = '';
  if (url.indexOf('//') > -1) {
    origin = url.split('/').slice(0, 3).join('/');
  } else {
    origin = url.split('/')[0];
  }
  origin = origin.split('?')[0];
  return origin;
}

const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm;
const URL_PROTOCOL_MATCH = /^(?:[a-z+]+:)?\/\//i;
const URL_WWW_MATCH = /^www\..*/i;
const DATA_URI = /^(data:)([^,]*),(.*)/i;
export function absolutifyURLs(cssText: string | null, href: string): string {
  return (cssText || '').replace(
    URL_IN_CSS_REF,
    (
      origin: string,
      quote1: string,
      path1: string,
      quote2: string,
      path2: string,
      path3: string,
    ) => {
      const filePath = path1 || path2 || path3;
      const maybeQuote = quote1 || quote2 || '';
      if (!filePath) {
        return origin;
      }
      if (URL_PROTOCOL_MATCH.test(filePath) || URL_WWW_MATCH.test(filePath)) {
        return `url(${maybeQuote}${filePath}${maybeQuote})`;
      }
      if (DATA_URI.test(filePath)) {
        return `url(${maybeQuote}${filePath}${maybeQuote})`;
      }
      if (filePath[0] === '/') {
        return `url(${maybeQuote}${
          extractOrigin(href) + filePath
        }${maybeQuote})`;
      }
      const stack = href.split('/');
      const parts = filePath.split('/');
      stack.pop();
      for (const part of parts) {
        if (part === '.') {
          continue;
        } else if (part === '..') {
          stack.pop();
        } else {
          stack.push(part);
        }
      }
      return `url(${maybeQuote}${stack.join('/')}${maybeQuote})`;
    },
  );
}

/**
 * Intention is to normalize by remove spaces, semicolons and CSS comments
 * so that we can compare css as authored vs. output of stringifyStylesheet
 */
export function normalizeCssString(cssText: string): string {
  return cssText.replace(/(\/\*[^*]*\*\/)|[\s;]/g, '');
}

/**
 * Maps the output of stringifyStylesheet to individual text nodes of a <style> element
 * which occurs when javascript is used to append to the style element
 * and may also occur when browsers opt to break up large text nodes
 * performance needs to be considered, see e.g. #1603
 */
export function splitCssText(
  cssText: string,
  style: HTMLStyleElement,
): string[] {
  const childNodes = Array.from(style.childNodes);
  const splits: string[] = [];
  let iterLimit = 0;
  if (childNodes.length > 1 && cssText && typeof cssText === 'string') {
    let cssTextNorm = normalizeCssString(cssText);
    const normFactor = cssTextNorm.length / cssText.length;
    for (let i = 1; i < childNodes.length; i++) {
      if (
        childNodes[i].textContent &&
        typeof childNodes[i].textContent === 'string'
      ) {
        const textContentNorm = normalizeCssString(childNodes[i].textContent!);
        let j = 3;
        for (; j < textContentNorm.length; j++) {
          if (
            // keep consuming css identifiers (to get a decent chunk more quickly)
            textContentNorm[j].match(/[a-zA-Z0-9]/) ||
            // substring needs to be unique to this section
            textContentNorm.indexOf(textContentNorm.substring(0, j), 1) !== -1
          ) {
            continue;
          }
          break;
        }
        for (; j < textContentNorm.length; j++) {
          const bit = textContentNorm.substring(0, j);
          // this substring should appears only once in overall text too
          const bits = cssTextNorm.split(bit);
          let splitNorm = -1;
          if (bits.length === 2) {
            splitNorm = cssTextNorm.indexOf(bit);
          } else if (
            bits.length > 2 &&
            bits[0] === '' &&
            childNodes[i - 1].textContent !== ''
          ) {
            // this childNode has same starting content as previous
            splitNorm = cssTextNorm.indexOf(bit, 1);
          }
          if (splitNorm !== -1) {
            // find the split point in the original text
            let k = Math.floor(splitNorm / normFactor);
            for (; k > 0 && k < cssText.length; ) {
              iterLimit += 1;
              if (iterLimit > 50 * childNodes.length) {
                // quit for performance purposes
                splits.push(cssText);
                return splits;
              }
              const normPart = normalizeCssString(cssText.substring(0, k));
              if (normPart.length === splitNorm) {
                splits.push(cssText.substring(0, k));
                cssText = cssText.substring(k);
                cssTextNorm = cssTextNorm.substring(splitNorm);
                break;
              } else if (normPart.length < splitNorm) {
                k += Math.max(
                  1,
                  Math.floor((splitNorm - normPart.length) / normFactor),
                );
              } else {
                k -= Math.max(
                  1,
                  Math.floor((normPart.length - splitNorm) * normFactor),
                );
              }
            }
            break;
          }
        }
      }
    }
  }
  splits.push(cssText); // either the full thing if no splits were found, or the last split
  return splits;
}

export function markCssSplits(
  cssText: string,
  style: HTMLStyleElement,
): string {
  return splitCssText(cssText, style).join('/* rr_split */');
}


export function getXPath(node: Node): string {
  // console.info(node.nodeType, node);

  if (node.nodeType === Node.DOCUMENT_NODE) {
    // Корневой узел документа всегда возвращает "/"
    return '/';
  }

  if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
    // Узел типа документа (DOCTYPE)
    return '/html/doctype';
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;

    if (element.id) {
      // Если у элемента есть уникальный ID, используем его
      return `//*[@id="${element.id}"]`;
    }

    if (element.tagName && element.tagName.toLowerCase() === 'html') {
      return '/html'
    }

    if (element === document.head) {
      return '/html/head'
    }

    if (element === document.body) {
      // Узел body
      return '/html/body';
    }

    const parentNode = element.parentNode;
    if (!parentNode || !(parentNode instanceof Element)) {
      // Если родительский узел недоступен или не является элементом, путь построить нельзя
      return '';
    }

    const siblings = Array.from(parentNode.children).filter(
      (sibling) => sibling.tagName === element.tagName
    );

    const index = siblings.length > 1 ? `[${siblings.indexOf(element) + 1}]` : '';

    // Рекурсивное построение пути
    return `${getXPath(parentNode)}/${element.tagName.toLowerCase()}${index}`;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentNode;
    if (!parent) {
      // Если текстовый узел не имеет родителя, путь построить нельзя
      return '';
    }

    const textSiblings = Array.from(parent.childNodes).filter(
      (sibling) => sibling.nodeType === Node.TEXT_NODE
    );

    const index = textSiblings.length > 1 ? `[${textSiblings.indexOf((node as Element)) + 1}]` : '';

    return `${getXPath(parent)}/text()${index}`;
  }

  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    const parent = node.parentNode;
    if (!parent) {
      return '';
    }

    const cdataSiblings = Array.from(parent.childNodes).filter(
      (sibling) => sibling.nodeType === Node.CDATA_SECTION_NODE
    );

    const index = cdataSiblings.length > 1 ? `[${cdataSiblings.indexOf((node as Element)) + 1}]` : '';

    return `${getXPath(parent)}/text()${index}`;
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    const parent = node.parentNode;
    if (!parent) {
      return '';
    }

    const commentSiblings = Array.from(parent.childNodes).filter(
      (sibling) => sibling.nodeType === Node.COMMENT_NODE
    );

    const index = commentSiblings.length > 1 ? `[${commentSiblings.indexOf((node as Element)) + 1}]` : '';

    return `${getXPath(parent)}/comment()${index}`;
  }

  return ''; // Если тип узла не поддерживается
}

export function isElement(n: Node): n is Element {
  return n.nodeType === n.ELEMENT_NODE;
}

export function isTextVisible(n: Text): boolean {
  // const parentElement = n.parentElement;

  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parent = dom.parentNode(n);
  const parentElement = parent && (parent as Element);
  if (!parentElement) {
    return false;
  }
  const isParentVisible = isElementVisible(parentElement);
  if (!isParentVisible) {
    return false;
  }
  const textContent = n.textContent?.trim();
  return textContent !== '';
}

export function isElementVisible(n: Element): boolean {
  return isStyleVisible(n) && isRectVisible(n.getBoundingClientRect());
}

function isStyleVisible(n: Element): boolean {
  const style = window.getComputedStyle(n);
  return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) !== 0;
}

function isRectVisible(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 &&
    rect.top >= 0 && rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth);
}

// TODO: Original with bug
// function getInteractiveEvents(): string[] {
//   return Object.keys(InteractiveEvent)
//     .filter(key => isNaN(Number(key)))
//     .map(key => key.toLowerCase().replace(/_/g, '-'));
// }
//
// function getInteractiveTags(): string[] {
//   return Object.keys(interactiveTag)
//     .filter(key => isNaN(Number(key)))
//     .map(key => key.toLowerCase().replace(/_/g, '-'));
// }
//
//
// function hasEventListeners(n: Node): boolean {
//   return getInteractiveEvents().some(eventType => {
//     let hasListener = false;
//     const testListener = () => { hasListener = true; };
//
//     n.addEventListener(eventType, testListener);
//     // n.dispatchEvent(new Event(eventType));
//     n.removeEventListener(eventType, testListener);
//
//     return hasListener;
//   });
// }
//
//
// export function isElementInteractive(n: Node): boolean {
//   const allowedTags = getInteractiveTags();
//
//   if (n.nodeType === Node.ELEMENT_NODE) {
//     const element = n as Element;
//     const tagName = element.tagName.toLowerCase();
//
//     if (!allowedTags.includes(tagName)) {
//       return false;
//     }
//
//     const hasTabIndex = element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1';
//     const hasRoleInteractive = ['button', 'link', 'checkbox', 'switch', 'menuitem'].includes(
//       element.getAttribute('role') || ''
//     );
//
//     const result = (
//       hasEventListeners(element) ||
//       hasTabIndex ||
//       hasRoleInteractive ||
//       (element instanceof HTMLAnchorElement && element.hasAttribute('href')) ||
//       (element instanceof HTMLButtonElement && !element.disabled)
//     );
//
//     return result;
//   }
//
//   if (n.nodeType === Node.TEXT_NODE) {
//     const textNode = n as Text;
//     const parentElement = textNode.parentElement;
//
//     return (
//       parentElement !== null &&
//       allowedTags.includes(parentElement.tagName.toLowerCase()) &&
//       isElementVisible(parentElement) &&
//       textNode.textContent?.trim().length !== 0 &&
//       isElementInteractive(parentElement)
//     );
//   }
//
//   return false;
// }


const interactiveEvents = [
  'change',
  'submit',
  'dragstart',
  'drop',
  'pointerdown',
  'pointerup',
  'input',
  'keydown',
  'keyup',
  'keypress',
  'mouseenter',
  'mouseleave',
  'mouseup',
  'mousedown',
  'click',
  'contextmenu',
  'dblclick',
  'focus',
  'blur',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
]

const interactiveTags = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'details',
  'summary',
  'dialog',
  'video',
  'audio'
];

// Список атрибутов, которые могут содержать inline‑обработчики
const inlineEventAttributes = [
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmouseout',
  'onmousemove',
  'onfocus',
  'onblur',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onchange',
  'oninput',
  'onsubmit',
  'onreset',
  'onselect',
  'oncontextmenu',
  'ontouchstart',
  'ontouchmove',
  'ontouchend',
  'ontouchcancel'
];

// Глобальный реестр для хранения интерактивных элементов
const interactiveElementsRegistry = new WeakSet<Element>();

const originalAddEventListener = EventTarget.prototype.addEventListener;

// Переопределяем addEventListener
EventTarget.prototype.addEventListener = function (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) {
  // Вызываем оригинальный метод
  originalAddEventListener.call(this, type, listener, options);
  // Если this является элементом, проверяем тип события
  if (this instanceof Element) {
    const eventType = type.toLowerCase();
    console.info("Event type: ", eventType);
    if (interactiveEvents.includes(eventType)) {
      interactiveElementsRegistry.add(this);
    }
  }
};

const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
EventTarget.prototype.removeEventListener = function (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions,
) {
  originalRemoveEventListener.call(this, type, listener, options);
  // Опционально: можно реализовать логику удаления элемента из реестра, если на нём больше интерактивных обработчиков.
  // Но часто это не требуется для задачи маркировки элемента как интерактивного.
};

function hasEventListeners(n: Node): boolean {
  // console.info("hasEventListeners: ", n, interactiveElementsRegistry.has(n));
  return n instanceof Element && interactiveElementsRegistry.has(n);
}

export function isElementInteractive(n: Node): boolean {

  if (n.nodeType === Node.ELEMENT_NODE) {
    const element = n as Element;
    const tagName = element.tagName.toLowerCase();

    if (interactiveTags.includes(tagName)) {
      return true;
    }

    const hasTabIndex =
      element.hasAttribute('tabindex') &&
      element.getAttribute('tabindex') !== '-1';
    const hasRoleInteractive = ['button', 'link', 'checkbox', 'switch', 'menuitem'].includes(
      element.getAttribute('role') || ''
    );
    const result =
      hasEventListeners(element) ||
      hasTabIndex ||
      hasRoleInteractive ||
      (element instanceof HTMLAnchorElement && element.hasAttribute('href')) ||
      (element instanceof HTMLButtonElement && !element.disabled);

    // console.info("Element: ", element, " is interactive: ", result, " hasTabIndex: ", hasTabIndex, " hasRoleInteractive: ", hasRoleInteractive, " hasEventListeners: ", hasEventListeners(element), " anchorElement: ", element instanceof HTMLAnchorElement, " buttonElement: ", element instanceof HTMLButtonElement);
    return result;
  }

  // Для текстовых узлов и прочих оставляем существующую логику...
  if (n.nodeType === Node.TEXT_NODE) {
    const textNode = n as Text;
    const parentElement = textNode.parentElement;

    if (parentElement !== null && interactiveTags.includes(parentElement.tagName.toLowerCase())) {
      return true;
    }

    return (
      parentElement !== null &&
      isElementVisible(parentElement) &&
      textNode.textContent?.trim().length !== 0 &&
      isElementInteractive(parentElement)
    );
  }

  return false;
}

function inspectInlineEventHandlers() {
  const allElements = document.querySelectorAll('*');
  allElements.forEach((el) => {
    inlineEventAttributes.forEach((attr) => {
      if (el.hasAttribute(attr)) {
        interactiveElementsRegistry.add(el);
      }
    });
  });
}

// Если DOM уже загружен – выполняем инспекцию сразу,
// иначе – ждем события DOMContentLoaded
if (
  document.readyState === 'complete' ||
  document.readyState === 'interactive'
) {
  inspectInlineEventHandlers();
  // console.info('DOMContentLoaded and inspect called');
} else {
  document.addEventListener('DOMContentLoaded', inspectInlineEventHandlers);
  // console.info('DOMContentLoaded and added handler');
}
