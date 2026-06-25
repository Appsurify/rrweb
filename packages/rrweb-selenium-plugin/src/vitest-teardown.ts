/**
 * Vitest global setup/teardown — referenced via `globalSetup` in the vitest
 * config. These run in the main Vitest process (separate from the `setupFiles`
 * test workers): `setup()` wipes the output dir once before the run (so reports
 * are overwritten, not appended, matching the Playwright/Cypress plugins) and
 * `teardown()` bundles the per-test report files into a ZIP after all tests.
 */
import { bundleReports, prepareOutputDir } from './reporter';
import { resolveConfig } from './config';

export async function setup(): Promise<void> {
  const cfg = resolveConfig();
  try {
    prepareOutputDir(cfg.outputDir);
  } catch (error) {
    // never abort the run over a cleanup hiccup
    // eslint-disable-next-line no-console
    console.warn('[ui-coverage] vitest-setup prepareOutputDir failed:', error);
  }
}

export async function teardown(): Promise<void> {
  const cfg = resolveConfig();
  try {
    bundleReports(cfg.outputDir);
  } catch (error) {
    // never fail the run after tests have passed
    // eslint-disable-next-line no-console
    console.warn('[ui-coverage] vitest-teardown bundleReports failed:', error);
  }
}
