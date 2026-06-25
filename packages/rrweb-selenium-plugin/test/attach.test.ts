import { describe, it, expect, afterEach } from 'vitest';
import { attach } from '../src/engine/attach';
import {
  getEngineForDriver,
  getActiveSessions,
  deregisterEngine,
} from '../src/engine/registry';
import { FakeDriver } from './helpers';

describe('attach', () => {
  afterEach(() => {
    for (const e of getActiveSessions()) deregisterEngine(e.target!);
  });

  it('throws on a non-driver argument', () => {
    expect(() => attach({} as never)).toThrow(TypeError);
    expect(() => attach(null as never)).toThrow(/Selenium v4 WebDriver/);
  });

  it('registers an engine and returns the same driver', () => {
    const driver = new FakeDriver();
    const returned = attach(driver);
    expect(returned).toBe(driver);
    expect(getEngineForDriver(driver)).toBeDefined();
    expect(getActiveSessions()).toHaveLength(1);
  });

  it('is idempotent (same engine for the same driver)', () => {
    const driver = new FakeDriver();
    attach(driver);
    const engine = getEngineForDriver(driver);
    attach(driver);
    expect(getEngineForDriver(driver)).toBe(engine);
    expect(getActiveSessions()).toHaveLength(1);
  });

  it('wraps quit() to auto-deregister', async () => {
    const driver = new FakeDriver();
    attach(driver);
    expect(getEngineForDriver(driver)).toBeDefined();
    await driver.quit();
    expect(driver.quitCalled).toBe(true);
    expect(getEngineForDriver(driver)).toBeUndefined();
  });

  it('routes navigation through the engine after attach', async () => {
    const driver = new FakeDriver();
    attach(driver);
    await driver.get('https://x.test/');
    expect(driver.navCalls).toContainEqual({ kind: 'get', arg: 'https://x.test/' });
  });
});
