import type { recordOptions, eventWithTime } from '../core/types';

/**
 * Minimal duck-typed Selenium `Navigation` surface the engine wraps.
 * @public
 */
export interface SeleniumNavigation {
  to(url: string): unknown;
  back(): unknown;
  forward(): unknown;
  refresh(): unknown;
}

/**
 * Minimal duck-typed Selenium v4 `WebDriver` surface the engine needs.
 * @public
 * @remarks
 * Intentionally structural so the engine has no hard dependency on
 * `selenium-webdriver` — a real `WebDriver` satisfies it directly.
 */
export interface SeleniumDriver {
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
  get(url: string): unknown;
  navigate(): SeleniumNavigation;
  getCurrentUrl(): Promise<string>;
  getCapabilities?(): Promise<unknown>;
  quit?(): unknown;
}

/**
 * Options for {@link SeleniumEngine} / `attach`.
 * @public
 */
export interface SeleniumEngineOptions {
  /** rrweb record options forwarded to the recorder. */
  recordOptions?: recordOptions<eventWithTime>;
  /** Milliseconds to let the event buffer settle before stopping (default 800). */
  stabilizeMs?: number;
}
