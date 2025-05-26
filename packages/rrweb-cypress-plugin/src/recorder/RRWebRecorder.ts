import type { record } from '@appsurify-testmap/rrweb';
import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';

import { getRecordSequentialIdPlugin } from '@appsurify-testmap/rrweb-plugin-sequential-id-record';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import rrSrc from './releases/rrweb-record.umd.cjs.src?raw';

import type { RecorderContext, Recorder, RecorderEvent } from './types';

interface WindowWithRRWeb extends Window {
  rrweb?: {
    record: typeof record | null;
  };
}

export class RRWebRecorder implements Recorder {
  private recordFn: typeof record | null = null;
  private stopFn: (() => void) | undefined | null = null;
  private targetWindow: Window | null = null;
  private context: RecorderContext;
  private eventCounter = 0;
  private events: RecorderEvent[] = [];

  private pendingEvents: {
    tag: string;
    payload: Record<string, unknown>;
  }[] = [];

  constructor() {
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
    script.innerHTML = rrSrc;
    win.document.head.appendChild(script);

    const recheck = (win as WindowWithRRWeb).rrweb;
    if (!recheck || !recheck.record) {
      console.error(`🟡 [rrweb] Failed to load rrweb.record`);
      return;
    }

    this.recordFn = recheck.record;
  }

  public start() {
    if (!this.targetWindow || !this.recordFn) {
      console.warn(`🟡 [rrweb] Not ready to start`);
      return;
    }

    if (this.stopFn) {
      console.warn(`🟡 [rrweb] Already recording`);
      return;
    }

    this.stopFn = this.recordFn({
      emit: (event: RecorderEvent) => this.handleEmit(event),
      checkoutEveryNvm: 10,
      plugins: [
        getRecordSequentialIdPlugin({
          key: 'id',
          getId: () => ++this.eventCounter,
        }),
      ],
      // includeAttribute: /data-(cy|test(id)?|cypress|highlight-el|cypress-el)/i,
      maskInputOptions: { password: true },
      slimDOMOptions: 'all',
      inlineStylesheet: true,
      sampling: {
        mousemove: false,
        mouseInteraction: {
          MouseUp: false,
          MouseDown: false,
          Click: true,
          ContextMenu: true,
          DblClick: true,
          Focus: true,
          Blur: true,
          TouchStart: false,
          TouchEnd: false,
        },
        scroll: 1000,
        media: 1000,
        input: 'last',
        canvas: 'all',
        visibility: {
          mode: 'debounce',
          debounce: 100,
          threshold: 0.5,
          sensitivity: 0.05,
          rafThrottle: 50
        }
      },
      recordDOM: true,
      recordCanvas: true,
      collectFonts: true,
      inlineImages: true,
      flushCustomEvent: 'after',
      recordAfter: 'DOMContentLoaded',
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
        console.warn(`[rrweb] flush failed for custom event: ${evt.tag}`);
        stillPending.push(evt);
      }
    }

    this.pendingEvents = stillPending;
  }

  public addCustomEvent(tag: string, payload: Record<string, unknown>) {
    const event = { tag, payload };

    if (!this.recordFn || !this.stopFn) {
      console.warn(`[rrweb] queued custom event (recorder not ready): ${tag}`);
      this.pendingEvents.push(event);
      return;
    }

    try {
      this.recordFn.addCustomEvent(tag, payload);
    } catch (error) {
      console.warn(`[rrweb] error adding custom event: ${tag}`, error);
      this.pendingEvents.push(event);
    }
  }

  public isRecordingReady(): boolean {
    return !!this.recordFn && !!this.stopFn;
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
