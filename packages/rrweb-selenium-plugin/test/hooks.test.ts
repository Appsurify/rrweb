import { describe, it, expect, vi } from 'vitest';
import { HookEmitter, recorderHooks } from '../src/core/hooks';

describe('HookEmitter', () => {
  it('delivers emitted payloads to on() listeners', () => {
    const e = new HookEmitter<{ ping: { n: number } }>();
    const seen: number[] = [];
    e.on('ping', (p) => seen.push(p.n));
    e.emit('ping', { n: 1 });
    e.emit('ping', { n: 2 });
    expect(seen).toEqual([1, 2]);
  });

  it('once() fires a single time', () => {
    const e = new HookEmitter<{ ping: number }>();
    const fn = vi.fn();
    e.once('ping', fn);
    e.emit('ping', 1);
    e.emit('ping', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('off() removes a listener', () => {
    const e = new HookEmitter<{ ping: number }>();
    const fn = vi.fn();
    e.on('ping', fn);
    e.off('ping', fn);
    e.emit('ping', 1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('isolates handler errors so other listeners still run', () => {
    const e = new HookEmitter<{ ping: number }>();
    const good = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    e.on('ping', () => {
      throw new Error('boom');
    });
    e.on('ping', good);
    expect(() => e.emit('ping', 1)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('exposes a shared singleton on globalThis', () => {
    expect(recorderHooks).toBeInstanceOf(HookEmitter);
    expect((globalThis as Record<string, unknown>)['__APPSURIFY_TESTMAP_HOOKS__']).toBe(
      recorderHooks,
    );
  });
});
