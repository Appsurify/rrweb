/**
 * @vitest-environment jsdom
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import record from '../../src/record';
import {
  EventType,
  IncrementalSource,
  type eventWithTime,
  type incrementalData,
} from '@appsurify-testmap/rrweb-types';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getInputEvents(events: eventWithTime[]) {
  return events.filter(
    (e) =>
      e.type === EventType.IncrementalSnapshot &&
      (e.data as incrementalData).source === IncrementalSource.Input,
  );
}

describe('input observer', () => {
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
    // Clean up any elements added to the body
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('trustSyntheticInput: true', () => {
    it('should accept synthetic events with non-empty values', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Enter text';
      document.body.appendChild(input);

      stopRecording = record({
        emit: (event) => events.push(event as eventWithTime),
        trustSyntheticInput: true,
      });

      const initialCount = events.length;

      // Simulate a programmatic value set followed by a change event
      input.value = 'hello world';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await wait(50);

      const inputEvents = getInputEvents(events.slice(initialCount));
      expect(inputEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter empty initial events (mount phantom)', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Search';
      document.body.appendChild(input);

      stopRecording = record({
        emit: (event) => events.push(event as eventWithTime),
        trustSyntheticInput: true,
      });

      const initialCount = events.length;

      // Simulate a React mount phantom: empty value, not user-triggered
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await wait(50);

      const inputEvents = getInputEvents(events.slice(initialCount));
      expect(inputEvents.length).toBe(0);
    });

    it('should filter <select> default selection on mount', async () => {
      const select = document.createElement('select');
      const option1 = document.createElement('option');
      option1.value = 'opt1';
      option1.text = 'Option 1';
      const option2 = document.createElement('option');
      option2.value = 'opt2';
      option2.text = 'Option 2';
      select.appendChild(option1);
      select.appendChild(option2);
      document.body.appendChild(select);

      stopRecording = record({
        emit: (event) => events.push(event as eventWithTime),
        trustSyntheticInput: true,
      });

      const initialCount = events.length;

      // Simulate mount-time phantom: selectedIndex = 0, not user-triggered
      expect(select.selectedIndex).toBe(0);
      select.dispatchEvent(new Event('change', { bubbles: true }));

      await wait(50);

      const inputEvents = getInputEvents(events.slice(initialCount));
      expect(inputEvents.length).toBe(0);
    });
  });

  describe('trustSyntheticInput: false (default)', () => {
    it('should filter phantom input events with placeholder', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Enter text';
      document.body.appendChild(input);

      stopRecording = record({
        emit: (event) => events.push(event as eventWithTime),
        trustSyntheticInput: false,
      });

      const initialCount = events.length;

      // Simulate phantom: empty value, has placeholder, not user-triggered
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await wait(50);

      const inputEvents = getInputEvents(events.slice(initialCount));
      expect(inputEvents.length).toBe(0);
    });
  });

  describe('teardown flush', () => {
    it('should capture final value of focused input on stop', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      stopRecording = record({
        emit: (event) => events.push(event as eventWithTime),
        trustSyntheticInput: true,
      });

      // Simulate programmatic value change (synthetic events have isTrusted: false)
      input.value = 'initial';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(50);

      // Focus the input and change value without triggering change event
      input.focus();
      input.value = 'final value';

      const preStopCount = events.length;

      // Stop recording — should flush the active input
      stopRecording();
      stopRecording = undefined;

      const flushEvents = getInputEvents(events.slice(preStopCount));
      expect(flushEvents.length).toBe(1);

      const flushData = flushEvents[0].data as { text: string };
      expect(flushData.text).toBe('final value');
    });

    it('should not emit flush when value has not changed', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      stopRecording = record({
        emit: (event) => events.push(event as eventWithTime),
        trustSyntheticInput: true,
      });

      // Set a value and record it
      input.value = 'same value';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(50);

      // Focus but don't change value
      input.focus();

      const preStopCount = events.length;

      stopRecording();
      stopRecording = undefined;

      const flushEvents = getInputEvents(events.slice(preStopCount));
      expect(flushEvents.length).toBe(0);
    });
  });
});
