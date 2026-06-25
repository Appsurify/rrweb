/**
 * Jest entry — wired via `setupFilesAfterEnv: ['@appsurify-testmap/rrweb-selenium-plugin/jest']`.
 *
 * Importing this module registers Jest `beforeEach`/`afterEach` hooks that
 * start/stop recording per test. Pair with
 * `@appsurify-testmap/rrweb-selenium-plugin/jest-teardown` in `globalTeardown` to
 * bundle the report ZIP.
 */
import { getActiveSessions } from './engine';
import { installJestHooks } from './adapters/jest';
import { FsReporter } from './reporter';
import { resolveConfig, buildRunnerInfo } from './config';

const cfg = resolveConfig();
const reporter = new FsReporter({ outputDir: cfg.outputDir });

installJestHooks({
  getSessions: getActiveSessions,
  reporter,
  runnerInfo: buildRunnerInfo('jest'),
});
