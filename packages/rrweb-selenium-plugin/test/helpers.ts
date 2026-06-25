/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeleniumDriver, SeleniumNavigation } from '../src/engine/types';

/**
 * A fake `window` whose `document.head.appendChild` simulates the rrweb +
 * sequential-id UMD bundles attaching themselves to the page, and whose fake
 * `rrweb.record` synchronously emits a meta(checkout) + fullsnapshot +
 * incremental sequence into the buffer (mirroring how the real bundle behaves on
 * `start()`), stamping each event with an `id` like the sequential-id plugin.
 */
export interface FakeWindow {
  location: { href: string };
  rrweb?: { record: any };
  rrwebPluginSequentialIdRecord?: { getRecordSequentialIdPlugin: (o?: any) => any };
  __testmap_recordFn?: any;
  __testmap_stopFn?: any;
  __testmap_events: Array<{ event: any; isCheckout?: boolean }>;
  document: {
    createElement: (tag: string) => any;
    head: { appendChild: (el: any) => void };
  };
}

export function makeFakeWindow(href = 'https://example.test/'): FakeWindow {
  let idCounter = 0;

  const makeRecord = () => {
    const record: any = (opts: any) => {
      record._recording = true;
      record._emit = opts.emit;
      // Simulate rrweb emitting an initial replayable sequence on start.
      opts.emit({ type: 4, data: {}, timestamp: 1, id: ++idCounter }, true);
      opts.emit({ type: 2, data: {}, timestamp: 2, id: ++idCounter });
      opts.emit({ type: 3, data: { source: 0 }, timestamp: 3, id: ++idCounter });
      return function stopFn() {
        record._recording = false;
      };
    };
    record.isRecording = () => !!record._recording;
    record.getVersion = () => '9.9.9-test';
    record.addCustomEvent = (tag: string, payload: any) => {
      if (record._emit) {
        record._emit({
          type: 5,
          data: { tag, payload },
          timestamp: 9,
          id: ++idCounter,
        });
      }
    };
    return record;
  };

  const win: FakeWindow = {
    location: { href },
    __testmap_events: [],
    document: {
      createElement: (tag: string) => ({ type: '', text: '', tagName: tag }),
      head: {
        appendChild: () => {
          if (!win.rrweb) win.rrweb = { record: makeRecord() };
          if (!win.rrwebPluginSequentialIdRecord) {
            win.rrwebPluginSequentialIdRecord = {
              getRecordSequentialIdPlugin: () => ({ name: 'seq' }),
            };
          }
        },
      },
    },
  };
  return win;
}

/**
 * A duck-typed Selenium WebDriver whose `executeScript` runs the callback against
 * a {@link FakeWindow} by temporarily installing it as `globalThis.window`. Unit
 * tests pass real recorder callbacks (not stringified), so they execute in their
 * own lexical scope — only the `window` global needs faking.
 */
export class FakeDriver implements SeleniumDriver {
  public readonly win: FakeWindow;
  public navCalls: Array<{ kind: string; arg?: string }> = [];
  public execCount = 0;
  public quitCalled = false;
  private _caps: any;

  constructor(opts?: { href?: string; capabilities?: any }) {
    this.win = makeFakeWindow(opts?.href);
    this._caps = opts?.capabilities;
  }

  async executeScript<T = unknown>(
    script: string | ((...args: any[]) => T),
    ...args: any[]
  ): Promise<T> {
    this.execCount++;
    if (typeof script !== 'function') {
      throw new Error('FakeDriver.executeScript expects a function in tests');
    }
    const g = globalThis as any;
    const prevWindow = g.window;
    const prevDocument = g.document;
    g.window = this.win;
    g.document = this.win.document;
    try {
      return await (script as (...a: any[]) => T)(...args);
    } finally {
      g.window = prevWindow;
      g.document = prevDocument;
    }
  }

  async executeAsyncScript<T = unknown>(): Promise<T> {
    return undefined as unknown as T;
  }

  /** Applies a navigation's side effects, as a real page load would. */
  private _applyNavigation(url: string): void {
    this.win.location.href = url;
    // Reset injected state, as a real navigation would.
    this.win.rrweb = undefined;
    this.win.rrwebPluginSequentialIdRecord = undefined;
    this.win.__testmap_recordFn = undefined;
    this.win.__testmap_stopFn = undefined;
    this.win.__testmap_events = [];
  }

  get(url: string): unknown {
    this.navCalls.push({ kind: 'get', arg: url });
    this._applyNavigation(url);
    return Promise.resolve();
  }

  /**
   * Simulates a full-page navigation triggered OUTSIDE the driver's
   * get/navigate API (e.g. a user clicking an `<a href>`): the document is
   * replaced and rrweb is gone, but the plugin's navigation wrappers never fire.
   */
  simulateClickNavigation(url: string): void {
    this._applyNavigation(url);
  }

  navigate(): SeleniumNavigation {
    const self = this;
    return {
      to(url: string) {
        // NB: do not call self.get() — installNavigationHooks patches it, and a
        // real Selenium `to` delegating to `get` is what the engine depth-guard
        // covers; the fake keeps the two entry points independent.
        self.navCalls.push({ kind: 'to', arg: url });
        self._applyNavigation(url);
        return Promise.resolve();
      },
      back() {
        self.navCalls.push({ kind: 'back' });
        return Promise.resolve();
      },
      forward() {
        self.navCalls.push({ kind: 'forward' });
        return Promise.resolve();
      },
      refresh() {
        self.navCalls.push({ kind: 'refresh' });
        return Promise.resolve();
      },
    };
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.win.location.href);
  }

  getCapabilities(): Promise<unknown> {
    return Promise.resolve(
      this._caps ?? {
        getBrowserName: () => 'chrome',
        getBrowserVersion: () => '125.0',
        getPlatform: () => 'mac',
        toJSON: () => ({ browserName: 'chrome', browserVersion: '125.0' }),
      },
    );
  }

  quit(): unknown {
    this.quitCalled = true;
    return Promise.resolve();
  }
}

/** A minimal RecordingSession for adapter tests. */
export function makeFakeSession(events: any[] = [{ type: 2, timestamp: 1, id: 1 }]) {
  const calls = { begin: 0, end: 0, browser: 0 };
  return {
    calls,
    session: {
      async beginTest() {
        calls.begin++;
      },
      async endTest() {
        calls.end++;
        return events;
      },
      async getBrowserInfo() {
        calls.browser++;
        return { name: 'chrome', version: '125.0', family: 'chromium' };
      },
      getRecorderInfo() {
        return {
          scriptVersion: '@appsurify-testmap/rrweb-record:9.9.9-test',
          libVersion: '@appsurify-testmap/rrweb:9.9.9',
        };
      },
    },
  };
}
