import { describe, it, expect } from 'vitest';
import { WebDriverClassicRecorder } from '../src/recorder/WebDriverClassicRecorder';
import { FakeDriver } from './helpers';

function makeRecorder() {
  // Pass non-empty UMD sources so the fake injection path runs (the content is
  // irrelevant — FakeDriver simulates the bundle attaching to window).
  return new WebDriverClassicRecorder({
    rrwebUmdSource: 'FAKE_RRWEB_UMD',
    seqPluginUmdSource: 'FAKE_SEQ_UMD',
  });
}

describe('WebDriverClassicRecorder', () => {
  it('binds, injects and reports the script/lib versions', async () => {
    const driver = new FakeDriver();
    const r = makeRecorder();
    await r.bind(driver);
    expect(r.status).toBe('bound');
    await r.inject();
    expect(r.status).toBe('injected');
    expect(r.getScriptVersion()).toBe('@appsurify-testmap/rrweb-record:9.9.9-test');
    expect(r.getLibVersion()).toMatch(/^@appsurify-testmap\/rrweb:/);
    await r.stop().catch(() => {});
  });

  it('captures events (with sequential ids) via the stop drain', async () => {
    const driver = new FakeDriver();
    const r = makeRecorder();
    await r.bind(driver);
    await r.inject();
    await r.start();
    expect(await r.isRecording()).toBe(true);
    await r.stop();

    const events = r.events;
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.every((e) => e.id !== undefined)).toBe(true);
    // First emitted event was a checkout meta → opens a new segment.
    expect(r.segmentCount).toBeGreaterThanOrEqual(2);
    expect(await r.isRecording()).toBe(false);
  });

  it('drains the buffer on the polling interval (no stop needed)', async () => {
    const driver = new FakeDriver();
    const r = makeRecorder();
    await r.bind(driver);
    await r.inject();
    await r.start();
    await new Promise((res) => setTimeout(res, 160));
    expect(r.events.length).toBeGreaterThanOrEqual(3);
    await r.stop();
  });

  it('forwards custom events into the recording', async () => {
    const driver = new FakeDriver();
    const r = makeRecorder();
    await r.bind(driver);
    await r.inject();
    await r.start();
    await r.addCustomEvent('testmap:command', { name: 'click' });
    await r.stop();
    const custom = r.events.find(
      (e) => e.type === 5 && (e.data as { tag?: string })?.tag === 'testmap:command',
    );
    expect(custom).toBeDefined();
  });

  it('self-heals after an un-wrapped full navigation (link click)', async () => {
    const driver = new FakeDriver();
    const r = makeRecorder();
    await r.bind(driver);
    await r.inject();
    await r.start();
    const beforeIds = new Set(r.events.map((e) => e.id));

    // A link click navigates the whole document — rrweb is gone and neither
    // aroundNavigation nor a DCL listener fired. The polling pump must notice
    // and re-inject on the new page.
    driver.simulateClickNavigation('https://destination.test/');
    await new Promise((res) => setTimeout(res, 260)); // let the 100ms poll self-heal
    await r.stop();

    // The destination page was captured fresh (new events appeared).
    expect(r.events.length).toBeGreaterThan(beforeIds.size);
    // The self-heal emits a testmap:navigation marker with type 'auto'.
    const autoNav = r.events.find(
      (e) =>
        e.type === 5 &&
        (e.data as { tag?: string })?.tag === 'testmap:navigation' &&
        (e.data as { payload?: { type?: string } })?.payload?.type === 'auto',
    );
    expect(autoNav, 'self-heal should mark an auto navigation').toBeDefined();
  });

  it('re-injects cleanly after a navigation reset', async () => {
    const driver = new FakeDriver();
    const r = makeRecorder();
    await r.bind(driver);
    await r.inject();
    await r.start();
    await r.stop();
    // Simulate navigation wiping the page globals.
    await driver.get('https://next.test/');
    await r.inject();
    await r.start();
    await r.stop();
    expect(r.events.length).toBeGreaterThanOrEqual(6);
  });
});
