import { basename } from 'node:path';
import type {
  BrowserInfo,
  RecordingSession,
  Reporter,
  ReportMetadata,
  RunnerInfo,
  TestInfo,
} from '../types';

/**
 * Dependencies for the Vitest adapter — engine- and reporter-agnostic.
 * @public
 */
export interface VitestAdapterDeps {
  getSessions: () => RecordingSession[];
  reporter: Reporter;
  runnerInfo?: RunnerInfo;
}

/** Result subset of a Vitest task we read. @public */
export interface VitestTaskResult {
  /** Vitest's raw state: "pass" | "fail" | "skip" | "todo" | … */
  state?: string;
  duration?: number;
}

/**
 * Subset of a Vitest task (the `ctx.task` passed to `afterEach`) we read.
 * @public
 */
export interface VitestTask {
  name?: string;
  suite?: { name?: string } | null;
  file?: { filepath?: string; name?: string } | null;
  result?: VitestTaskResult | null;
}

interface VitestExpectState {
  testPath?: string;
  currentTestName?: string;
  task?: VitestTask;
}

interface VitestGlobals {
  beforeEach?: (fn: (ctx?: unknown) => unknown) => void;
  afterEach?: (fn: (ctx?: unknown) => unknown) => void;
  expect?: { getState?: () => VitestExpectState };
}

function safeSessions(deps: VitestAdapterDeps): RecordingSession[] {
  try {
    return deps.getSessions() ?? [];
  } catch {
    return [];
  }
}

/** Maps Vitest's raw task state to the report's test-state vocabulary. */
function mapState(state?: string): TestInfo['state'] | undefined {
  switch (state) {
    case 'pass':
      return 'passed';
    case 'fail':
      return 'failed';
    case 'skip':
    case 'todo':
      return 'pending';
    default:
      return undefined;
  }
}

/**
 * Maps a Vitest task to report metadata.
 * @public
 * @remarks
 * Unlike jest-circus, Vitest passes the task (with `result.state`) to
 * `afterEach`, so this records real pass/fail state, suite title, and duration.
 */
export function buildVitestMetadata(
  task: VitestTask | undefined | null,
  browser: BrowserInfo,
  runnerInfo?: RunnerInfo,
): ReportMetadata {
  const testName = task?.name ?? 'unknown test';
  const filePath = task?.file?.filepath ?? '';
  const specName = filePath ? basename(filePath) : 'unknown-spec';
  // For a root-level test (no `describe`), Vitest's `task.suite` IS the file
  // task, whose name is the file path/name — treat that as "no suite".
  const rawSuite = task?.suite?.name ?? '';
  const suiteIsFile =
    rawSuite !== '' && (rawSuite === filePath || rawSuite === task?.file?.name);
  const suiteTitle = suiteIsFile ? '' : rawSuite;
  const fullTitle = suiteTitle ? `${suiteTitle} ${testName}` : testName;

  return {
    runner: { source: 'unknown', ...runnerInfo },
    spec: {
      name: specName,
      absolute: filePath || undefined,
      relative: filePath || undefined,
    },
    suite: {
      id: suiteTitle || 'root',
      title: suiteTitle,
      type: 'suite',
      root: !suiteTitle,
    },
    test: {
      title: testName,
      fullTitle,
      state: mapState(task?.result?.state),
      duration: task?.result?.duration,
    },
    browser,
  };
}

/**
 * Resolves the current Vitest task — preferring the hook context `ctx.task`,
 * then `expect.getState().task` (Vitest ≥4.1), then a minimal task built from
 * `getState()`'s name/path (older Vitest).
 */
function resolveTask(ctx: unknown, g: VitestGlobals): VitestTask | undefined {
  const fromCtx = (ctx as { task?: VitestTask } | undefined)?.task;
  if (fromCtx) return fromCtx;
  const state = typeof g.expect?.getState === 'function' ? g.expect.getState() : undefined;
  if (state?.task) return state.task;
  if (state?.currentTestName || state?.testPath) {
    return { name: state.currentTestName, file: { filepath: state.testPath } };
  }
  return undefined;
}

/**
 * Registers Vitest `beforeEach`/`afterEach` hooks that drive recording sessions.
 * @public
 * @remarks
 * Requires `globals: true` in the Vitest config. Import this from a file listed
 * in `setupFiles`. All work is wrapped so a recording fault never fails the
 * user's test.
 */
export function installVitestHooks(deps: VitestAdapterDeps): void {
  const g = globalThis as unknown as VitestGlobals;
  if (typeof g.beforeEach !== 'function' || typeof g.afterEach !== 'function') {
    throw new Error(
      '[testmap] installVitestHooks must run in a Vitest environment with globals: true (setupFiles)',
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

  g.afterEach(async (ctx?: unknown) => {
    let task: VitestTask | undefined;
    try {
      task = resolveTask(ctx, g);
    } catch {
      // metadata unavailable — never break the user's test
    }
    for (const session of safeSessions(deps)) {
      try {
        const events = await session.endTest();
        const browser = await session.getBrowserInfo();
        const metadata = buildVitestMetadata(task, browser, deps.runnerInfo);
        const recorderInfo = session.getRecorderInfo?.();
        if (recorderInfo) metadata.runner.recorder = recorderInfo;
        await deps.reporter.saveReport({ events, metadata });
      } catch {
        // never break the user's test
      }
    }
  });
}
