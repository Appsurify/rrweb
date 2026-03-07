import {
  snapshot,
  type MaskInputOptions,
  type SlimDOMOptions,
  createMirror,
  maskInputValue,
  getInputType,
} from '@appsurify-testmap/rrweb-snapshot';
import { initObservers, mutationBuffers, INPUT_TAGS, lastInputValueMap } from './observer';
import {
  on,
  getWindowWidth,
  getWindowHeight,
  getWindowScroll,
  polyfill,
  hasShadowRoot,
  isSerializedIframe,
  isSerializedStylesheet,
  nowTimestamp,
} from '../utils';
import type { recordOptions } from '../types';
import {
  EventType,
  type eventWithoutTime,
  type eventWithTime,
  IncrementalSource,
  type listenerHandler,
  type mutationCallbackParam,
  type visibilityCallbackParam,
  type scrollCallback,
  type canvasMutationParam,
  type adoptedStyleSheetParam,
} from "@appsurify-testmap/rrweb-types";
import type { CrossOriginIframeMessageEventContent } from '../types';
import { IframeManager } from './iframe-manager';
import { ShadowDomManager } from './shadow-dom-manager';
import { CanvasManager } from './observers/canvas/canvas-manager';
import { VisibilityManager } from './observers/visibility/visibility-manager';
import { NavigationManager } from './observers/navigation/navigation-manager';
import { StylesheetManager } from './stylesheet-manager';
import ProcessedNodeManager from './processed-node-manager';
import { normalizeSelectorOptions } from './selector';
import {
  callbackWrapper,
  registerErrorHandler,
  unregisterErrorHandler,
} from './error-handler';
import dom from '@appsurify-testmap/rrweb-utils';



const version = __APP_VERSION__;

let wrappedEmit!: (e: eventWithoutTime, isCheckout?: boolean) => void;

let takeFullSnapshot!: (isCheckout?: boolean) => void;
let canvasManager!: CanvasManager;
let recording = false;

const customEventQueue: eventWithoutTime[] = [];
let flushCustomEventQueue!: () => void;



// Multiple tools (i.e. MooTools, Prototype.js) override Array.from and drop support for the 2nd parameter
// Try to pull a clean implementation from a newly created iframe
try {
  if (Array.from([1], (x) => x * 2)[0] !== 2) {
    const cleanFrame = document.createElement('iframe');
    document.body.appendChild(cleanFrame);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Array.from is static and doesn't rely on binding
    Array.from = cleanFrame.contentWindow?.Array.from || Array.from;
    document.body.removeChild(cleanFrame);
  }
} catch (err) {
  console.debug('Unable to override Array.from', err);
}

const mirror = createMirror();

function record<T = eventWithTime>(
  options: recordOptions<T> = {},
): listenerHandler | undefined {
  const {
    emit,
    checkoutEveryNms,
    checkoutEveryNth,
    checkoutEveryNvm,
    checkoutDebounce,
    blockClass = 'rr-block',
    blockSelector = null,
    ignoreClass = 'rr-ignore',
    ignoreSelector = null,
    excludeAttribute: _excludeAttribute,
    maskTextClass = 'rr-mask',
    maskTextSelector = null,
    inlineStylesheet = true,
    maskAllInputs,
    maskInputOptions: _maskInputOptions,
    slimDOMOptions: _slimDOMOptions,
    maskInputFn,
    maskTextFn,
    hooks,
    packFn,
    sampling = {},
    dataURLOptions = {},
    mousemoveWait,
    recordDOM = true,
    recordCanvas = false,
    recordCrossOriginIframes = false,
    recordAfter = options.recordAfter === 'DOMContentLoaded'
      ? options.recordAfter
      : 'load',
    flushCustomEvent = options.flushCustomEvent !== undefined ? options.flushCustomEvent : 'after',
    userTriggeredOnInput = false,
    trustSyntheticInput = false,
    collectFonts = false,
    inlineImages = false,
    plugins,
    keepIframeSrcFn = () => false,
    ignoreCSSAttributes = new Set([]),
    selector,
    errorHandler,
  } = options;
  registerErrorHandler(errorHandler);

  const inEmittingFrame = recordCrossOriginIframes
    ? window.parent === window
    : true;

  let passEmitsToParent = false;
  if (!inEmittingFrame) {
    try {
      // throws if parent is cross-origin
      if (window.parent.document) {
        passEmitsToParent = false; // if parent is same origin we collect iframe events from the parent
      }
    } catch (e) {
      passEmitsToParent = true;
    }
  }

  // runtime checks for user options
  if (inEmittingFrame && !emit) {
    throw new Error('emit function is required');
  }
  if (!inEmittingFrame && !passEmitsToParent) {
    return () => {
      /* no-op since in this case we don't need to record anything from this frame in particular */
    };
  }
  // move departed options to new options
  if (mousemoveWait !== undefined && sampling.mousemove === undefined) {
    sampling.mousemove = mousemoveWait;
  }

  // reset mirror in case `record` this was called earlier
  mirror.reset();

  const excludeAttribute = _excludeAttribute === undefined
    ? /.^/
    : _excludeAttribute;

  const maskInputOptions: MaskInputOptions =
    maskAllInputs === true
      ? {
          color: true,
          date: true,
          'datetime-local': true,
          email: true,
          month: true,
          number: true,
          range: true,
          search: true,
          tel: true,
          text: true,
          time: true,
          url: true,
          week: true,
          textarea: true,
          select: true,
          password: true,
        }
      : _maskInputOptions !== undefined
      ? _maskInputOptions
      : { password: true };

  const slimDOMOptions: SlimDOMOptions =
    _slimDOMOptions === true || _slimDOMOptions === 'all'
      ? {
          script: true,
          comment: true,
          headFavicon: true,
          headWhitespace: true,
          headMetaSocial: true,
          headMetaRobots: true,
          headMetaHttpEquiv: true,
          headMetaVerification: true,
          // the following are off for slimDOMOptions === true,
          // as they destroy some (hidden) info:
          headMetaAuthorship: _slimDOMOptions === 'all',
          headMetaDescKeywords: _slimDOMOptions === 'all',
          headTitleMutations: _slimDOMOptions === 'all',
        }
      : _slimDOMOptions
      ? _slimDOMOptions
      : {};

  const selectorOptions = normalizeSelectorOptions(selector);

  polyfill();

  let lastFullSnapshotEvent: eventWithTime;
  let incrementalSnapshotCount = 0;
  let visibilityMutationCount = 0;
  let checkoutId = 0;
  let checkoutPending = false;
  let checkoutDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let checkoutFreezeTimestamp: number | null = null;
  let lastScrollEmitTime = 0;
  const scrollSettleTime = (sampling.scroll || 100) * 2;
  let lastSignificantMutationTime = 0;
  const mutationGracePeriod = 500;
  let hadVisibilityCheckoutInGrace = false;

  const eventProcessor = (e: eventWithTime): T => {
    for (const plugin of plugins || []) {
      if (plugin.eventProcessor) {
        e = plugin.eventProcessor(e);
      }
    }
    if (
      packFn &&
      // Disable packing events which will be emitted to parent frames.
      !passEmitsToParent
    ) {
      e = packFn(e) as unknown as eventWithTime;
    }
    return e as unknown as T;
  };

  const executeCheckout = () => {
    checkoutDebounceTimer = null;
    checkoutPending = false;
    checkoutFreezeTimestamp = null;
    // Cancel pending navigation settling — threshold snapshot supersedes it
    navigationManager?.cancelPending();
    takeFullSnapshot(true);
    // Clear frozen state. Do NOT call unfreeze() — it would emit stale data.
    // Instead: clear buffers and set frozen=false directly.
    mutationBuffers.forEach((buf) => {
      buf.resetBuffers();
      buf.unsetFrozen();
    });
    if (visibilityManager) {
      visibilityManager.unsetFrozen();
    }
    if (navigationManager) {
      navigationManager.unsetFrozen();
    }
  };

  wrappedEmit = (r: eventWithoutTime, isCheckout?: boolean) => {
    const e = r as eventWithTime;
    e.timestamp = nowTimestamp();
    e.checkoutId = checkoutId;

    if (
      mutationBuffers[0]?.isFrozen() &&
      !checkoutPending &&
      e.type !== EventType.FullSnapshot &&
      !(
        e.type === EventType.IncrementalSnapshot &&
        e.data.source === IncrementalSource.Mutation
      )
    ) {
      // we've got a user initiated event so first we need to apply
      // all DOM changes that have been buffering during paused state
      mutationBuffers.forEach((buf) => buf.unfreeze());
      visibilityManager?.unfreeze();
      navigationManager?.unfreeze();
    }

    if (inEmittingFrame) {
      emit?.(eventProcessor(e), isCheckout);
    } else if (passEmitsToParent) {
      const message: CrossOriginIframeMessageEventContent<T> = {
        type: 'rrweb',
        event: eventProcessor(e),
        isCheckout,
      };
      window.parent.postMessage(message, '*');
    }

    if (e.type === EventType.FullSnapshot) {
      lastFullSnapshotEvent = e;
      incrementalSnapshotCount = 0;
      visibilityMutationCount = 0;
    } else if (e.type === EventType.IncrementalSnapshot) {
      // attach iframe should be considered as full snapshot
      if (
        e.data.source === IncrementalSource.Mutation &&
        e.data.isAttachIframe
      ) {
        return;
      }
      // visibility mutations do not contribute to incremental snapshot checkout threshold
      if (e.data.source !== IncrementalSource.Visibility) {
        incrementalSnapshotCount++;
        const exceedCount =
          checkoutEveryNth && incrementalSnapshotCount >= checkoutEveryNth;
        const exceedTime =
          checkoutEveryNms &&
          e.timestamp - lastFullSnapshotEvent.timestamp > checkoutEveryNms;

        if (exceedCount || exceedTime) {
          if (checkoutDebounce) {
            // Freeze + Debounce path
            if (!checkoutPending) {
              checkoutPending = true;
              checkoutFreezeTimestamp = nowTimestamp();
              mutationBuffers.forEach((buf) => buf.freeze());
              visibilityManager?.freeze();
            }
            // Reset debounce timer on each new event
            if (checkoutDebounceTimer) {
              clearTimeout(checkoutDebounceTimer);
            }
            // Emergency threshold: force checkout if frozen too long
            const frozenDuration = nowTimestamp() - checkoutFreezeTimestamp!;
            const maxFreeze = checkoutDebounce * 3;

            if (frozenDuration >= maxFreeze) {
              executeCheckout();
            } else {
              checkoutDebounceTimer = setTimeout(
                () => executeCheckout(),
                checkoutDebounce,
              );
            }
          } else {
            // Current behavior: immediate checkout
            takeFullSnapshot(true);
          }
        }
      }
    }
  };

  const wrappedMutationEmit = (m: mutationCallbackParam) => {
    const totalChanges = (m.adds?.length ?? 0) + (m.removes?.length ?? 0);
    if (totalChanges > 10) {
      lastSignificantMutationTime = nowTimestamp();
      hadVisibilityCheckoutInGrace = false;
    }
    wrappedEmit({
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        ...m,
      },
    });
  };

  const wrappedVisibilityEmit = (v: visibilityCallbackParam) => {
    wrappedEmit({
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Visibility,
        ...v,
      },
    });
  };

  const wrappedScrollEmit: scrollCallback = (p) => {
    lastScrollEmitTime = nowTimestamp();
    wrappedEmit({
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Scroll,
        ...p,
      },
    });
  };
  const wrappedCanvasMutationEmit = (p: canvasMutationParam) =>
    wrappedEmit({
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.CanvasMutation,
        ...p,
      },
    });

  const wrappedAdoptedStyleSheetEmit = (a: adoptedStyleSheetParam) =>
    wrappedEmit({
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.AdoptedStyleSheet,
        ...a,
      },
    });

  const stylesheetManager = new StylesheetManager({
    mutationCb: wrappedMutationEmit,
    adoptedStyleSheetCb: wrappedAdoptedStyleSheetEmit,
  });

  const iframeManager = new IframeManager({
    mirror,
    mutationCb: wrappedMutationEmit,
    stylesheetManager: stylesheetManager,
    recordCrossOriginIframes,
    wrappedEmit,
  });

  /**
   * Exposes mirror to the plugins
   */
  for (const plugin of plugins || []) {
    if (plugin.getMirror)
      plugin.getMirror({
        nodeMirror: mirror,
        crossOriginIframeMirror: iframeManager.crossOriginIframeMirror,
        crossOriginIframeStyleMirror:
          iframeManager.crossOriginIframeStyleMirror,
      });
  }

  const processedNodeManager = new ProcessedNodeManager();

  canvasManager = new CanvasManager({
    recordCanvas,
    mutationCb: wrappedCanvasMutationEmit,
    win: window,
    blockClass,
    blockSelector,
    mirror,
    sampling: sampling.canvas,
    dataURLOptions,
  });

  const shadowDomManager = new ShadowDomManager({
    mutationCb: wrappedMutationEmit,
    scrollCb: wrappedScrollEmit,
    bypassOptions: {
      blockClass,
      blockSelector,
      maskTextClass,
      maskTextSelector,
      excludeAttribute,
      inlineStylesheet,
      maskInputOptions,
      dataURLOptions,
      maskTextFn,
      maskInputFn,
      recordCanvas,
      inlineImages,
      sampling,
      slimDOMOptions,
      iframeManager,
      stylesheetManager,
      canvasManager,
      keepIframeSrcFn,
      processedNodeManager,
      selectorOptions,
    },
    mirror,
  });

  const needVisibilityObserver =
    recordDOM &&
    (checkoutEveryNvm != null ||
      (sampling?.visibility !== undefined && sampling?.visibility !== false));

  let visibilityManager: VisibilityManager | undefined;
  if (needVisibilityObserver) {
    const visibilitySampling =
      typeof sampling?.visibility === 'object' && sampling?.visibility !== null
        ? sampling.visibility
        : {};
    const recordVisibility = visibilitySampling.recordVisibility === true;
    visibilityManager = new VisibilityManager({
      doc: document,
      mirror,
      sampling: visibilitySampling,
      mutationCb: recordVisibility ? wrappedVisibilityEmit : () => {},
      notifyActivity:
        checkoutEveryNvm != null
          ? (count) => {
              const now = nowTimestamp();
              const scrollRecent = now - lastScrollEmitTime < scrollSettleTime;
              const mutationRecent = now - lastSignificantMutationTime < mutationGracePeriod;
              if (scrollRecent && !mutationRecent) {
                return;
              }
              if (mutationRecent && hadVisibilityCheckoutInGrace) {
                return;
              }
              visibilityMutationCount += count;
              if (visibilityMutationCount >= checkoutEveryNvm!) {
                visibilityMutationCount = 0;
                hadVisibilityCheckoutInGrace = true;
                if (checkoutDebounce) {
                  if (!checkoutPending) {
                    checkoutPending = true;
                    checkoutFreezeTimestamp = nowTimestamp();
                    mutationBuffers.forEach((buf) => buf.freeze());
                    visibilityManager?.freeze();
                  }
                  if (checkoutDebounceTimer) {
                    clearTimeout(checkoutDebounceTimer);
                  }
                  const frozenDuration = nowTimestamp() - checkoutFreezeTimestamp!;
                  const maxFreeze = checkoutDebounce * 3;
                  if (frozenDuration >= maxFreeze) {
                    executeCheckout();
                  } else {
                    checkoutDebounceTimer = setTimeout(
                      () => executeCheckout(),
                      checkoutDebounce,
                    );
                  }
                } else {
                  takeFullSnapshot(true);
                }
              }
            }
          : undefined,
    });
  }

  takeFullSnapshot = (isCheckout = false) => {
    if (!recordDOM) {
      return;
    }
    checkoutId++;
    wrappedEmit(
      {
        type: EventType.Meta,
        data: {
          href: window.location.href,
          width: getWindowWidth(),
          height: getWindowHeight(),
        },
      },
      isCheckout,
    );

    // When we take a full snapshot, old tracked StyleSheets need to be removed.
    stylesheetManager.reset();

    shadowDomManager.init();

    mutationBuffers.forEach((buf) => buf.lock()); // don't allow any mirror modifications during snapshotting
    visibilityManager?.lock();
    navigationManager?.lock();
    const node = snapshot(document, {
      mirror,
      blockClass,
      blockSelector,
      maskTextClass,
      maskTextSelector,
      excludeAttribute,
      inlineStylesheet,
      maskAllInputs: maskInputOptions,
      maskTextFn,
      maskInputFn,
      slimDOM: slimDOMOptions,
      dataURLOptions,
      recordCanvas,
      inlineImages,
      onSerialize: (n) => {
        if (isSerializedIframe(n, mirror)) {
          iframeManager.addIframe(n as HTMLIFrameElement);
        }
        if (isSerializedStylesheet(n, mirror)) {
          stylesheetManager.trackLinkElement(n as HTMLLinkElement);
        }
        if (hasShadowRoot(n)) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          shadowDomManager.addShadowRoot(dom.shadowRoot(n as Node)!, document);
        }
      },
      onIframeLoad: (iframe, childSn) => {
        iframeManager.attachIframe(iframe, childSn);
        shadowDomManager.observeAttachShadow(iframe);
      },
      onStylesheetLoad: (linkEl, childSn) => {
        stylesheetManager.attachLinkElement(linkEl, childSn);
      },
      keepIframeSrcFn,
      selector,
    });

    if (!node) {
      return console.warn('Failed to snapshot the document');
    }

    wrappedEmit(
      {
        type: EventType.FullSnapshot,
        data: {
          node,
          initialOffset: getWindowScroll(window),
        },
      },
      isCheckout,
    );
    mutationBuffers.forEach((buf) => buf.unlock()); // generate & emit any mutations that happened during snapshotting, as can now apply against the newly built mirror
    visibilityManager?.unlock();
    navigationManager?.unlock();

    // Some old browsers don't support adoptedStyleSheets.
    if (document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0)
      stylesheetManager.adoptStyleSheets(
        document.adoptedStyleSheets,
        mirror.getId(document),
      );
  };

  flushCustomEventQueue = () => {
    for (const e of customEventQueue) {
      wrappedEmit(e);
    }
    customEventQueue.length = 0;
  }

  let navigationManager: NavigationManager | undefined;
  const navigationSampling = sampling.navigation;
  if (navigationSampling !== false) {
    const navConfig = typeof navigationSampling === 'object' ? navigationSampling : {};
    navigationManager = new NavigationManager({
      doc: document,
      config: navConfig,
      onSnapshot: (isCheckout) => {
        // Cancel any pending threshold checkout to prevent duplicate snapshots
        if (checkoutPending) {
          if (checkoutDebounceTimer) {
            clearTimeout(checkoutDebounceTimer);
            checkoutDebounceTimer = null;
          }
          checkoutPending = false;
          checkoutFreezeTimestamp = null;
          // Unfreeze mutation buffers frozen by checkout debounce
          mutationBuffers.forEach((buf) => {
            buf.resetBuffers();
            buf.unsetFrozen();
          });
          visibilityManager?.unsetFrozen();
        }
        takeFullSnapshot(isCheckout);
      },
    });
  }

  try {
    const handlers: listenerHandler[] = [];

    const observe = (doc: Document) => {
      return callbackWrapper(initObservers)(
        {
          mutationCb: wrappedMutationEmit,
          mousemoveCb: (positions, source) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source,
                positions,
              },
            }),
          mouseInteractionCb: (d) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.MouseInteraction,
                ...d,
              },
            }),
          scrollCb: wrappedScrollEmit,
          viewportResizeCb: (d) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.ViewportResize,
                ...d,
              },
            }),
          navigationCb: (navData) => {
            if (navigationManager) {
              navigationManager.handleNavigation(navData);
            } else {
              takeFullSnapshot(true);
            }
          },
          inputCb: (v) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.Input,
                ...v,
              },
            }),
          mediaInteractionCb: (p) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.MediaInteraction,
                ...p,
              },
            }),
          styleSheetRuleCb: (r) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.StyleSheetRule,
                ...r,
              },
            }),
          styleDeclarationCb: (r) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.StyleDeclaration,
                ...r,
              },
            }),
          canvasMutationCb: wrappedCanvasMutationEmit,
          visibilityManager,
          fontCb: (p) =>
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.Font,
                ...p,
              },
            }),
          selectionCb: (p) => {
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.Selection,
                ...p,
              },
            });
          },
          customElementCb: (c) => {
            wrappedEmit({
              type: EventType.IncrementalSnapshot,
              data: {
                source: IncrementalSource.CustomElement,
                ...c,
              },
            });
          },
          blockClass,
          ignoreClass,
          ignoreSelector,
          maskTextClass,
          maskTextSelector,
          excludeAttribute,
          maskInputOptions,
          inlineStylesheet,
          sampling,
          recordDOM,
          recordCanvas,
          inlineImages,
          userTriggeredOnInput,
          trustSyntheticInput,
          collectFonts,
          doc,
          maskInputFn,
          maskTextFn,
          keepIframeSrcFn,
          blockSelector,
          slimDOMOptions,
          dataURLOptions,
          selectorOptions,
          mirror,
          iframeManager,
          stylesheetManager,
          shadowDomManager,
          processedNodeManager,
          canvasManager,
          ignoreCSSAttributes,
          plugins:
            plugins
              ?.filter((p) => p.observer)
              ?.map((p) => ({
                observer: p.observer!,
                options: p.options,
                callback: (payload: object) =>
                  wrappedEmit({
                    type: EventType.Plugin,
                    data: {
                      plugin: p.name,
                      payload,
                    },
                  }),
              })) || [],
        },
        hooks,
      );
    };

    iframeManager.addLoadListener((iframeEl) => {
      try {
        handlers.push(observe(iframeEl.contentDocument!));
      } catch (error) {
        // TODO: handle internal error
        console.warn(error);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
    // @ts-ignore
    const init = () => {
      if (flushCustomEvent === 'before') {
        flushCustomEventQueue();
      }

      takeFullSnapshot();
      handlers.push(observe(document));
      recording = true;

      if (flushCustomEvent === 'after') {
        flushCustomEventQueue();
      }
    };

    if (
      document.readyState === 'interactive' ||
      document.readyState === 'complete'
    ) {
      init();
    } else {
      handlers.push(
        on('DOMContentLoaded', () => {
          wrappedEmit({
            type: EventType.DomContentLoaded,
            data: {},
          });
          if (recordAfter === 'DOMContentLoaded') init();
        }),
      );
      handlers.push(
        on(
          'load',
          () => {
            wrappedEmit({
              type: EventType.Load,
              data: {},
            });
            if (recordAfter === 'load') init();
          },
          window,
        ),
      );
    }
    return () => {
      // Flush active input value before tearing down observers.
      // Read the value directly and emit via wrappedEmit instead of
      // dispatching a synthetic event (which has isTrusted: false and
      // could be rejected by phantom filters).
      if (recording) {
        const activeEl = document.activeElement;
        if (activeEl && INPUT_TAGS.includes(activeEl.tagName)) {
          const inputEl = activeEl as HTMLInputElement;
          const id = mirror.getId(inputEl);
          if (id !== -1) {
            const lastValue = lastInputValueMap.get(inputEl);
            let text = inputEl.value;
            let isChecked = false;
            const type: Lowercase<string> = getInputType(inputEl) || '';

            if (type === 'radio' || type === 'checkbox') {
              isChecked = inputEl.checked;
            } else if (
              maskInputOptions[inputEl.tagName.toLowerCase() as keyof MaskInputOptions] ||
              maskInputOptions[type as keyof MaskInputOptions]
            ) {
              text = maskInputValue({
                element: inputEl,
                maskInputOptions,
                tagName: inputEl.tagName,
                type,
                value: text,
                maskInputFn,
              });
            }

            if (
              !lastValue ||
              lastValue.text !== text ||
              lastValue.isChecked !== isChecked
            ) {
              const inputData = userTriggeredOnInput
                ? { text, isChecked, userTriggered: false }
                : { text, isChecked };
              lastInputValueMap.set(inputEl, inputData);
              wrappedEmit({
                type: EventType.IncrementalSnapshot,
                data: {
                  source: IncrementalSource.Input,
                  ...inputData,
                  id,
                },
              });
            }
          }
        }
      }
      if (checkoutDebounceTimer) {
        clearTimeout(checkoutDebounceTimer);
        checkoutDebounceTimer = null;
      }
      flushCustomEventQueue();
      handlers.forEach((h) => h());
      navigationManager?.destroy();
      processedNodeManager.destroy();
      recording = false;
      unregisterErrorHandler();
    };
  } catch (error) {
    // TODO: handle internal error
    console.warn(error);
  }
}

record.getVersion = () => version;

record.isRecording = () => recording;

record.flushCustomEventQueue = () => {
  console.warn(`[rrweb] CustomEvent flushing: ${customEventQueue.length} events`);
  flushCustomEventQueue();
}

record.addCustomEvent = <T>(tag: string, payload: T) => {
  const customEvent: eventWithoutTime = {
    type: EventType.Custom,
    data: {
      tag,
      payload,
    },
  };

  if (!recording) {
    console.warn(`[rrweb] CustomEvent buffered before/after recording start: ${tag}`);
    customEventQueue.push(customEvent);
    return;
  }

  wrappedEmit(customEvent);
};

record.freezePage = () => {
  mutationBuffers.forEach((buf) => buf.freeze());
};

record.takeFullSnapshot = (isCheckout?: boolean) => {
  if (!recording) {
    throw new Error('please take full snapshot after start recording');
  }
  takeFullSnapshot(isCheckout);
};

record.mirror = mirror;

export default record;
