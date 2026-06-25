import type { SeleniumEngineOptions } from './types';
import { attach } from './attach';
import { deregisterEngine } from './registry';

/** Structural shape of selenium-webdriver's `Builder` class. @public */
export interface BuilderLike {
  prototype: {
    build: (...args: unknown[]) => unknown;
    [key: string]: unknown;
  };
}

/**
 * Auto-attaches every driver created by a Selenium `Builder` — truly zero-touch.
 * @public
 * @remarks
 * Pass the `Builder` class (e.g. `import { Builder } from "selenium-webdriver"`).
 * `Builder.build()` is thenable-aware: it returns synchronously a
 * `ThenableWebDriver` proxy `T` and, when awaited, yields a DIFFERENT fresh
 * instance `D`. We attach `T` immediately AND wrap `T.then` to attach `D` before
 * it resolves, covering both `await build()` and no-await `build()` idioms.
 * Idempotent and opt-in; the default path remains explicit {@link attach}.
 */
export function enableAutoAttach(
  builder: BuilderLike,
  options?: SeleniumEngineOptions,
): void {
  const proto = builder?.prototype as
    | (BuilderLike['prototype'] & { __testmap_autoattach?: boolean })
    | undefined;
  if (!proto || typeof proto.build !== 'function' || proto.__testmap_autoattach) {
    return;
  }

  const origBuild = proto.build;
  proto.__testmap_autoattach = true;

  proto.build = function (this: unknown, ...args: unknown[]): unknown {
    // The build result is a ThenableWebDriver (dynamic shape); treat it loosely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = origBuild.apply(this, args);

    // Attach the synchronously-returned thenable proxy (no-await idiom).
    try {
      attach(result, options);
    } catch {
      // not driver-like yet — the awaited instance is handled below
    }

    // Attach the fresh instance the promise resolves to (await idiom).
    if (result && typeof result.then === 'function') {
      const origThen = result.then.bind(result);
      result.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: unknown) =>
        origThen((driver: unknown) => {
          try {
            attach(driver as never, options);
          } catch {
            // ignore
          }
          // The thenable proxy and the awaited instance share ONE browser
          // session. Drop the proxy's engine so a single session is not
          // recorded twice (and so the proxy's engine does not leak).
          if (result !== driver) {
            try {
              deregisterEngine(result as never);
            } catch {
              // ignore
            }
          }
          return onFulfilled ? onFulfilled(driver) : driver;
        }, onRejected);
    }

    return result;
  };
}
