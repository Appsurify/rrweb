/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { AbstractRecorder } from '../src/core/AbstractRecorder';
import type { customEventPayload, eventWithTime, recordOptions } from '../src/core/types';

class TestRecorder extends AbstractRecorder<{ name: string }, string, string> {
  public injected = 0;
  public recorded = 0;
  public stopped = 0;
  public added: Array<[string, customEventPayload]> = [];
  public ready = true;
  public recording = false;
  public failAdd = 0; // number of times invokeAddEventFn should throw

  protected async invokeInjectFn(): Promise<void> {
    this.injected++;
  }
  protected async invokeRecordFn(_o: recordOptions<eventWithTime>): Promise<void> {
    this.recorded++;
    this.recording = true;
  }
  protected async invokeStopFn(): Promise<void> {
    this.stopped++;
    this.recording = false;
  }
  protected async invokeAddEventFn(tag: string, payload: customEventPayload): Promise<void> {
    if (this.failAdd > 0) {
      this.failAdd--;
      throw new Error('transient');
    }
    this.added.push([tag, payload]);
  }
  async isReady(): Promise<boolean> {
    return this.ready;
  }
  async isRecording(): Promise<boolean> {
    return this.recording;
  }
  async getHref(): Promise<string> {
    return 'about:blank';
  }
}

describe('AbstractRecorder lifecycle', () => {
  it('transitions idle → bound → injected → recording → stopped', async () => {
    const r = new TestRecorder();
    expect(r.status).toBe('idle');
    await r.bind({ name: 't' });
    expect(r.status).toBe('bound');
    expect(r.target).toEqual({ name: 't' });
    await r.inject();
    expect(r.status).toBe('injected');
    await r.start();
    expect(r.status).toBe('recording');
    await r.stop();
    expect(r.status).toBe('stopped');
    expect(r.injected).toBe(1);
    expect(r.recorded).toBe(1);
    expect(r.stopped).toBe(1);
  });

  it('is idempotent for inject/start/stop', async () => {
    const r = new TestRecorder();
    await r.bind({ name: 't' });
    await r.inject();
    await r.inject();
    expect(r.injected).toBe(1);
    await r.start();
    await r.start();
    expect(r.recorded).toBe(1);
    await r.stop();
    await r.stop();
    expect(r.stopped).toBe(1);
  });

  it('rejects invalid transitions (inject before bind)', async () => {
    const r = new TestRecorder();
    await expect(r.inject()).rejects.toThrow(/not allowed in status "idle"/);
  });

  it('rejects start before inject', async () => {
    const r = new TestRecorder();
    await r.bind({ name: 't' });
    await expect(r.start()).rejects.toThrow(/not allowed in status "bound"/);
  });

  it('buffers events and starts a new segment on checkout', async () => {
    const r = new TestRecorder();
    await r.bind({ name: 't' });
    await r.inject();
    await r.start();
    await r.handleEvent({ type: 2, data: {}, timestamp: 1 } as eventWithTime);
    await r.handleEvent({ type: 3, data: {}, timestamp: 2 } as eventWithTime);
    expect(r.segmentCount).toBe(1);
    await r.handleEvent({ type: 4, data: {}, timestamp: 3 } as eventWithTime, true);
    expect(r.segmentCount).toBe(2);
    expect(r.events).toHaveLength(3);
    await r.stop();
  });

  it('adds a fresh segment when restarting after stop', async () => {
    const r = new TestRecorder();
    await r.bind({ name: 't' });
    await r.inject();
    await r.start();
    await r.handleEvent({ type: 2, data: {}, timestamp: 1 } as eventWithTime);
    await r.stop();
    await r.start();
    expect(r.segmentCount).toBe(2);
    expect(r.recorded).toBe(2);
    await r.stop();
  });
});

describe('AbstractRecorder custom-event queue', () => {
  it('dispatches immediately when ready', async () => {
    const r = new TestRecorder();
    await r.bind({ name: 't' });
    await r.inject();
    await r.start();
    await r.addCustomEvent('tag', { a: 1 });
    expect(r.added).toEqual([['tag', { a: 1 }]]);
    await r.stop();
  });

  it('queues when not ready, then flushes on start', async () => {
    const r = new TestRecorder();
    await r.bind({ name: 't' });
    await r.inject();
    r.ready = false;
    await r.addCustomEvent('queued', { x: 1 });
    expect(r.added).toHaveLength(0);
    r.ready = true;
    await r.start(); // start() flushes the queue
    expect(r.added).toEqual([['queued', { x: 1 }]]);
    await r.stop();
  });

  it('retries a transient dispatch failure without losing the event', async () => {
    const r = new TestRecorder();
    await r.bind({ name: 't' });
    await r.inject();
    await r.start();
    r.failAdd = 1; // first attempt throws, event stays queued
    await r.addCustomEvent('retryme', { y: 2 });
    expect(r.added).toHaveLength(0);
    // A later flush (triggered by enqueuing another event) succeeds for both.
    await r.addCustomEvent('next', { z: 3 });
    expect(r.added).toEqual([
      ['retryme', { y: 2 }],
      ['next', { z: 3 }],
    ]);
    await r.stop();
  });
});
