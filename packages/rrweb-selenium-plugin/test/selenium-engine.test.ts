import { describe, it, expect } from 'vitest';
import { SeleniumEngine } from '../src/engine/SeleniumEngine';
import { FakeDriver } from './helpers';

describe('SeleniumEngine', () => {
  it('records a test: beginTest injects+starts, endTest returns events', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 20 });

    await engine.beginTest();
    const events = await engine.endTest();

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.every((e) => e.id !== undefined)).toBe(true);
  });

  it('exposes recorder version info after recording', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 20 });
    await engine.beginTest();
    await engine.endTest();
    const info = engine.getRecorderInfo();
    expect(info?.scriptVersion).toBe('@appsurify-testmap/rrweb-record:9.9.9-test');
    expect(info?.libVersion).toMatch(/^@appsurify-testmap\/rrweb:/);
  });

  it('reads and caches browser info', async () => {
    const driver = new FakeDriver();
    const engine = new SeleniumEngine(driver);
    const info = await engine.getBrowserInfo();
    expect(info.name).toBe('chrome');
    expect(info.family).toBe('chromium');
  });

  it('self-evicts a dead driver in beginTest', async () => {
    const driver = new FakeDriver();
    driver.getCurrentUrl = async () => {
      throw new Error('session deleted');
    };
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();
    expect(await engine.endTest()).toEqual([]);
  });

  it('aroundNavigation re-records and marks a navigation custom event', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 20 });
    await engine.beginTest();

    // Outer navigation: stops, navigates, re-injects, adds testmap:navigation.
    await engine.aroundNavigation('get', 'https://app.test/about', async () => {
      await driver.get('https://app.test/about');
    });

    const events = await engine.endTest();
    const nav = events.find(
      (e) => e.type === 5 && (e.data as { tag?: string })?.tag === 'testmap:navigation',
    );
    expect(nav).toBeDefined();
    expect((nav?.data as { payload?: { type?: string } })?.payload?.type).toBe('get');
  });

  it('only the outermost navigation re-injects (depth guard)', async () => {
    const driver = new FakeDriver({ href: 'https://app.test/' });
    const engine = new SeleniumEngine(driver, { stabilizeMs: 10 });
    await engine.beginTest();

    let innerRan = false;
    await engine.aroundNavigation('get', 'u', async () => {
      // Nested navigation (get → navigate().to) must not double re-inject.
      await engine.aroundNavigation('to', 'u', async () => {
        innerRan = true;
      });
    });
    expect(innerRan).toBe(true);
    await engine.endTest();
  });
});
