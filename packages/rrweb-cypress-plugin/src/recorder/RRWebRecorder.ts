import type { record, recordOptions } from '@appsurify-testmap/rrweb';
import { version as libVersion, utils } from '@appsurify-testmap/rrweb';
import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';
import { getRecordSequentialIdPlugin } from '@appsurify-testmap/rrweb-plugin-sequential-id-record';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import rrSrc from './releases/rrweb-record.umd.cjs.src';

import type { RecorderContext, RecorderEvent } from './types';
import { eventWithTime } from '@appsurify-testmap/rrweb-types';


interface WindowWithRRWeb extends Window {
  rrweb?: {
    record: typeof record | null;
  };
}

export const defaultRecordOptions: recordOptions<eventWithTime> = {
    slimDOMOptions: 'all',
    inlineStylesheet: true,
    recordDOM: true,
    recordCanvas: true,
    collectFonts: true,
    inlineImages: true,
    checkoutEveryNvm: 60,
    // excludeAttribute: /data-(cy|test(id)?|cypress|highlight-el|cypress-el)/i,
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
    // recordAfter: 'DOMContentStabilized',
    recordAfter: 'DOMContentLoaded',
    userTriggeredOnInput: true,
}

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result[key] = sourceValue as any;
    }
  }

  return result;
}

export class RRWebRecorder {
  private recordFn: typeof record | null = null;
  private stopFn: (() => void) | undefined | null = null;
  private targetWindow: Window | null = null;
  private context: RecorderContext;
  private eventCounter = 0;
  private events: RecorderEvent[] = [];
  private recordOptions?: recordOptions<eventWithTime>;
  private pendingEvents: {
    tag: string;
    payload: Record<string, unknown>;
  }[] = [];
  private recorderScriptVersion = 'unknown';
  private recorderLibVersion = libVersion;

  constructor(options?: recordOptions<eventWithTime>) {
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

  public inject(win: Window) {
    const w = win as WindowWithRRWeb;

    this.targetWindow = win;

    if (w.rrweb) {
      this.recordFn = w.rrweb.record ?? null;
      return;
    }

    const script = win.document.createElement('script');
    script.type = 'text/javascript';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    script.innerHTML = rrSrc;
    win.document.head.appendChild(script);

    const recheck = (win as WindowWithRRWeb).rrweb;
    if (!recheck || !recheck.record) {
      console.error(`[${Date.now()}] [recorder] Failed to load rrweb.record`);
      return;
    }

    this.recordFn = recheck.record;
    // console.debug(`[${Date.now()}] [recorder] Recorder loaded: `, this.recordFn.getVersion());
    this.recorderScriptVersion = this.recordFn.getVersion();
  }

  public start() {
    if (!this.targetWindow || !this.recordFn) {
      console.debug(`[${Date.now()}] [recorder] Not ready to start`);
      return;
    }

    if (this.stopFn) {
      console.debug(`[${Date.now()}] [recorder] Already recording`);
      return;
    }


    this.stopFn = this.recordFn({
      emit: (event: RecorderEvent) => this.handleEmit(event),
      plugins: [
        getRecordSequentialIdPlugin({
          key: 'id',
          getId: () => ++this.eventCounter,
        }),
      ],
      ...this.recordOptions
    });

    this.flush();
  }

  public stop() {
    this.flush();
    this.stopFn?.();
    this.stopFn = null;
  }

  public reset() {
    this.eventCounter = 0;
    this.events = [];
    this.stop();
    this.context = {
      pushEvent: (event) => this.events.push(event),
    };
  }

  public flush() {
    if (!this.recordFn) return;

    const stillPending: typeof this.pendingEvents = [];

    for (const evt of this.pendingEvents) {
      try {
        this.recordFn.addCustomEvent(evt.tag, evt.payload);
      } catch (err) {
        console.debug(`[${Date.now()}] [recorder] flush failed for custom event: ${evt.tag}`);
        stillPending.push(evt);
      }
    }

    this.pendingEvents = stillPending;
  }

  public addCustomEvent(tag: string, payload: Record<string, unknown>) {
    const event = { tag, payload };

    if (!this.recordFn || !this.stopFn) {
      console.debug(`[${Date.now()}] [recorder] queued custom event (recorder not ready): ${tag}`);
      this.pendingEvents.push(event);
      return;
    }

    try {
      this.recordFn.addCustomEvent(tag, payload);
    } catch (error) {
      console.debug(`[${Date.now()}] [recorder] error adding custom event: ${tag}`, error);
      this.pendingEvents.push(event);
    }
  }

  public isRecordingReady(): boolean {
    return !!this.recordFn && !!this.stopFn;
  }

  public isRecording(): boolean {
    return this.recordFn?.isRecording() || false;
  }

  public getScriptVersion(): string {
    return `@appsurify-testmap/rrweb-record:${this.recorderScriptVersion}`;
  }

  public getLibVersion(): string {
    return `@appsurify-testmap/rrweb:${this.recorderLibVersion}`;
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
