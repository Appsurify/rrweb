import type { SeleniumDriver, SeleniumEngineOptions } from './types';
import { SeleniumEngine } from './SeleniumEngine';
import { installNavigationHooks } from './navigation';
import { deregisterEngine, getEngineForDriver, registerEngine } from './registry';

function isDriverLike(x: unknown): x is SeleniumDriver {
  const d = x as Partial<SeleniumDriver> | null;
  return (
    !!d &&
    typeof d.executeScript === 'function' &&
    typeof d.get === 'function' &&
    typeof d.navigate === 'function'
  );
}

/**
 * Attaches Appsurify TestMap recording to an existing Selenium v4 `WebDriver`.
 * @public
 * @remarks
 * The recommended entry point. Duck-typed (no `selenium-webdriver` import),
 * idempotent (returns the same engine for the same driver), installs the
 * navigation hooks, registers the driver as an active session, and auto-removes
 * it from the registry when the driver quits.
 *
 * @example
 * ```ts
 * const driver = attach(await new Builder().forBrowser('chrome').build());
 * ```
 */
export function attach<T extends SeleniumDriver>(
  driver: T,
  options?: SeleniumEngineOptions,
): T {
  if (!isDriverLike(driver)) {
    throw new TypeError(
      '[testmap] attach() expects a Selenium v4 WebDriver (executeScript/get/navigate)',
    );
  }

  if (getEngineForDriver(driver)) {
    return driver; // idempotent
  }

  const engine = new SeleniumEngine(driver, options);
  registerEngine(driver, engine);
  installNavigationHooks(driver, engine);

  // Auto-deregister when the driver quits.
  const d = driver as Record<string, unknown> & SeleniumDriver;
  if (typeof d.quit === 'function' && !d.__testmap_quit_wrapped) {
    const origQuit = (d.quit as (...a: unknown[]) => unknown).bind(driver);
    d.__testmap_quit_wrapped = true;
    d.quit = async (...args: unknown[]) => {
      try {
        return await origQuit(...args);
      } finally {
        deregisterEngine(driver);
      }
    };
  }

  return driver;
}
