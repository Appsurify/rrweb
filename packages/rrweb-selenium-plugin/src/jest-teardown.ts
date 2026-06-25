/**
 * Jest global teardown — wired via
 * `globalTeardown: '@appsurify-testmap/rrweb-selenium-plugin/jest-teardown'`.
 *
 * Runs in Jest's teardown context (a separate process from the tests), so it
 * bundles the per-test report files on disk into a ZIP.
 */
import { bundleReports } from './reporter';
import { resolveConfig } from './config';

export default async function jestGlobalTeardown(): Promise<void> {
  const cfg = resolveConfig();
  try {
    bundleReports(cfg.outputDir);
  } catch (error) {
    // never fail the run after tests have passed
    // eslint-disable-next-line no-console
    console.warn('[ui-coverage] jest-teardown bundleReports failed:', error);
  }
}
