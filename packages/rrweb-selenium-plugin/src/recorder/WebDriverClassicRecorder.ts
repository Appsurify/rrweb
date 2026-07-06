import type {
  recordOptions,
  eventWithTime,
  customEventPayload,
  RecorderWindow,
} from '../core/types';
import {
  AbstractRecorder,
  NAVIGATION_CUSTOM_EVENT_TAG,
} from '../core/AbstractRecorder';
import type {
  W3CWindow,
  WebDriver,
  WebDriverIOLike,
  BindableTarget,
} from './types';

// Inlined at build time by the esbuild text loader (see tsup.config.ts) and
// stubbed to an empty string under Vitest (see vitest.config.ts).
import rrwebUmdSrc from './releases/rrweb-record.umd.cjs.src';
import seqPluginUmdSrc from './releases/rrweb-plugin-sequential-id-record.umd.cjs.src';

// The rrweb library version baked into this plugin. Injected at build time by
// tsup `define` (the monorepo releases in lockstep, so the plugin version equals
// the rrweb version); falls back to a dev marker under Vitest. We deliberately do
// NOT `import { version } from '@appsurify-testmap/rrweb'` — that package is
// DOM-coupled and this recorder runs in Node, where evaluating it throws.
const LIB_VERSION: string = process.env.RRWEB_SELENIUM_LIB_VERSION || '0.0.0-dev';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isWdioLike(x: any): x is WebDriverIOLike {
  return !!x && typeof x.execute === 'function' && typeof x.executeAsync === 'function';
}

/**
 * Adapts a WebdriverIO `Browser` to the standard `WebDriver` surface.
 * @remarks
 * WebdriverIO uses `execute`/`executeAsync` (with `this` binding) rather than
 * `executeScript`/`executeAsyncScript`; this normalizes the difference.
 */
class WebdriverIOAdapter implements WebDriver {
  constructor(private target: WebDriverIOLike) {}

  static wrap(target: BindableTarget): WebDriver {
    return isWdioLike(target) ? new WebdriverIOAdapter(target) : (target as WebDriver);
  }

  executeScript<T = unknown>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    script: string | ((...args: any[]) => T),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<T> {
    return this.target.execute(script, ...args);
  }

  executeAsyncScript<T = unknown>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    script: string | ((...args: any[]) => void),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<T> {
    return this.target.executeAsync(script, ...args);
  }
}

/**
 * Recorder for the classic W3C WebDriver protocol (Selenium v4 et al.).
 * @public
 * @remarks
 * The classic protocol exposes no browser→Node push channel, so this recorder
 * bridges events with a polling pump: rrweb buffers events into
 * `window.__testmap_events` in the page, and Node `executeScript`s on an interval
 * to atomically swap-and-drain that buffer. `stop()` drains twice so trailing
 * events emitted during the final drain are not lost.
 *
 * It also injects the sequential-id record plugin so every event carries an `id`,
 * matching the Playwright and Cypress plugins.
 *
 * @example
 * ```typescript
 * const driver = await new Builder().forBrowser('chrome').build();
 * const recorder = new WebDriverClassicRecorder();
 * await recorder.bind(driver);
 * await driver.get('https://example.com');
 * await recorder.inject();
 * await recorder.start();
 * // ... test actions ...
 * await recorder.stop();
 * ```
 */
export class WebDriverClassicRecorder extends AbstractRecorder<
  WebDriver,
  string, // record-fn signature (stringified, for readiness validation)
  string // stop-fn signature (stringified)
> {
  private readonly _seqPluginUmdSource: string;
  private _scriptVersion = 'unknown';

  private _pollingInterval: ReturnType<typeof setInterval> | null = null;
  private _pollingIntervalMs = 100;
  private _inFlightPoll: Promise<void> | null = null;
  /** Last known document URL, refreshed once per poll (avoids per-event reads). */
  private _cachedHref = '';
  /** Guards the self-heal re-injection so overlapping drains don't double-inject. */
  private _healing = false;

  constructor(config?: {
    recordOptions?: recordOptions<eventWithTime>;
    rrwebUmdSource?: string;
    seqPluginUmdSource?: string;
  }) {
    super({
      recordOptions: config?.recordOptions,
      rrwebUmdSource: config?.rrwebUmdSource ?? rrwebUmdSrc,
    });
    this._seqPluginUmdSource = config?.seqPluginUmdSource ?? seqPluginUmdSrc;
  }

  // ============================================
  // VERSIONS
  // ============================================

  /** rrweb-record version reported by the injected bundle. */
  public getScriptVersion(): string {
    return `@appsurify-testmap/rrweb-record:${this._scriptVersion}`;
  }

  /** rrweb library version this plugin was built against. */
  public getLibVersion(): string {
    return `@appsurify-testmap/rrweb:${LIB_VERSION}`;
  }

  // ============================================
  // LIFECYCLE HOOKS
  // ============================================

  protected async onBeforeStop(): Promise<void> {
    this._stopPolling();
  }

  public override async bind(target: WebDriver): Promise<void>;
  public override async bind<This>(target: WebDriverIOLike<This>): Promise<void>;
  public override async bind(target: BindableTarget): Promise<void> {
    await super.bind(WebdriverIOAdapter.wrap(target));
  }

  // ============================================
  // ABSTRACT IMPLEMENTATIONS
  // ============================================

  protected async invokeInjectFn(umdSource: string): Promise<void> {
    const isInjected = await this._target?.executeScript(function () {
      const win = window as unknown as RecorderWindow;
      return !!win.rrweb?.record;
    });

    if (isInjected) {
      this._recordFn = await this._target?.executeScript(function () {
        const win = window as unknown as W3CWindow;
        return win.__testmap_recordFn?.toString();
      });
      await this._captureScriptVersion();
      return;
    }

    // Use <script> elements so the UMD bundles run in true global scope and
    // assign `window.rrweb` / `window.rrwebPluginSequentialIdRecord`. Executing
    // via `new Function(src)()` leaves the UMD's global write targeting the wrong
    // binding in some engines, so the library never attaches.
    const injectionScript = function (rrwebSrc: string, seqSrc: string) {
      const win = window as unknown as W3CWindow;
      const append = function (src: string) {
        if (!src) return;
        const el = win.document.createElement('script');
        el.type = 'text/javascript';
        el.text = src;
        win.document.head.appendChild(el);
      };
      append(rrwebSrc); // rrweb first — the plugin depends on it
      append(seqSrc);
      win.__testmap_recordFn = win.rrweb?.record;
      win.__testmap_events = [];
    };

    await this._target?.executeScript(
      injectionScript,
      umdSource,
      this._seqPluginUmdSource,
    );

    this._recordFn = await this._target?.executeScript(function () {
      const win = window as unknown as W3CWindow;
      return win.__testmap_recordFn?.toString();
    });
    await this._captureScriptVersion();
  }

  protected async invokeRecordFn(
    options: recordOptions<eventWithTime>,
  ): Promise<void> {
    // Serialize options with RegExp support.
    const optionsJson = JSON.stringify(options, (_key, value) => {
      if (value instanceof RegExp) {
        return { __type: 'RegExp', source: value.source, flags: value.flags };
      }
      return value;
    });

    const startCode = function (optsJson: string) {
      const win = window as unknown as W3CWindow;

      const opts = JSON.parse(optsJson, function (_key, value) {
        if (value && value.__type === 'RegExp') {
          return new RegExp(value.source, value.flags);
        }
        return value;
      });

      // Build the plugins list in-page so the sequential-id counter lives in the
      // browser. Guarded so recording still works if the plugin failed to load.
      const plugins: unknown[] = [];
      const seq = win.rrwebPluginSequentialIdRecord;
      if (seq && typeof seq.getRecordSequentialIdPlugin === 'function') {
        plugins.push(seq.getRecordSequentialIdPlugin({ key: 'id' }));
      }

      // NOTE: use Object.assign, not object spread — this function is stringified
      // and run in the page, and a bundler lowering `{...opts}` to a
      // `__spreadValues` helper would throw a ReferenceError there.
      win.__testmap_stopFn = win.__testmap_recordFn?.(
        Object.assign(
          {
            emit: function (event: eventWithTime, isCheckout?: boolean) {
              win.__testmap_events.push({ event: event, isCheckout: isCheckout });
            },
            plugins: plugins,
          },
          opts,
        ),
      );

      return win.__testmap_stopFn ? win.__testmap_stopFn.toString() : undefined;
    };

    this._stopFn = await this._target?.executeScript(startCode, optionsJson);
    this._startPolling();
    // Drain the initial META + FullSnapshot immediately so a fast un-wrapped
    // navigation (e.g. a link click) cannot lose the page snapshot before the
    // first periodic poll fires. Uses _drainOnce (not _doPoll) to avoid awaiting
    // the in-flight poll when invoked from the self-heal path.
    await this._drainOnce();
  }

  protected async invokeStopFn(): Promise<void> {
    if (!this._stopFn) return;

    try {
      // Drain the in-flight poll, then a fresh drain to capture events emitted
      // during it, before stopping rrweb in the page.
      await this._doPoll();
      await this._doPoll();

      await this._target?.executeScript(function () {
        const win = window as unknown as W3CWindow;
        try {
          if (typeof win.__testmap_stopFn === 'function') {
            win.__testmap_stopFn();
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[testmap] Error stopping rrweb:', error);
        }
      });
    } catch (error) {
      this.onError(error as Error, { method: 'invokeStopFn' });
    } finally {
      this._stopPolling();
      this._stopFn = null;
    }
  }

  protected async invokeAddEventFn(
    tag: string,
    payload: customEventPayload,
  ): Promise<void> {
    try {
      await this._target?.executeScript(
        function (eventTag: string, eventPayload: customEventPayload) {
          const win = window as unknown as W3CWindow;
          win.__testmap_recordFn?.addCustomEvent(eventTag, eventPayload);
        },
        tag,
        payload,
      );
    } catch (error) {
      this.onError(error as Error, { method: 'invokeAddEventFn', tag, payload });
      throw error;
    }
  }

  // ============================================
  // STATUS CHECKS
  // ============================================

  public async isReady(): Promise<boolean> {
    if (!this._target || !this._recordFn) return false;
    try {
      const ready = await this._target.executeScript(function () {
        const win = window as unknown as W3CWindow;
        return !!win.__testmap_recordFn && typeof win.__testmap_recordFn === 'function';
      });
      return !!ready;
    } catch {
      return false;
    }
  }

  public async isRecording(): Promise<boolean> {
    if (!this._target || !this._recordFn) return false;
    try {
      const recording = await this._target.executeScript(function () {
        const win = window as unknown as W3CWindow;
        return typeof win.__testmap_recordFn?.isRecording === 'function'
          ? win.__testmap_recordFn.isRecording()
          : false;
      });
      return !!recording;
    } catch {
      return false;
    }
  }

  public async getHref(): Promise<string> {
    if (this._cachedHref) return this._cachedHref;
    this._cachedHref = await this._readHref();
    return this._cachedHref;
  }

  private async _readHref(): Promise<string> {
    if (!this._target) return '';
    try {
      const href = await this._target.executeScript<string>(function () {
        return window.location.href;
      });
      return typeof href === 'string' ? href : '';
    } catch {
      return '';
    }
  }

  private async _captureScriptVersion(): Promise<void> {
    try {
      const v = await this._target?.executeScript(function () {
        const win = window as unknown as W3CWindow;
        return typeof win.__testmap_recordFn?.getVersion === 'function'
          ? win.__testmap_recordFn.getVersion()
          : '';
      });
      if (typeof v === 'string' && v) this._scriptVersion = v;
    } catch {
      // best-effort
    }
  }

  // ============================================
  // POLLING PUMP
  // ============================================

  private _startPolling(): void {
    if (this._pollingInterval) return;
    this._pollingInterval = setInterval(() => {
      void this._doPoll();
    }, this._pollingIntervalMs);
  }

  private _stopPolling(): void {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }

  /** Coalesces concurrent polls: callers await the same in-flight drain. */
  private _doPoll(): Promise<void> {
    if (this._inFlightPoll) return this._inFlightPoll;
    if (!this._target) return Promise.resolve();
    const run = this._drainOnce().finally(() => {
      this._inFlightPoll = null;
    });
    this._inFlightPoll = run;
    return run;
  }

  private async _drainOnce(): Promise<void> {
    if (!this._target) return;
    try {
      // Atomic swap: read the buffer and clear it in one round-trip, piggybacking
      // the document URL (so getHref() can be served from cache) and whether the
      // recorder is still present on the page (false ⇒ a navigation we did not
      // wrap, e.g. a link click, replaced the document).
      const result = await this._target.executeScript<{
        events: Array<{ event: eventWithTime; isCheckout?: boolean }>;
        href: string;
        present: boolean;
      }>(function () {
        const win = window as unknown as W3CWindow;
        const buffer = win.__testmap_events || [];
        win.__testmap_events = [];
        return {
          events: buffer,
          href: window.location.href,
          present: !!win.__testmap_recordFn,
        };
      });

      if (result && typeof result.href === 'string') {
        this._cachedHref = result.href;
      }

      const newEvents = result?.events;
      if (newEvents && Array.isArray(newEvents) && newEvents.length > 0) {
        for (const item of newEvents) {
          try {
            await this.handleEvent(item.event, item.isCheckout);
          } catch (error) {
            this.onError(error as Error, { method: '_doPoll', event: item });
          }
        }
      }

      // Self-heal: a full-page navigation NOT routed through driver.get/navigate
      // (e.g. clicking an <a href>) destroys the page and its rrweb instance.
      // aroundNavigation never fired, so re-inject + restart here to capture the
      // new page. (SPA route changes keep the same document, so rrweb is still
      // present — present stays true and its NavigationManager handles them.)
      if (this._status === 'recording' && result && result.present === false && !this._healing) {
        await this._reestablish();
      }
    } catch (error) {
      this.onError(error as Error, {
        method: '_doPoll',
        message: 'Polling error - will retry',
      });
    }
  }

  /**
   * Re-injects rrweb on a page that replaced the previous document (via an
   * un-wrapped navigation) and resumes recording, so the destination page is
   * still captured. The previous page's not-yet-drained tail events are
   * unrecoverable (they died with that document) — a known limit of the polling
   * bridge — but the new page is captured fresh (META + FullSnapshot).
   */
  private async _reestablish(): Promise<void> {
    this._healing = true;
    // The buffer now spans more than the test-begin head (a new page's
    // segment follows), so the eager-head marker must not survive — a later
    // wrapped navigation would otherwise discard both segments.
    this._bufferIsEagerHead = false;
    try {
      await this.invokeInjectFn(this._rrwebUmdSource);
      await this.invokeRecordFn(this._recordOptions);
      await this.addCustomEvent(NAVIGATION_CUSTOM_EVENT_TAG, {
        type: 'auto',
        url: this._cachedHref,
      });
    } catch (error) {
      this.onError(error as Error, { method: '_reestablish' });
    } finally {
      this._healing = false;
    }
  }
}
