import { stringifyRule, absolutifyURLs } from '@appsurify-testmap/rrweb-snapshot';
import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';
import type {
  elementNode,
  serializedNodeWithId,
  adoptedStyleSheetCallback,
  adoptedStyleSheetParam,
  attributeMutation,
  mutationCallBack,
} from '@appsurify-testmap/rrweb-types';
import { StyleSheetMirror } from '../utils';

export class StylesheetManager {
  private trackedLinkElements: WeakSet<HTMLLinkElement> = new WeakSet();
  private mutationCb: mutationCallBack;
  private adoptedStyleSheetCb: adoptedStyleSheetCallback;
  private inlineStylesheet: boolean | 'all';
  private mirror: Mirror;
  public styleMirror = new StyleSheetMirror();

  constructor(options: {
    mutationCb: mutationCallBack;
    adoptedStyleSheetCb: adoptedStyleSheetCallback;
    inlineStylesheet: boolean | 'all';
    mirror: Mirror;
  }) {
    this.mutationCb = options.mutationCb;
    this.adoptedStyleSheetCb = options.adoptedStyleSheetCb;
    this.inlineStylesheet = options.inlineStylesheet;
    this.mirror = options.mirror;
  }

  public attachLinkElement(
    linkEl: HTMLLinkElement,
    childSn: serializedNodeWithId,
  ) {
    if ('_cssText' in (childSn as elementNode).attributes)
      this.mutationCb({
        adds: [],
        removes: [],
        texts: [],
        attributes: [
          {
            id: childSn.id,
            attributes: (childSn as elementNode)
              .attributes as attributeMutation['attributes'],
          },
        ],
      });

    this.trackLinkElement(linkEl);
  }

  public trackLinkElement(linkEl: HTMLLinkElement) {
    if (this.trackedLinkElements.has(linkEl)) return;

    this.trackedLinkElements.add(linkEl);
    this.trackStylesheetInLinkElement(linkEl);
  }

  public adoptStyleSheets(
    sheets: CSSStyleSheet[] | readonly CSSStyleSheet[],
    hostId: number,
  ) {
    if (sheets.length === 0) return;
    const adoptedStyleSheetData: adoptedStyleSheetParam = {
      id: hostId,
      styleIds: [] as number[],
    };
    const styles: NonNullable<adoptedStyleSheetParam['styles']> = [];
    for (const sheet of sheets) {
      let styleId;
      if (!this.styleMirror.has(sheet)) {
        styleId = this.styleMirror.add(sheet);
        styles.push({
          styleId,
          rules: Array.from(sheet.rules || CSSRule, (r, index) => ({
            rule: stringifyRule(r, sheet.href),
            index,
          })),
        });
      } else styleId = this.styleMirror.getId(sheet);
      adoptedStyleSheetData.styleIds.push(styleId);
    }
    if (styles.length > 0) adoptedStyleSheetData.styles = styles;
    this.adoptedStyleSheetCb(adoptedStyleSheetData);
  }

  public reset() {
    this.styleMirror.reset();
    this.trackedLinkElements = new WeakSet();
  }

  // With `inlineStylesheet: 'all'`, cross-origin stylesheets — which CSSOM
  // cannot read (accessing `.cssRules` throws a SecurityError, so serialization
  // leaves them as a remote <link>) — are fetched over the network and inlined
  // as a post-snapshot `_cssText` attribute mutation. On replay a <link> bearing
  // `_cssText` is rebuilt into an inline <style> (see getTagName in rebuild.ts),
  // making the recording independent of the live origin.
  //
  // Same-origin sheets are intentionally skipped: they are already inlined
  // synchronously during serialization via CSSOM (or repaired through the
  // onStylesheetLoad re-serialization path), so fetching them would only
  // duplicate work. @import-ed sub-stylesheets inside the fetched CSS are not
  // recursively inlined — their url()s are absolutized, not embedded.
  private trackStylesheetInLinkElement(linkEl: HTMLLinkElement) {
    if (this.inlineStylesheet !== 'all') return;

    const href = linkEl.href;
    if (!href) return;

    const ownerDoc = linkEl.ownerDocument;
    const baseHref = ownerDoc?.location?.href || href;
    let isCrossOrigin: boolean;
    try {
      isCrossOrigin =
        new URL(href, baseHref).origin !== new URL(baseHref).origin;
    } catch {
      return;
    }
    if (!isCrossOrigin) return;

    const id = this.mirror.getId(linkEl);
    if (id === -1) return;

    const win = ownerDoc?.defaultView;
    if (!win || typeof win.fetch !== 'function') return;

    win
      .fetch(href, { credentials: 'omit' })
      .then((res) => (res.ok ? res.text() : null))
      .then((cssText) => {
        if (!cssText) return;
        this.mutationCb({
          adds: [],
          removes: [],
          texts: [],
          attributes: [
            {
              id,
              attributes: {
                _cssText: absolutifyURLs(cssText, href),
              } as attributeMutation['attributes'],
            },
          ],
        });
      })
      .catch(() => {
        // Network failure, or the sheet lacks permissive CORS headers — nothing
        // we can do in-browser; leave the <link> as a remote reference.
      });
  }
}
