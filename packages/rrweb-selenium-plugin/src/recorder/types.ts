import type {
  eventWithTime,
  RecorderWindow,
  RRWebRecord,
  RRWebStop,
} from '../core/types';

/**
 * Script type accepted by WebDriver `executeScript`.
 * @public
 * @remarks Intentionally loose to accommodate different driver implementations.
 */
export type Script<T = unknown> = string | ((...args: never[]) => T);

/**
 * W3C WebDriver protocol surface (Selenium-compatible) the recorder needs.
 * @public
 * @remarks
 * Uses loose `any[]` argument types for maximum compatibility with Selenium,
 * WebdriverIO, and other W3C drivers.
 */
export interface WebDriver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeScript<T = unknown>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    script: string | ((...args: any[]) => T),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<T>;
  executeAsyncScript<T = unknown>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    script: string | ((...args: any[]) => void),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<T>;
}

/**
 * WebdriverIO-like surface (methods carry a `this` context).
 * @public
 */
export interface WebDriverIOLike<This = unknown> {
  execute<R = unknown>(
    this: This,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    script: string | ((...args: any[]) => R),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<R>;
  executeAsync<R = unknown>(
    this: This,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    script: string | ((...args: any[]) => void),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<R>;
}

/**
 * Any target the recorder can bind to.
 * @public
 */
export type BindableTarget<This = unknown> =
  | WebDriver
  | WebDriverIOLike<This>;

/**
 * `window` extended with the recorder's runtime structures injected via
 * `executeScript`.
 * @internal
 * @remarks
 * The W3C WebDriver protocol has no browser→Node push channel, so events are
 * buffered into `__testmap_events` in the page and drained by polling.
 */
export interface W3CWindow extends RecorderWindow {
  /** Reference to the injected `rrweb.record` function. */
  __testmap_recordFn?: RRWebRecord;
  /** Reference to the stop function returned by `rrweb.record()`. */
  __testmap_stopFn?: RRWebStop;
  /** Buffer of events (with their `isCheckout` flag) awaiting collection. */
  __testmap_events: Array<{ event: eventWithTime; isCheckout?: boolean }>;
}
