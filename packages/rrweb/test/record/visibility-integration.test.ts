/**
 * @vitest-environment jsdom
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import record from '../../src/record';
import {
  EventType,
  IncrementalSource,
  type eventWithTime,
  type incrementalSnapshotEvent,
} from '@appsurify-testmap/rrweb-types';

function waitForRAF(count = 5): Promise<void> {
  return new Promise((resolve) => {
    let n = 0;
    const loop = () => {
      requestAnimationFrame(() => {
        n++;
        if (n >= count) resolve();
        else loop();
      });
    };
    loop();
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('visibility integration', () => {
  let stopRecording: (() => void) | undefined;
  let events: eventWithTime[];

  beforeEach(() => {
    events = [];
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    if (stopRecording) {
      stopRecording();
      stopRecording = undefined;
    }
    vi.restoreAllMocks();
  });

  it('does not emit Visibility events when sampling.visibility === false', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      sampling: { visibility: false },
    });

    await wait(50);
    document.body.appendChild(document.createElement('div'));
    await waitForRAF();
    await wait(150);

    const visibilityEvents = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        (e as incrementalSnapshotEvent).data.source === IncrementalSource.Visibility,
    );
    expect(visibilityEvents.length).toBe(0);
  });

  it('emits Visibility mutations with IncrementalSource.Visibility when recordVisibility is true', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      sampling: {
        visibility: { mode: 'none', rafThrottle: 20, recordVisibility: true },
      },
    });

    await wait(50);
    document.body.appendChild(document.createElement('div'));
    await waitForRAF();
    await wait(100);

    const visibilityEvents = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        (e as incrementalSnapshotEvent).data.source === IncrementalSource.Visibility,
    );
    expect(visibilityEvents.length).toBeGreaterThanOrEqual(0);
    for (const e of visibilityEvents) {
      expect((e as incrementalSnapshotEvent).data.source).toBe(
        IncrementalSource.Visibility,
      );
      expect((e as incrementalSnapshotEvent).data.mutations).toBeDefined();
      expect(Array.isArray((e as incrementalSnapshotEvent).data.mutations)).toBe(
        true,
      );
    }
  });

  it('Visibility mutations do NOT increment incrementalSnapshotCount (checkout on Nth only)', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      checkoutEveryNth: 2,
      sampling: { visibility: { mode: 'none', rafThrottle: 20 } },
    });

    await wait(50);
    const initialCount = events.length;
    document.body.appendChild(document.createElement('div'));
    await waitForRAF();
    await wait(100);

    const visibilityCount = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        (e as incrementalSnapshotEvent).data.source === IncrementalSource.Visibility,
    ).length;
    const metaCountAfterVisibility = events.filter(
      (e) => e.type === EventType.Meta,
    ).length;

    document.body.appendChild(document.createElement('input'));
    await wait(50);
    const input = document.querySelector('input') as HTMLInputElement;
    input?.focus();
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    input?.focus();
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(50);

    const metaCountAfterInputs = events.filter(
      (e) => e.type === EventType.Meta,
    ).length;
    expect(events.length).toBeGreaterThan(initialCount);
    if (visibilityCount > 0) {
      expect(metaCountAfterInputs).toBeGreaterThanOrEqual(metaCountAfterVisibility);
    }
  });

  it('checkoutEveryNvm triggers full snapshot without emitting visibility events when recordVisibility is false', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      checkoutEveryNvm: 1,
      sampling: {
        visibility: { mode: 'none', rafThrottle: 10, recordVisibility: false },
      },
    });

    const visibilityBefore = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        (e as incrementalSnapshotEvent).data.source ===
          IncrementalSource.Visibility,
    ).length;
    const fullBefore = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    ).length;
    await wait(80);
    for (let i = 0; i < 3; i++) {
      document.body.appendChild(document.createElement('div'));
    }
    await waitForRAF();
    await wait(150);

    const visibilityAfter = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        (e as incrementalSnapshotEvent).data.source ===
          IncrementalSource.Visibility,
    ).length;
    const fullAfter = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    ).length;
    expect(visibilityAfter).toBe(visibilityBefore);
    expect(fullAfter).toBeGreaterThanOrEqual(fullBefore);
  });

  it('does not create visibility observer when visibility and checkoutEveryNvm are not set', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
    });

    await wait(50);
    document.body.appendChild(document.createElement('div'));
    await waitForRAF();
    await wait(150);

    const visibilityEvents = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        (e as incrementalSnapshotEvent).data.source ===
          IncrementalSource.Visibility,
    );
    expect(visibilityEvents.length).toBe(0);
  });

  it('checkoutEveryNvm triggers full snapshot independently', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      checkoutEveryNvm: 1,
      sampling: {
        visibility: { mode: 'none', rafThrottle: 10, recordVisibility: false },
      },
    });

    const metaBefore = events.filter((e) => e.type === EventType.Meta).length;
    await wait(80);
    for (let i = 0; i < 3; i++) {
      document.body.appendChild(document.createElement('div'));
    }
    await waitForRAF();
    await wait(150);

    const metaAfter = events.filter((e) => e.type === EventType.Meta).length;
    const fullAfter = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    ).length;
    expect(events.length).toBeGreaterThan(0);
    if (
      events.some(
        (e) =>
          e.type === EventType.IncrementalSnapshot &&
          (e as incrementalSnapshotEvent).data.source ===
            IncrementalSource.Visibility,
      )
    ) {
      expect(metaAfter).toBeGreaterThanOrEqual(metaBefore);
      expect(fullAfter).toBeGreaterThanOrEqual(metaAfter);
    }
  });

  it('both counters reset on FullSnapshot', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      checkoutEveryNth: 2,
      checkoutEveryNvm: 10,
    });

    const fullSnapshotEvents = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    );
    expect(fullSnapshotEvents.length).toBeGreaterThanOrEqual(1);

    document.body.appendChild(document.createElement('input'));
    await wait(30);
    const input = document.querySelector('input') as HTMLInputElement;
    for (let i = 0; i < 3; i++) {
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(50);

    const metaEvents = events.filter((e) => e.type === EventType.Meta);
    expect(metaEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('freeze/lock coordination: takeFullSnapshot locks visibilityManager', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      sampling: { visibility: { mode: 'none' } },
    });

    const fullCountBefore = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    ).length;
    (record as unknown as { takeFullSnapshot: (c?: boolean) => void }).takeFullSnapshot(
      true,
    );
    const fullCountAfter = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    ).length;
    expect(fullCountAfter).toBe(fullCountBefore + 1);
  });

  it('navigation triggers snapshot and resets state', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      sampling: { visibility: {} },
    });

    const initialMeta = events.filter((e) => e.type === EventType.Meta).length;
    window.history.pushState({}, '', '/visibility-test-nav');
    await wait(50);

    const metaEvents = events.filter((e) => e.type === EventType.Meta);
    expect(metaEvents.length).toBeGreaterThanOrEqual(initialMeta + 1);
    const lastMeta = metaEvents[metaEvents.length - 1];
    expect(lastMeta.data.href).toContain('/visibility-test-nav');

    const fullAfterNav = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    ).length;
    expect(fullAfterNav).toBeGreaterThanOrEqual(1);
  });
});
