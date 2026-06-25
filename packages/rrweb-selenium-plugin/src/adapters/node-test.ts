import { basename } from 'node:path';
import { beforeEach, afterEach } from 'node:test';
import type {
  BrowserInfo,
  RecordingSession,
  Reporter,
  ReportMetadata,
  RunnerInfo,
} from '../types';

/**
 * Dependencies for the node:test adapter — engine- and reporter-agnostic.
 * @public
 */
export interface NodeTestAdapterDeps {
  getSessions: () => RecordingSession[];
  reporter: Reporter;
  runnerInfo?: RunnerInfo;
}

/**
 * Subset of node:test's `TestContext` (passed to before/after hooks) we read.
 * `filePath` is Node ≥22; older versions omit it (spec falls back to
 * "unknown-spec").
 * @public
 */
export interface NodeTestContext {
  name?: string;
  filePath?: string;
}

function safeSessions(deps: NodeTestAdapterDeps): RecordingSession[] {
  try {
    return deps.getSessions() ?? [];
  } catch {
    return [];
  }
}

/**
 * Maps a node:test `TestContext` to report metadata.
 * @public
 * @remarks
 * node:test does not expose pass/fail to after-each hooks, so `test.state` is
 * omitted (best-effort, documented limitation).
 */
export function buildNodeTestMetadata(
  ctx: NodeTestContext | undefined | null,
  browser: BrowserInfo,
  runnerInfo?: RunnerInfo,
): ReportMetadata {
  const testName = ctx?.name ?? 'unknown test';
  const filePath = ctx?.filePath ?? '';
  const specName = filePath ? basename(filePath) : 'unknown-spec';

  return {
    runner: { source: 'unknown', ...runnerInfo },
    spec: {
      name: specName,
      absolute: filePath || undefined,
      relative: filePath || undefined,
    },
    suite: { id: 'root', title: '', type: 'suite', root: true },
    test: { title: testName, fullTitle: testName },
    browser,
  };
}

/**
 * Registers node:test root `beforeEach`/`afterEach` hooks that drive recording
 * sessions.
 * @public
 * @remarks
 * Registered at the module's top level, these root hooks apply to every test in
 * the file. All work is wrapped so a recording fault never fails the user's test.
 * Aggregate reporting (the ZIP) is handled separately by the integration entry.
 */
export function installNodeTestHooks(deps: NodeTestAdapterDeps): void {
  beforeEach(async () => {
    for (const session of safeSessions(deps)) {
      try {
        await session.beginTest();
      } catch {
        // never break the user's test
      }
    }
  });

  afterEach(async (t: NodeTestContext) => {
    for (const session of safeSessions(deps)) {
      try {
        const events = await session.endTest();
        const browser = await session.getBrowserInfo();
        const metadata = buildNodeTestMetadata(t, browser, deps.runnerInfo);
        const recorderInfo = session.getRecorderInfo?.();
        if (recorderInfo) metadata.runner.recorder = recorderInfo;
        await deps.reporter.saveReport({ events, metadata });
      } catch {
        // never break the user's test
      }
    }
  });
}
