/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { installNavigationHooks } from '../src/engine/navigation';
import { FakeDriver } from './helpers';

function fakeEngine() {
  const calls: Array<{ kind: string; info: string }> = [];
  const engine = {
    calls,
    async aroundNavigation(kind: string, info: string, thunk: () => Promise<unknown>) {
      calls.push({ kind, info });
      return thunk();
    },
  };
  return engine;
}

describe('installNavigationHooks', () => {
  it('routes driver.get through the engine and still runs the real navigation', async () => {
    const driver = new FakeDriver();
    const engine = fakeEngine();
    installNavigationHooks(driver, engine as any);

    await driver.get('https://a.test/');
    expect(engine.calls).toContainEqual({ kind: 'get', info: 'https://a.test/' });
    expect(driver.navCalls).toContainEqual({ kind: 'get', arg: 'https://a.test/' });
  });

  it('wraps navigate().to/back/forward/refresh', async () => {
    const driver = new FakeDriver();
    const engine = fakeEngine();
    installNavigationHooks(driver, engine as any);

    const nav = driver.navigate();
    await nav.to('https://b.test/');
    await nav.back();
    await nav.forward();
    await nav.refresh();

    expect(engine.calls.map((c) => c.kind)).toEqual(['to', 'back', 'forward', 'refresh']);
    expect(engine.calls[0].info).toBe('https://b.test/');
  });

  it('is idempotent per driver (no double-wrap)', async () => {
    const driver = new FakeDriver();
    const engine = fakeEngine();
    installNavigationHooks(driver, engine as any);
    installNavigationHooks(driver, engine as any);
    await driver.get('https://c.test/');
    expect(engine.calls).toHaveLength(1);
  });
});
