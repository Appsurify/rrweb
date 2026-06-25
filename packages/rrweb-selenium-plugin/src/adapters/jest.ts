import { basename } from 'node:path';
import type {
  BrowserInfo,
  RecordingSession,
  Reporter,
  ReportMetadata,
  RunnerInfo,
} from '../types';

/**
 * Dependencies for the Jest adapter — engine- and reporter-agnostic.
 * @public
 */
export interface JestAdapterDeps {
  getSessions: () => RecordingSession[];
  reporter: Reporter;
  runnerInfo?: RunnerInfo;
}

/** Subset of Jest's `expect.getState()` we read. @public */
export interface JestState {
  testPath?: string;
  currentTestName?: string;
}

interface JestGlobals {
  beforeEach?: (fn: () => unknown) => void;
  afterEach?: (fn: () => unknown) => void;
  expect?: { getState?: () => JestState };
}

function safeSessions(deps: JestAdapterDeps): RecordingSession[] {
  try {
    return deps.getSessions() ?? [];
  } catch {
    return [];
  }
}

/**
 * Maps Jest's `expect.getState()` to report metadata.
 * @public
 * @remarks
 * jest-circus does not expose pass/fail or a clean suite/test split to
 * after-each hooks, so `test.state` is omitted and the full `currentTestName`
 * is used as the test title (best-effort, documented limitation).
 */
export function buildJestMetadata(
  state: JestState,
  browser: BrowserInfo,
  runnerInfo?: RunnerInfo,
): ReportMetadata {
  const testPath = state?.testPath ?? '';
  const specName = testPath ? basename(testPath) : 'unknown-spec';
  const testName = state?.currentTestName ?? 'unknown test';

  return {
    runner: { source: 'unknown', ...runnerInfo },
    spec: {
      name: specName,
      absolute: testPath || undefined,
      relative: testPath || undefined,
    },
    suite: { id: 'root', title: '', type: 'suite', root: true },
    test: { title: testName, fullTitle: testName },
    browser,
  };
}

/**
 * Registers Jest `beforeEach`/`afterEach` hooks that drive recording sessions.
 * @public
 * @remarks
 * Import this from a module listed in Jest's `setupFilesAfterEnv` — Jest injects
 * `beforeEach`/`afterEach`/`expect` as globals there. All work is wrapped so a
 * recording fault never fails the user's test.
 */
export function installJestHooks(deps: JestAdapterDeps): void {
  const g = globalThis as unknown as JestGlobals;
  if (typeof g.beforeEach !== 'function' || typeof g.afterEach !== 'function') {
    throw new Error(
      '[testmap] installJestHooks must run in a Jest environment (setupFilesAfterEnv)',
    );
  }

  g.beforeEach(async () => {
    for (const session of safeSessions(deps)) {
      try {
        await session.beginTest();
      } catch {
        // never break the user's test
      }
    }
  });

  g.afterEach(async () => {
    const state: JestState =
      typeof g.expect?.getState === 'function' ? g.expect.getState() : {};
    for (const session of safeSessions(deps)) {
      try {
        const events = await session.endTest();
        const browser = await session.getBrowserInfo();
        const metadata = buildJestMetadata(state, browser, deps.runnerInfo);
        const recorderInfo = session.getRecorderInfo?.();
        if (recorderInfo) metadata.runner.recorder = recorderInfo;
        await deps.reporter.saveReport({ events, metadata });
      } catch {
        // never break the user's test
      }
    }
  });
}
