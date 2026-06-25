import type { SeleniumDriver } from './types';
import type { SeleniumEngine } from './SeleniumEngine';

/**
 * Per-process registry mapping drivers to their engines.
 * @remarks
 * Backed by a `globalThis` singleton so the ESM and CJS builds of this package
 * (the "dual package hazard") share ONE registry — a consumer's test may
 * `attach()` via the CJS copy while a runner entry (e.g. Mocha loading the ESM
 * entry) reads sessions via the ESM copy.
 */
interface SeleniumRegistry {
  driverToEngine: WeakMap<object, SeleniumEngine>;
  activeEngines: Set<SeleniumEngine>;
}

const REGISTRY_KEY = '__APPSURIFY_TESTMAP_SELENIUM_REGISTRY__';

function registry(): SeleniumRegistry {
  const g = globalThis as unknown as Record<string, SeleniumRegistry | undefined>;
  let r = g[REGISTRY_KEY];
  if (!r) {
    r = { driverToEngine: new WeakMap(), activeEngines: new Set() };
    g[REGISTRY_KEY] = r;
  }
  return r;
}

/** Registers an engine for a driver. @internal */
export function registerEngine(driver: SeleniumDriver, engine: SeleniumEngine): void {
  const r = registry();
  r.driverToEngine.set(driver as object, engine);
  r.activeEngines.add(engine);
}

/** Returns the engine bound to a driver, if any. @public */
export function getEngineForDriver(driver: SeleniumDriver): SeleniumEngine | undefined {
  return registry().driverToEngine.get(driver as object);
}

/** Removes a driver's engine from the registry. @internal */
export function deregisterEngine(driver: SeleniumDriver): void {
  const r = registry();
  const engine = r.driverToEngine.get(driver as object);
  if (engine) {
    r.activeEngines.delete(engine);
    r.driverToEngine.delete(driver as object);
  }
}

/**
 * Returns all currently-attached engines (which are recording sessions).
 * @public
 * @remarks
 * Test-runner adapters call this in before/after hooks to drive every active
 * session for the current test.
 */
export function getActiveSessions(): SeleniumEngine[] {
  return [...registry().activeEngines];
}
