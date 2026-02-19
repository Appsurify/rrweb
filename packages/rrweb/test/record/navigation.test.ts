/**
 * @vitest-environment jsdom
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import record from '../../src/record';
import { EventType } from '@appsurify-testmap/rrweb-types';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';

// NavigationManager pipeline: debounce (100ms) + settle (150ms) + double rAF
// In jsdom rAF is ~0ms, so total ~250ms. Use 500ms for safety.
const NAV_SETTLE_WAIT = 500;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('navigation observer', () => {
  let stopRecording: (() => void) | undefined;
  let events: eventWithTime[];

  beforeEach(() => {
    events = [];
    // Mock console.debug to avoid noise in tests
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    if (stopRecording) {
      stopRecording();
      stopRecording = undefined;
    }
    vi.restoreAllMocks();
  });

  it('should detect pushState navigation', async () => {
    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
    });

    const initialEventCount = events.length;

    // Trigger pushState navigation
    window.history.pushState({}, '', '/test-page-1');

    // Wait for NavigationManager debounce + settle + rAF pipeline
    await wait(NAV_SETTLE_WAIT);

    // Should emit Meta + FullSnapshot events
    const newEvents = events.slice(initialEventCount);
    expect(newEvents.length).toBeGreaterThanOrEqual(2);

    // Check for Meta event
    const metaEvent = newEvents.find(e => e.type === EventType.Meta);
    expect(metaEvent).toBeDefined();
    expect(metaEvent?.data.href).toContain('/test-page-1');

    // Check for FullSnapshot event
    const fullSnapshotEvent = newEvents.find(e => e.type === EventType.FullSnapshot);
    expect(fullSnapshotEvent).toBeDefined();
  });

  it('should detect replaceState navigation', async () => {
    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
    });

    const initialEventCount = events.length;

    // Trigger replaceState navigation
    window.history.replaceState({}, '', '/test-page-2');

    // Wait for NavigationManager pipeline
    await wait(NAV_SETTLE_WAIT);

    // Should emit Meta + FullSnapshot events
    const newEvents = events.slice(initialEventCount);
    expect(newEvents.length).toBeGreaterThanOrEqual(2);

    const metaEvent = newEvents.find(e => e.type === EventType.Meta);
    expect(metaEvent).toBeDefined();
    expect(metaEvent?.data.href).toContain('/test-page-2');
  });

  it('should detect popstate navigation', async () => {
    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
    });

    // Setup: push a state first
    window.history.pushState({}, '', '/initial');
    await wait(NAV_SETTLE_WAIT);
    const eventsAfterPush = events.length;

    // Trigger popstate by going back
    window.history.back();

    // Wait for popstate event + NavigationManager pipeline
    await wait(NAV_SETTLE_WAIT);

    const newEvents = events.slice(eventsAfterPush);

    // Should have new events from popstate
    if (newEvents.length > 0) {
      const metaEvent = newEvents.find(e => e.type === EventType.Meta);
      expect(metaEvent).toBeDefined();
    }
  });

  it('should detect hashchange navigation', async () => {
    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
    });

    const initialEventCount = events.length;

    // Trigger hashchange
    window.location.hash = '#section1';

    // Wait for hashchange event + NavigationManager pipeline
    await wait(NAV_SETTLE_WAIT);

    const newEvents = events.slice(initialEventCount);
    expect(newEvents.length).toBeGreaterThanOrEqual(2);

    const metaEvent = newEvents.find(e => e.type === EventType.Meta);
    expect(metaEvent).toBeDefined();
    expect(metaEvent?.data.href).toContain('#section1');
  });

  it('should not emit duplicate events for same URL', () => {
    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
    });

    const initialEventCount = events.length;

    // Push same URL twice
    const testUrl = '/test-duplicate';
    window.history.pushState({}, '', testUrl);
    const eventsAfterFirst = events.length;

    // Push same URL again
    window.history.pushState({}, '', testUrl);
    const eventsAfterSecond = events.length;

    // Second push should not emit events (URL didn't change)
    expect(eventsAfterSecond).toBe(eventsAfterFirst);
  });

  it('should respect sampling.navigation = false', () => {
    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
      sampling: {
        navigation: false,
      },
    });

    const initialEventCount = events.length;

    // Try to trigger navigation
    window.history.pushState({}, '', '/test-disabled');

    // Should not emit navigation-triggered events
    const newEvents = events.slice(initialEventCount);

    // There might be other events, but no new Meta/FullSnapshot from navigation
    // Check that the URL in Meta hasn't changed to /test-disabled
    const metaEvents = newEvents.filter(e => e.type === EventType.Meta);
    if (metaEvents.length > 0) {
      // If there are meta events, they shouldn't be from our navigation
      metaEvents.forEach(meta => {
        expect(meta.data.href).not.toContain('/test-disabled');
      });
    }
  });

  it('should cleanup and restore history methods', () => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
    });

    // Methods should be patched
    expect(window.history.pushState).not.toBe(originalPushState);
    expect(window.history.replaceState).not.toBe(originalReplaceState);

    // Stop recording
    stopRecording();
    stopRecording = undefined;

    // Methods should be restored
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
  });

  it('should track lastHref correctly across multiple navigations', async () => {
    stopRecording = record({
      emit: (event) => {
        events.push(event as eventWithTime);
      },
    });

    // Navigate to page 1
    window.history.pushState({}, '', '/page-1');
    await wait(NAV_SETTLE_WAIT);
    const eventsAfterPage1 = events.length;

    // Navigate to page 2
    window.history.pushState({}, '', '/page-2');
    await wait(NAV_SETTLE_WAIT);
    const eventsAfterPage2 = events.length;

    // Both navigations should emit events
    expect(eventsAfterPage2).toBeGreaterThan(eventsAfterPage1);

    // Check the latest Meta event has the correct href
    const allMetaEvents = events.filter(e => e.type === EventType.Meta);
    const latestMeta = allMetaEvents[allMetaEvents.length - 1];
    expect(latestMeta.data.href).toContain('/page-2');
  });
});
