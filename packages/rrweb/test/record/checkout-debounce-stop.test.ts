/**
 * @vitest-environment jsdom
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import record from '../../src/record';
import { EventType, IncrementalSource } from '@appsurify-testmap/rrweb-types';
import type { eventWithTime, serializedNodeWithId } from '@appsurify-testmap/rrweb-types';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsText(node: serializedNodeWithId, text: string): boolean {
  if ('textContent' in node && node.textContent?.includes(text)) return true;
  if ('childNodes' in node) {
    return node.childNodes.some((child) => containsText(child, text));
  }
  return false;
}

describe('stop() with a pending debounced checkout', () => {
  let stopRecording: (() => void) | undefined;
  let events: eventWithTime[];

  beforeEach(() => {
    events = [];
    document.body.innerHTML = '<div id="root"><p>skeleton</p></div>';
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    stopRecording?.();
    stopRecording = undefined;
    vi.restoreAllMocks();
  });

  it('emits a FullSnapshot of the latest DOM instead of dropping the checkout', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      checkoutEveryNth: 2,
      // Long enough that the timer can never fire before stop().
      checkoutDebounce: 10_000,
      sampling: { navigation: false },
    });

    const root = document.getElementById('root')!;
    // Two mutation batches reach the checkoutEveryNth threshold and freeze
    // the buffers; the rest accumulate while the checkout is debounced.
    for (let i = 0; i < 5; i++) {
      const el = document.createElement('span');
      el.textContent = `row-${i}`;
      root.appendChild(el);
      await wait(0);
    }
    const final = document.createElement('h1');
    final.textContent = 'Loaded Project';
    root.appendChild(final);
    await wait(0);
    const lastMutationAt = Date.now();

    const snapshotsBeforeStop = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    ).length;

    stopRecording();
    stopRecording = undefined;

    const fullSnapshots = events.filter(
      (e) => e.type === EventType.FullSnapshot,
    );
    expect(fullSnapshots.length).toBe(snapshotsBeforeStop + 1);

    const last = fullSnapshots[fullSnapshots.length - 1];
    expect(last.timestamp).toBeGreaterThanOrEqual(lastMutationAt);
    if (last.type !== EventType.FullSnapshot) throw new Error('unreachable');
    expect(containsText(last.data.node, 'Loaded Project')).toBe(true);

    // Nothing emitted after the final snapshot may be a stale mutation from
    // the frozen buffers — those are superseded by the snapshot.
    const lastIdx = events.lastIndexOf(last);
    const mutationsAfter = events
      .slice(lastIdx + 1)
      .filter(
        (e) =>
          e.type === EventType.IncrementalSnapshot &&
          e.data.source === IncrementalSource.Mutation,
      );
    expect(mutationsAfter).toHaveLength(0);
  });

  it('does not take an extra snapshot when no checkout is pending', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      checkoutEveryNth: 100,
      checkoutDebounce: 10_000,
      sampling: { navigation: false },
    });
    document.getElementById('root')!.appendChild(document.createElement('i'));
    await wait(0);

    const before = events.filter((e) => e.type === EventType.FullSnapshot).length;
    stopRecording();
    stopRecording = undefined;
    const after = events.filter((e) => e.type === EventType.FullSnapshot).length;
    expect(after).toBe(before);
  });

  it('flushes buffers frozen without a pending checkout', async () => {
    stopRecording = record({
      emit: (event) => events.push(event as eventWithTime),
      sampling: { navigation: false },
    });
    record.freezePage();
    const el = document.createElement('em');
    el.textContent = 'while-frozen';
    document.getElementById('root')!.appendChild(el);
    await wait(0);
    const mutationsBefore = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        e.data.source === IncrementalSource.Mutation,
    ).length;

    stopRecording();
    stopRecording = undefined;

    const mutationsAfter = events.filter(
      (e) =>
        e.type === EventType.IncrementalSnapshot &&
        e.data.source === IncrementalSource.Mutation,
    ).length;
    expect(mutationsAfter).toBe(mutationsBefore + 1);
  });
});
