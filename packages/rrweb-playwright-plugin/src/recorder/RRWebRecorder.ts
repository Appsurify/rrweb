import type { recordOptions } from '@appsurify-testmap/rrweb';
import { record } from '@appsurify-testmap/rrweb';
import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';
import type { Page, JSHandle } from '@playwright/test';
import type { RecorderContext, RecorderEvent } from './types';
import type { eventWithTime, RecordPlugin } from '@appsurify-testmap/rrweb-types';
import { deepMerge } from '../utils';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import rrSrc from './releases/rrweb-record.umd.cjs.src';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import rrPluginSrc from './releases/rrweb-plugin-sequential-id-record.umd.cjs.src';


export const defaultRecordOptions: recordOptions<RecorderEvent> = {
    slimDOMOptions: 'all',
    // 'all' also fetches cross-origin stylesheets (CSSOM can't read them) and
    // inlines them as a post-snapshot _cssText mutation — see StylesheetManager.
    inlineStylesheet: 'all',
    recordDOM: true,
    recordCanvas: true,
    collectFonts: true,
    inlineImages: true,
    checkoutEveryNvm: 60,
    maskInputOptions: { password: true },
    sampling: {
      mousemove: false,
      mouseInteraction: {
        MouseUp: false,
        MouseDown: false,
        Click: true,
        ContextMenu: true,
        DblClick: true,
        Focus: false,
        Blur: false,
        TouchStart: false,
        TouchEnd: false,
      },
      scroll: 100,
      media: 100,
      input: 'last',
      canvas: 'all',
      visibility: {
        mode: 'none',
        debounce: 50,
        throttle: 100,
        threshold: 0.5,
        sensitivity: 0.05,
        rafThrottle: 100
      }
    },
    flushCustomEvent: 'after',
    recordAfter: 'DOMContentLoaded',
    userTriggeredOnInput: true,
}

declare global {
  interface Window {
    rrweb?: {
      record?: typeof record;
    },
    stopFn: (() => void) | undefined | null,
    handleEmit: (event: RecorderEvent) => void,
    rrwebPluginSequentialIdRecord?: {
      getRecordSequentialIdPlugin: (options?: Partial<{key: string, getId?: () => number}>) => RecordPlugin;
    }
  }
}

export class RRWebRecorder {
  private recordFn: JSHandle | null | undefined = null;
  private page: Page | null = null;
  private context: RecorderContext;
  private eventCounter = 0;
  private events: RecorderEvent[] = [];
  private recordOptions?: recordOptions<RecorderEvent>;
  private pendingEvents: {
    tag: string;
    payload: Record<string, unknown>;
  }[] = [];
  private recorderScriptVersion = 'unknown';
  private recorderLibVersion = 'unknown';
  // Single chain that serializes every start() attempt (see start()).
  private startPromise: Promise<void> | null = null;
  public isRecording = false;

  constructor(options?: recordOptions<RecorderEvent>) {
    this.recordOptions = deepMerge(defaultRecordOptions, options ?? {});
    this.context = {
      pushEvent: (event) => this.events.push(event),
    };
  }

  private handleEmit(event: RecorderEvent) {
    if (event.type === 0 || event.type === 1) {
      return;
    }
    const rrEvent: RecorderEvent = {
      ...event,
    };
    this.context.pushEvent(rrEvent);
  }

  public async inject(page: Page) {
    this.page = page

    await this.page?.addInitScript({content: rrSrc as string});
    await this.page?.addInitScript({content: rrPluginSrc as string});

    await this.page?.exposeFunction('handleEmit', (event: RecorderEvent) => {
      this.handleEmit(event);
    });

  }

  public async start() {
    // Serialize every start() attempt onto one promise chain so two concurrent
    // callers (the DOMContentLoaded listener and the goBack/goForward wrapper)
    // can never race a double-start. Each attempt still runs _start(), which
    // self-guards in-page via window.stopFn — a redundant call on an
    // already-recording document is a cheap no-op.
    //
    // We deliberately do NOT skip based on a navigation counter. Under worker
    // contention Playwright's `framenavigated` event can lag the actual URL
    // commit, so a counter-based guard would wrongly treat a freshly-committed
    // page as "already started" and drop its snapshot — exactly what made the
    // intermediate page of a click→goBack on a slow site go missing.
    const attempt = (this.startPromise ?? Promise.resolve())
      .catch(() => { /* ignore a prior attempt's failure */ })
      .then(() => this._start());
    this.startPromise = attempt;
    return attempt;
  }

  private async _start() {
    if (!this.page) return;
    try {
      // Atomic start: acquire window.rrweb.record, begin recording, and take
      // the initial FullSnapshot in a SINGLE round-trip. record({...}) captures
      // and emits the snapshot synchronously (via window.handleEmit) before this
      // evaluate resolves. Doing it in one hop — instead of the old
      // evaluateHandle + N follow-up evaluates — closes the window where a fast
      // navigation right after DOMContentLoaded (e.g. page.goBack to a page that
      // just loaded) destroys the execution context mid-startup and loses the
      // snapshot of the page being navigated away from.
      const started = await this.page.evaluate((optsJson) => {
        const r = window.rrweb?.record;
        if (!r) return false;
        // Idempotent per LIVE document: if rrweb is already recording here,
        // do not start a second recorder. window.stopFn persists across
        // same-document (SPA) route changes but is reset on a fresh document.
        // Without this guard, a goBack/goForward on an SPA — where
        // `framenavigated` fires for the client-side route change and bumps
        // the nav token — would re-enter start() and spin up a SECOND rrweb
        // recorder on the same document. That double-records the current
        // route AND corrupts NavigationManager's pending-route state, so the
        // post-goBack destination route is never snapshotted (the page is
        // "lost"). Returning early keeps the single original recorder, whose
        // NavigationManager captures the route change correctly.
        if (window.stopFn) return true;
        const opts = JSON.parse(optsJson) as recordOptions<RecorderEvent>;
        const plugins = [];
        if (window.rrwebPluginSequentialIdRecord) {
          plugins.push(
            window.rrwebPluginSequentialIdRecord.getRecordSequentialIdPlugin({
              key: 'id',
            })
          );
        }
        window.stopFn = r({
          emit: (event: RecorderEvent) => {
            window.handleEmit?.(event);
          },
          plugins,
          ...opts,
        });
        return true;
      }, JSON.stringify(this.recordOptions));

      if (!started) return;
      this.isRecording = true;

      // Non-critical follow-ups. The snapshot is already emitted, so if these
      // throw because the page navigated away, no recorded data is lost — we
      // keep the optimistic state set above.
      this.recordFn = await this.page.evaluateHandle(() => window.rrweb?.record);
      this.recorderScriptVersion = (await this.page.evaluate(
        () => window.rrweb?.record?.getVersion?.() ?? 'unknown'
      )) as string;

      await this.flush();
    } catch {
      // Execution context destroyed before/during the atomic start — the page
      // navigated away before recording could begin. Nothing to capture.
    }
  }

  public async stop() {
    // Wait for any in-flight start() so the queue can be flushed before we
    // tear down. Without this, fast tests can call stop() while start() is
    // still mid-evaluate, leaving queued custom events stranded.
    if (this.startPromise) {
      try { await this.startPromise; } catch { /* ignore */ }
    }
    this.isRecording = false;
    if (this.recordFn && this.page && !this.page.isClosed()) {
      await this.flush();
      // Graceful stop: invoke the function returned by record({...}) so rrweb
      // synchronously flushes active input values, the custom-event queue, and
      // — most importantly — NavigationManager.destroy() which emits any
      // pending post-navigation FullSnapshot. Without this call, the last
      // page state after page.goBack() (or any tail-end navigation) is lost
      // because the recorder is torn down with the snapshot still queued.
      try {
        await this.page.evaluate(() => {
          if (typeof window.stopFn === 'function') {
            try { window.stopFn(); } catch { /* ignore inner errors */ }
          }
          window.stopFn = null;
        });
      } catch { /* page may have navigated/closed mid-eval */ }
    }
  }

  public async reset() {
    this.eventCounter = 0;
    this.events = [];
    await this.stop();
    this.context = {
      pushEvent: (event) => this.events.push(event),
    };
  }

  public async flush() {
    if (!this.recordFn) return;
    const stillPending: typeof this.pendingEvents = [];
    for (const evt of this.pendingEvents) {
      try {
        await this.recordFn.evaluate((r: typeof record, evt) => {
          r.addCustomEvent(evt.tag, evt.payload)
        }, evt);
      } catch (error) {
        console.debug(`[${Date.now()}] [recorder] flush failed for custom event: ${evt.tag}`);
        stillPending.push(evt);
      }
    }
    this.pendingEvents = stillPending;
  }

  public async addCustomEvent(tag: string, payload: Record<string, unknown>) {
    const event = { tag, payload };

    if (!this.recordFn || !this.isRecording) {
      console.debug(`[${Date.now()}] [recorder] queued custom event (recorder not ready): ${tag}`);
      this.pendingEvents.push(event);
      return;
    }

    try {
      await this.recordFn.evaluate((r: typeof record, evt) => {
        r.addCustomEvent(evt.tag, evt.payload)
      }, event);
    } catch (error) {
      this.pendingEvents.push(event);
    }

  }

  public isRecordingReady(): boolean {
    return !!this.recordFn && this.isRecording;
  }

  public getScriptVersion(): string {
    return `@appsurify-testmap/rrweb-record:${this.recorderScriptVersion}`;
  }

  public getLibVersion(): string {
    return `@appsurify-testmap/rrweb:${this.recorderLibVersion !== 'unknown' ? this.recorderLibVersion : this.recorderScriptVersion}`;
  }

  public getEvents(): readonly RecorderEvent[] {
    return this.events;
  }

  public getMirror(): Mirror | undefined {
    return (this.recordFn as unknown as { mirror?: Mirror })?.mirror;
  }

  public bind(ctx: RecorderContext) {
    this.context = ctx;
  }

  public setEventCounter(value: number) {
    this.eventCounter = value;
  }

}
