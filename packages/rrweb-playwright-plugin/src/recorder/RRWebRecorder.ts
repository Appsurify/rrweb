import type { recordOptions } from '@appsurify-testmap/rrweb';
import { version as libVersion } from '@appsurify-testmap/rrweb';
import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';
import type { Page, Frame } from '@playwright/test';
import type { RecorderContext, RecorderEvent } from './types';
import { eventWithTime } from '@appsurify-testmap/rrweb-types';

// import rrSrc from './releases/rrweb-record.umd.cjs.src';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rrSrc = readFileSync(join(__dirname, './releases/rrweb-record.umd.cjs.src'), 'utf-8');
const rrPluginSrc = readFileSync(join(__dirname, './releases/rrweb-plugin-sequential-id-record.umd.cjs.src'), 'utf-8');


export const defaultRecordOptions: recordOptions<eventWithTime> = {
// export const defaultRecordOptions = {
    slimDOMOptions: 'all',
    inlineStylesheet: true,
    recordDOM: true,
    recordCanvas: true,
    collectFonts: true,
    inlineImages: true,
    // checkoutEveryNvm: 10,
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
        Focus: true,
        Blur: true,
        TouchStart: false,
        TouchEnd: false,
      },
      scroll: 100,
      media: 100,
      input: 'last',
      canvas: 'all',
      visibility: {
        mode: 'none',
        debounce: 0,
        threshold: 0.5,
        sensitivity: 0.05,
        rafThrottle: 10
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      result[key] = sourceValue as unknown;
    }
  }

  return result;
}

export class RRWebRecorder {
  private recordFn: any = null;
  private page: Page | null = null;
  private context: RecorderContext;
  private eventCounter = 0;
  private events: RecorderEvent[] = [];
  private recordOptions?: any;
  private pendingEvents: {
    tag: string;
    payload: Record<string, unknown>;
  }[] = [];
  private recorderScriptVersion = 'unknown';
  private recorderLibVersion = 'unknown';
  public isRecording: boolean = false;

  constructor(options?: recordOptions<eventWithTime>) {
  // constructor(options?: any) {
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

    this.page?.addInitScript({content: rrSrc});
    this.page?.addInitScript({content: rrPluginSrc});

    await this.page?.exposeFunction('handleEmit', (event: RecorderEvent) => {
      this.handleEmit(event);
    });

  }

  public async start() {
    this.recordFn = await this.page?.evaluateHandle(() => window.rrweb?.record);
    await this.recordFn?.evaluate((record, optsJson) => {
      const opts = JSON.parse(optsJson);
      window.stopFn = record({
        emit: (event) => {
          console.info(`[${event.timestamp}] [rrweb-recorder] ${event.type} ${event.data?.source} ${event.data?.href}`)
          window.handleEmit?.(event);
        },
        plugins: [
          window.rrwebPluginSequentialIdRecord.getRecordSequentialIdPlugin({
            key: 'id',
          })
        ],
        ...opts,
      })
    }, JSON.stringify(this.recordOptions));

    this.isRecording = await this.recordFn?.evaluate(r => r.isRecording());
    this.recorderScriptVersion = await this.recordFn?.evaluate(r => r.getVersion());

    this.flush();
  }

  public async stop() {
    this.isRecording = false;
    if (this.recordFn && this.page && !this.page.isClosed()) {
      await this.flush();
      await this.page.evaluate(() => {
        window.stopFn = null;
      });
    }
  }

  public reset() {
    this.eventCounter = 0;
    this.events = [];
    this.stop();
    this.context = {
      pushEvent: (event) => this.events.push(event),
    };
  }

  public async flush() {
    if (!this.recordFn) return;
    const stillPending: typeof this.pendingEvents = [];
    for (const evt of this.pendingEvents) {
      try {
        await this.recordFn.evaluate((record, evt) => {
          record.addCustomEvent(evt.tag, evt.payload)
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
      await this.recordFn.evaluate((record, evt) => {
        record.addCustomEvent(evt.tag, evt.payload)
      }, event);
    } catch (error) {
      // console.debug(`[${Date.now()}] [recorder] error adding custom event: ${tag}`, error);
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
