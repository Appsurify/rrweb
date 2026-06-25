/**
 * Jest global setup — wired via
 * `globalSetup: '@appsurify-testmap/rrweb-selenium-plugin/jest-setup'`.
 *
 * Runs once in Jest's main process before any worker, so it wipes the output dir
 * so reports are overwritten, not appended (matching the Playwright/Cypress
 * plugins). Pair with `@appsurify-testmap/rrweb-selenium-plugin/jest-teardown`
 * in `globalTeardown` to bundle the ZIP afterwards.
 */
import { prepareOutputDir } from './reporter';
import { resolveConfig } from './config';

export default async function jestGlobalSetup(): Promise<void> {
  const cfg = resolveConfig();
  try {
    prepareOutputDir(cfg.outputDir);
  } catch (error) {
    // never abort the run over a cleanup hiccup
    // eslint-disable-next-line no-console
    console.warn('[ui-coverage] jest-setup prepareOutputDir failed:', error);
  }
}
