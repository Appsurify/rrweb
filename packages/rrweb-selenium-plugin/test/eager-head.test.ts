import { describe, it, expect } from 'vitest';
import { SeleniumEngine } from '../src/engine/SeleniumEngine';
import { WebDriverClassicRecorder } from '../src/recorder/WebDriverClassicRecorder';
import { NAVIGATION_CUSTOM_EVENT_TAG } from '../src/core/AbstractRecorder';
import { FakeDriver } from './helpers';

/** Counts META (type 4) events — one per recorded page segment. */
function metaCount(events: readonly { type?: number }[]): number {
  return events.filter((e) => e.type === 4).length;
}

/** Pushes a raw rrweb event into the page buffer, as the UMD's emit would. */
function emitIntoPage(
  driver: FakeDriver,
  event: Record<string, unknown>,
): void {
  driver.win.__testmap_events.push({ event });
}

describe('eager-head discard (start duplicate FullSnapshot)', () => {
  it('drops the idle eager head on the first wrapped navigation', async () => {
    // The browser still shows the previous test's page when the test begins.
    const driver = new FakeDriver({ href: 'https://app.test/leftover' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    await engine.aroundNavigation('get', 'https://app.test/target', async () => {
      await driver.get('https://app.test/target');
    });

    const events = await engine.endTest();
    // Only the destination page's segment remains.
    expect(metaCount(events)).toBe(1);
    const nav = events.find(
      (e) =>
        e.type === 5 &&
        (e.data as { tag?: string })?.tag === NAVIGATION_CUSTOM_EVENT_TAG,
    );
    expect(nav).toBeDefined();
  });

  it('keeps the head when the test never navigates (before-hook case)', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/prepared' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    const events = await engine.endTest();
    expect(metaCount(events)).toBe(1);
    expect(events.length).toBeGreaterThanOrEqual(3); // META + FS + incremental
  });

  it('keeps the head when an interaction happened before the navigation', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/stateful' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    // A click on the inherited page (stateful step-by-step suites).
    emitIntoPage(driver, {
      type: 3,
      data: { source: 2, type: 2, id: 42 }, // MouseInteraction
      timestamp: 10,
      id: 100,
    });

    await engine.aroundNavigation('get', 'https://app.test/next', async () => {
      await driver.get('https://app.test/next');
    });

    const events = await engine.endTest();
    expect(metaCount(events)).toBe(2); // inherited page + destination
  });

  it('treats scroll as an interaction', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/scrolled' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    emitIntoPage(driver, {
      type: 3,
      data: { source: 3, id: 1, x: 0, y: 500 }, // Scroll
      timestamp: 10,
      id: 100,
    });

    await engine.aroundNavigation('get', 'https://app.test/next', async () => {
      await driver.get('https://app.test/next');
    });

    expect(metaCount(await engine.endTest())).toBe(2);
  });

  it('passive noise (mutations, adopted stylesheets) does not preserve the head', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/noisy' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    emitIntoPage(driver, {
      type: 3,
      data: { source: 0, adds: [], removes: [], texts: [], attributes: [] }, // Mutation
      timestamp: 10,
      id: 100,
    });
    emitIntoPage(driver, {
      type: 3,
      data: { source: 15, id: 1, styleIds: [] }, // AdoptedStyleSheet
      timestamp: 11,
      id: 101,
    });

    await engine.aroundNavigation('get', 'https://app.test/next', async () => {
      await driver.get('https://app.test/next');
    });

    expect(metaCount(await engine.endTest())).toBe(1);
  });

  it('a user custom event preserves the head; the navigation marker does not', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/custom' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    // Emitted as the in-page rrweb would emit a user-added custom event.
    emitIntoPage(driver, {
      type: 5,
      data: { tag: 'testmap:step', payload: { name: 'assert header' } },
      timestamp: 10,
      id: 100,
    });

    await engine.aroundNavigation('get', 'https://app.test/next', async () => {
      await driver.get('https://app.test/next');
    });

    expect(metaCount(await engine.endTest())).toBe(2);
  });

  it('only the FIRST wrapped navigation decides — later idle segments survive', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/leftover' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    await engine.aroundNavigation('get', 'https://app.test/a', async () => {
      await driver.get('https://app.test/a');
    });
    // No interactions on /a — an intentionally visited page must stay.
    await engine.aroundNavigation('get', 'https://app.test/b', async () => {
      await driver.get('https://app.test/b');
    });

    expect(metaCount(await engine.endTest())).toBe(2); // /a and /b
  });

  it('self-heal invalidates the eager marker so a later navigation drops nothing', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/leftover' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    // Unwrapped full-page navigation (link click): document replaced, polling
    // pump notices rrweb is gone and re-establishes recording.
    driver.simulateClickNavigation('https://app.test/clicked');
    await new Promise((r) => setTimeout(r, 350)); // > polling interval

    await engine.aroundNavigation('get', 'https://app.test/next', async () => {
      await driver.get('https://app.test/next');
    });

    const events = await engine.endTest();
    // Head (leftover) + re-established (clicked) + wrapped destination (next):
    // nothing may be discarded once the buffer spans more than the head.
    expect(metaCount(events)).toBe(3);
  });

  it('start({eagerHead}) on a non-empty buffer does not arm the discard', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/' });
    const recorder = new WebDriverClassicRecorder();
    await recorder.bind(driver);
    await recorder.inject();
    await recorder.start(); // plain start — buffer fills
    await recorder.stop();
    expect(recorder.events.length).toBeGreaterThan(0);

    await recorder.start({ eagerHead: true }); // buffer is NOT empty
    await recorder.stop();
    expect(recorder.discardEagerIdleHead()).toBe(false);
    expect(recorder.events.length).toBeGreaterThan(0);
  });

  it('discardEagerIdleHead is consumed once', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/' });
    const recorder = new WebDriverClassicRecorder();
    await recorder.bind(driver);
    await recorder.inject();
    await recorder.start({ eagerHead: true });
    await recorder.stop();

    expect(recorder.discardEagerIdleHead()).toBe(true);
    expect(recorder.events).toEqual([]);
    expect(recorder.discardEagerIdleHead()).toBe(false);
  });
});
