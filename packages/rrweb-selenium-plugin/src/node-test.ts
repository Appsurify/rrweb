/**
 * node:test entry — import at the top of each test file
 * (`import '@appsurify-testmap/rrweb-selenium-plugin/node-test'`), or preload it
 * with `node --import @appsurify-testmap/rrweb-selenium-plugin/node-test --test`.
 *
 * Registers node:test root `beforeEach`/`afterEach` hooks that start/stop
 * recording per test, plus a root `after()` that bundles the report ZIP. node:test
 * has no separate teardown process, so a single import wires both.
 */
import { after } from 'node:test';
import { getActiveSessions } from './engine';
import { installNodeTestHooks } from './adapters/node-test';
import { FsReporter } from './reporter';
import { resolveConfig, buildRunnerInfo } from './config';

const cfg = resolveConfig();
const reporter = new FsReporter({ outputDir: cfg.outputDir });

installNodeTestHooks({
  getSessions: getActiveSessions,
  reporter,
  runnerInfo: buildRunnerInfo('node-test'),
});

// A root-level after() runs once, after all tests in this file's process.
after(async () => {
  await reporter.finalize();
});
