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
    inlineStylesheet: true,
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
    this.startPromise = this._start();
    return this.startPromise;
  }

  private async _start() {
    this.recordFn = await this.page?.evaluateHandle(() => {
      return window.rrweb?.record;
    });
    await this.recordFn?.evaluate((r: typeof record, optsJson) => {
      const opts = JSON.parse(optsJson) as recordOptions<RecorderEvent>;
      const plugins = [];
      if (window.rrwebPluginSequentialIdRecord) {
        plugins.push(
          window.rrwebPluginSequentialIdRecord.getRecordSequentialIdPlugin({
            key: 'id',
          })
        )
      }

      window.stopFn = r({
        emit: (event: RecorderEvent) => {
          // console.info(`[${event.timestamp}] [rrweb-recorder] ${event.type} ${event.data?.source} ${event.data?.href}`)
          window.handleEmit?.(event);
        },
        plugins: plugins,
        ...opts,
      })
    }, JSON.stringify(this.recordOptions));

    this.isRecording = await this.recordFn?.evaluate((r: typeof record) => r.isRecording()) as boolean;
    this.recorderScriptVersion = await this.recordFn?.evaluate((r: typeof record) => r.getVersion()) as string;

    await this.flush();
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
