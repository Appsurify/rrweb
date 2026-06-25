/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { createMochaHooks, buildMochaMetadata } from '../src/adapters/mocha';
import { installJestHooks, buildJestMetadata } from '../src/adapters/jest';
import { installVitestHooks, buildVitestMetadata } from '../src/adapters/vitest';
import { buildNodeTestMetadata } from '../src/adapters/node-test';
import type { Report } from '../src/types';
import { makeFakeSession } from './helpers';

const browser = { name: 'chrome', family: 'chromium' };
const runnerInfo = { source: 'selenium', type: 'x' };

function captureReporter() {
  const saved: Report[] = [];
  return {
    saved,
    reporter: {
      async saveReport(r: Report) {
        saved.push(r);
      },
      async finalize() {},
    },
  };
}

describe('metadata builders', () => {
  it('buildMochaMetadata maps a Mocha test', () => {
    const test = {
      title: 'increments',
      parent: { title: 'Demo App', file: '/a/app.test.cjs' },
      file: '/a/app.test.cjs',
      fullTitle() {
        return 'Demo App increments';
      },
      titlePath() {
        return ['Demo App', 'increments'];
      },
      state: 'passed',
      duration: 7,
    };
    const m = buildMochaMetadata(test, browser, runnerInfo);
    expect(m.spec.name).toBe('app.test.cjs');
    expect(m.suite.title).toBe('Demo App');
    expect(m.suite.root).toBe(false);
    expect(m.test.title).toBe('increments');
    expect(m.test.fullTitle).toBe('Demo App increments');
    expect(m.test.state).toBe('passed');
    expect(m.runner.source).toBe('selenium');
  });

  it('buildJestMetadata maps expect.getState()', () => {
    const m = buildJestMetadata(
      { testPath: '/a/login.test.js', currentTestName: 'logs in' },
      browser,
      runnerInfo,
    );
    expect(m.spec.name).toBe('login.test.js');
    expect(m.suite.root).toBe(true);
    expect(m.test.title).toBe('logs in');
  });

  it('buildVitestMetadata maps a task with pass state', () => {
    const m = buildVitestMetadata(
      {
        name: 'works',
        suite: { name: 'Suite' },
        file: { filepath: '/a/x.test.ts', name: 'x.test.ts' },
        result: { state: 'pass', duration: 3 },
      },
      browser,
      runnerInfo,
    );
    expect(m.spec.name).toBe('x.test.ts');
    expect(m.suite.title).toBe('Suite');
    expect(m.test.state).toBe('passed');
    expect(m.test.duration).toBe(3);
  });

  it('buildVitestMetadata treats a file-level suite as no suite', () => {
    const m = buildVitestMetadata(
      {
        name: 'root test',
        suite: { name: 'x.test.ts' },
        file: { filepath: '/a/x.test.ts', name: 'x.test.ts' },
        result: { state: 'fail' },
      },
      browser,
      runnerInfo,
    );
    expect(m.suite.title).toBe('');
    expect(m.suite.root).toBe(true);
    expect(m.test.state).toBe('failed');
  });

  it('buildNodeTestMetadata maps a TestContext', () => {
    const m = buildNodeTestMetadata(
      { name: 'flows', filePath: '/a/app.test.mjs' },
      browser,
      runnerInfo,
    );
    expect(m.spec.name).toBe('app.test.mjs');
    expect(m.test.title).toBe('flows');
    expect(m.suite.root).toBe(true);
  });
});

describe('createMochaHooks', () => {
  it('drives beginTest/endTest and saves a report with recorder info', async () => {
    const { session, calls } = makeFakeSession();
    const { saved, reporter } = captureReporter();
    const hooks = createMochaHooks({
      getSessions: () => [session],
      reporter,
      runnerInfo: { source: 'selenium', type: 'mocha' },
    });

    await hooks.beforeEach.call({});
    expect(calls.begin).toBe(1);

    await hooks.afterEach.call({
      currentTest: { title: 'a test', parent: { title: 'Suite' }, file: '/x/s.test.cjs' },
    });
    expect(calls.end).toBe(1);
    expect(saved).toHaveLength(1);
    expect(saved[0].metadata.runner.type).toBe('mocha');
    expect(saved[0].metadata.runner.recorder?.scriptVersion).toContain('9.9.9-test');
    expect(saved[0].metadata.test.title).toBe('a test');
  });

  it('never throws when a session fails', async () => {
    const bad = {
      async beginTest() {
        throw new Error('x');
      },
      async endTest(): Promise<never[]> {
        throw new Error('y');
      },
      async getBrowserInfo() {
        return browser;
      },
    };
    const { reporter } = captureReporter();
    const hooks = createMochaHooks({ getSessions: () => [bad as any], reporter });
    await expect(hooks.beforeEach.call({})).resolves.toBeUndefined();
    await expect(hooks.afterEach.call({ currentTest: {} })).resolves.toBeUndefined();
  });
});

describe('global-hook installers', () => {
  function withFakeGlobals(
    expectState: any,
    fn: (run: { be: () => Promise<void>; ae: (ctx?: any) => Promise<void> }) => Promise<void>,
  ) {
    const g = globalThis as any;
    const saved = { be: g.beforeEach, ae: g.afterEach, ex: g.expect };
    let beFn: any, aeFn: any;
    g.beforeEach = (f: any) => (beFn = f);
    g.afterEach = (f: any) => (aeFn = f);
    g.expect = { getState: () => expectState };
    return Promise.resolve()
      .then(() => fn({ be: () => beFn(), ae: (ctx?: any) => aeFn(ctx) }))
      .finally(() => {
        g.beforeEach = saved.be;
        g.afterEach = saved.ae;
        g.expect = saved.ex;
      });
  }

  it('installJestHooks wires begin/end and saves a report', async () => {
    const { session, calls } = makeFakeSession();
    const { saved, reporter } = captureReporter();
    await withFakeGlobals(
      { testPath: '/a/app.test.js', currentTestName: 'does a thing' },
      async (run) => {
        installJestHooks({
          getSessions: () => [session],
          reporter,
          runnerInfo: { source: 'selenium', type: 'jest' },
        });
        await run.be();
        await run.ae();
      },
    );
    expect(calls.begin).toBe(1);
    expect(calls.end).toBe(1);
    expect(saved[0].metadata.runner.type).toBe('jest');
    expect(saved[0].metadata.test.title).toBe('does a thing');
    expect(saved[0].metadata.runner.recorder?.libVersion).toBeTruthy();
  });

  it('installVitestHooks reads ctx.task and saves a report', async () => {
    const { session } = makeFakeSession();
    const { saved, reporter } = captureReporter();
    await withFakeGlobals({}, async (run) => {
      installVitestHooks({
        getSessions: () => [session],
        reporter,
        runnerInfo: { source: 'selenium', type: 'vitest' },
      });
      await run.be();
      await run.ae({
        task: {
          name: 'works',
          file: { filepath: '/a/x.test.ts', name: 'x.test.ts' },
          suite: { name: 'Suite' },
          result: { state: 'pass', duration: 2 },
        },
      });
    });
    expect(saved[0].metadata.test.title).toBe('works');
    expect(saved[0].metadata.test.state).toBe('passed');
    expect(saved[0].metadata.runner.type).toBe('vitest');
  });
});
