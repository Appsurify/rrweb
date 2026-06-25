/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerEngine,
  getEngineForDriver,
  deregisterEngine,
  getActiveSessions,
} from '../src/engine/registry';

function cleanup() {
  for (const e of getActiveSessions()) {
    deregisterEngine((e as any).target ?? e);
  }
}

describe('engine registry', () => {
  beforeEach(cleanup);

  it('registers and resolves an engine by driver', () => {
    const driver = { id: 'd1' } as any;
    const engine = { target: driver } as any;
    registerEngine(driver, engine);
    expect(getEngineForDriver(driver)).toBe(engine);
    expect(getActiveSessions()).toContain(engine);
  });

  it('deregisters an engine', () => {
    const driver = { id: 'd2' } as any;
    const engine = { target: driver } as any;
    registerEngine(driver, engine);
    deregisterEngine(driver);
    expect(getEngineForDriver(driver)).toBeUndefined();
    expect(getActiveSessions()).not.toContain(engine);
  });

  it('tracks multiple active sessions', () => {
    const d1 = { id: 'a' } as any;
    const d2 = { id: 'b' } as any;
    registerEngine(d1, { target: d1 } as any);
    registerEngine(d2, { target: d2 } as any);
    expect(getActiveSessions()).toHaveLength(2);
  });

  it('shares one registry via globalThis', () => {
    expect(
      (globalThis as Record<string, unknown>)['__APPSURIFY_TESTMAP_SELENIUM_REGISTRY__'],
    ).toBeTruthy();
  });
});
