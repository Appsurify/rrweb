import type { SeleniumDriver, SeleniumNavigation } from './types';
import type { SeleniumEngine } from './SeleniumEngine';

const WRAPPED = '__testmap_nav_wrapped';

/**
 * Instance-patches a driver's navigation entry points so each navigation routes
 * through the engine's re-injection logic. Patches ONLY navigation (never every
 * command), and is idempotent per driver.
 * @internal
 */
export function installNavigationHooks(
  driver: SeleniumDriver,
  engine: SeleniumEngine,
): void {
  const d = driver as Record<string, unknown> & SeleniumDriver;
  if (d[WRAPPED]) return;
  d[WRAPPED] = true;

  const origGet = driver.get.bind(driver);
  d.get = (url: string) =>
    engine.aroundNavigation('get', url, () => Promise.resolve(origGet(url)));

  const origNavigate = driver.navigate.bind(driver);
  d.navigate = (): SeleniumNavigation => wrapNavigation(origNavigate(), engine);
}

const NAV_KINDS = ['to', 'back', 'forward', 'refresh'] as const;

/**
 * Wraps the four navigation methods of a freshly-created `Navigation` so they
 * route through the engine. Other members are left untouched.
 */
function wrapNavigation(
  nav: SeleniumNavigation,
  engine: SeleniumEngine,
): SeleniumNavigation {
  const n = nav as unknown as Record<string, unknown>;
  for (const kind of NAV_KINDS) {
    const original = n[kind];
    if (typeof original === 'function' && !n[`__testmap_${kind}`]) {
      const bound = (original as (...a: unknown[]) => unknown).bind(nav);
      n[`__testmap_${kind}`] = bound;
      n[kind] = (...args: unknown[]) =>
        engine.aroundNavigation(
          kind,
          typeof args[0] === 'string' ? args[0] : '',
          () => Promise.resolve(bound(...args)),
        );
    }
  }
  return nav;
}
