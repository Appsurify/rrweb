import { basename } from 'node:path';
import type {
  BrowserInfo,
  RecordingSession,
  Reporter,
  ReportMetadata,
  RunnerInfo,
} from '../types';

/**
 * Dependencies for the Mocha adapter — engine- and reporter-agnostic.
 * @public
 */
export interface MochaAdapterDeps {
  getSessions: () => RecordingSession[];
  reporter: Reporter;
  runnerInfo?: RunnerInfo;
}

/**
 * Shape of Mocha's root hook object (a subset of `Mocha.RootHookObject`).
 * @public
 */
export interface MochaRootHooks {
  beforeEach(this: unknown): Promise<void>;
  afterEach(this: unknown): Promise<void>;
}

function safeSessions(deps: MochaAdapterDeps): RecordingSession[] {
  try {
    return deps.getSessions() ?? [];
  } catch {
    return [];
  }
}

/**
 * Safely invokes a method on the Mocha `Test` (bound to `test`, so methods like
 * `fullTitle()`/`titlePath()` that read `this.parent` work) with a fallback.
 */
function safeCall<T>(test: unknown, method: string, fallback: T): T {
  const t = test as Record<string, unknown> | null | undefined;
  if (!t || typeof t[method] !== 'function') return fallback;
  try {
    return (t[method] as () => T)();
  } catch {
    return fallback;
  }
}

/**
 * Maps a Mocha `Test` (the after-each `this.currentTest`) to report metadata.
 * @public
 * @remarks
 * Defensive: tolerates missing fields and Mocha methods that throw.
 */
export function buildMochaMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  test: any,
  browser: BrowserInfo,
  runnerInfo?: RunnerInfo,
): ReportMetadata {
  const title: string = test?.title ?? 'unknown test';
  const suiteTitle: string = test?.parent?.title ?? '';
  const file: string = test?.file ?? test?.parent?.file ?? '';
  const specName = file ? basename(file) : 'unknown-spec';

  return {
    runner: { source: 'unknown', ...runnerInfo },
    spec: {
      name: specName,
      absolute: file || undefined,
      relative: file || undefined,
    },
    suite: {
      id: suiteTitle || 'root',
      title: suiteTitle,
      type: 'suite',
      root: !suiteTitle,
    },
    test: {
      title,
      fullTitle: safeCall<string>(test, 'fullTitle', title),
      titlePath: safeCall<string[] | undefined>(test, 'titlePath', undefined),
      state: test?.state,
      duration: test?.duration,
    },
    browser,
  };
}

/**
 * Builds Mocha root hooks that drive recording sessions per test.
 * @public
 * @remarks
 * Returned as regular (non-arrow) functions so Mocha can bind the test context to
 * `this` (read in `afterEach` as `this.currentTest`). All work is wrapped so a
 * recording fault never fails the user's test.
 */
export function createMochaHooks(deps: MochaAdapterDeps): MochaRootHooks {
  return {
    async beforeEach(this: unknown): Promise<void> {
      for (const session of safeSessions(deps)) {
        try {
          await session.beginTest();
        } catch {
          // never break the user's test
        }
      }
    },

    async afterEach(this: unknown): Promise<void> {
      const test = (this as { currentTest?: unknown })?.currentTest;
      for (const session of safeSessions(deps)) {
        try {
          const events = await session.endTest();
          const browser = await session.getBrowserInfo();
          const metadata = buildMochaMetadata(test, browser, deps.runnerInfo);
          const recorderInfo = session.getRecorderInfo?.();
          if (recorderInfo) metadata.runner.recorder = recorderInfo;
          await deps.reporter.saveReport({ events, metadata });
        } catch {
          // never break the user's test
        }
      }
    },
  };
}
