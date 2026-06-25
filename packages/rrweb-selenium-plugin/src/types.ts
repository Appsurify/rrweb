import type { RecorderEvent } from './core/types';

export type { RecorderEvent };

/**
 * Information about the test runner that produced a recording.
 * @public
 * @remarks
 * `source` identifies the automation (`"selenium"`); other fields are best-effort
 * and may be omitted by a given adapter.
 */
export interface RunnerInfo {
  source: string;
  type?: string;
  version?: string;
  platform?: string;
  arch?: string;
  nodeVersion?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  timestamp?: string;
  timestampMs?: number;
  recorder?: RecorderInfo;
}

/**
 * Versions of the recorder runtime captured into a report.
 * @public
 */
export interface RecorderInfo {
  scriptVersion?: string;
  libVersion?: string;
}

/**
 * Information about the spec file a test belongs to.
 * @public
 */
export interface SpecInfo {
  name: string;
  absolute?: string;
  relative?: string;
  specType?: string;
  fileName?: string;
  id?: string;
}

/**
 * Information about the suite (describe block) containing a test.
 * @public
 */
export interface SuiteInfo {
  id?: string;
  title: string;
  type?: string;
  fullTitle?: string;
  root?: boolean;
  file?: string | null;
}

/**
 * Information about a single test.
 * @public
 * @remarks
 * `state` is best-effort; some runners (e.g. jest-circus, node:test) do not
 * expose pass/fail to after-each hooks.
 */
export interface TestInfo {
  id?: string;
  title: string;
  fullTitle?: string;
  titlePath?: string[];
  state?: 'passed' | 'failed' | 'pending' | string;
  duration?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: { message: string; stack?: string; name?: string };
}

/**
 * Information about the browser a recording was captured in.
 * @public
 */
export interface BrowserInfo {
  name: string;
  version?: string;
  family?: string;
  platformName?: string;
  capabilities?: Record<string, unknown>;
  viewport?: { width: number; height: number };
}

/**
 * Metadata bundled with a recording's events.
 * @public
 * @remarks
 * Matches the envelope produced by the Playwright and Cypress plugins:
 * `{ runner, spec, suite, test, browser }`.
 */
export interface ReportMetadata {
  runner: RunnerInfo;
  spec: SpecInfo;
  suite: SuiteInfo;
  test: TestInfo;
  browser: BrowserInfo;
}

/**
 * A single per-test report: the rrweb events plus their metadata.
 * @public
 */
export interface Report {
  events: readonly RecorderEvent[];
  metadata: ReportMetadata;
}

/**
 * Sink that persists reports.
 * @public
 * @remarks
 * `saveReport` writes one report (per test/browser); `finalize` is an optional
 * teardown hook (e.g. to bundle per-test files into a ZIP). Implementations must
 * never throw into the test runner.
 */
export interface Reporter {
  saveReport(report: Report): Promise<void>;
  finalize?(): Promise<void>;
}

/**
 * A per-driver recording session driven by test-runner adapters.
 * @public
 * @remarks
 * Decouples adapters (Mocha/Jest/…) from the concrete engine: an adapter calls
 * `beginTest` in before-each and `endTest`/`getBrowserInfo` in after-each, then
 * hands the events to a {@link Reporter}.
 */
export interface RecordingSession {
  beginTest(): Promise<void>;
  endTest(): Promise<readonly RecorderEvent[]>;
  getBrowserInfo(): Promise<BrowserInfo>;
  /** Recorder runtime versions, if a recording has been established. */
  getRecorderInfo?(): RecorderInfo | undefined;
}
