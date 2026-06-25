/**
 * Vitest entry — wired via `setupFiles: ['@appsurify-testmap/rrweb-selenium-plugin/vitest']`.
 *
 * Requires `globals: true`. Importing this module registers Vitest
 * `beforeEach`/`afterEach` hooks that start/stop recording per test. Pair with
 * `@appsurify-testmap/rrweb-selenium-plugin/vitest-teardown` in `globalSetup` to
 * bundle the report ZIP.
 */
import { getActiveSessions } from './engine';
import { installVitestHooks } from './adapters/vitest';
import { FsReporter } from './reporter';
import { resolveConfig, buildRunnerInfo } from './config';

const cfg = resolveConfig();
const reporter = new FsReporter({ outputDir: cfg.outputDir });

installVitestHooks({
  getSessions: getActiveSessions,
  reporter,
  runnerInfo: buildRunnerInfo('vitest'),
});
