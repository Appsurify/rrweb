/**
 * Mocha entry — wired via `.mocharc` `require: ['@appsurify-testmap/rrweb-selenium-plugin/mocha']`.
 *
 * Exports Mocha root hooks (`mochaHooks`) that start/stop recording per test, and
 * a global teardown (`mochaGlobalTeardown`) that bundles the per-test reports into
 * a ZIP after the run.
 */
import { getActiveSessions } from './engine';
import { createMochaHooks } from './adapters/mocha';
import { FsReporter, prepareOutputDir } from './reporter';
import { resolveConfig, buildRunnerInfo } from './config';

const cfg = resolveConfig();
const reporter = new FsReporter({ outputDir: cfg.outputDir });

export const mochaHooks = createMochaHooks({
  getSessions: getActiveSessions,
  reporter,
  runnerInfo: buildRunnerInfo('mocha'),
});

/**
 * Mocha global fixture — wipes the output dir once before the run so reports are
 * overwritten, not appended (matching the Playwright/Cypress plugins).
 */
export async function mochaGlobalSetup(): Promise<void> {
  prepareOutputDir(cfg.outputDir);
}

/** Mocha global fixture — bundles the report ZIP once after the run. */
export async function mochaGlobalTeardown(): Promise<void> {
  await reporter.finalize();
}
