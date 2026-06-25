import type { recordOptions, eventWithTime } from './core/types';
import type { RunnerInfo } from './types';
import { DEFAULT_OUTPUT_DIR } from './reporter';

/**
 * User-facing configuration for the Selenium integration.
 * @public
 */
export interface SeleniumPluginOptions {
  /** Directory reports are written under (default `test-results/selenium/ui`). */
  outputDir?: string;
  /** rrweb record options forwarded to the recorder. */
  recordOptions?: recordOptions<eventWithTime>;
}

/**
 * Resolved config (every consumed value present).
 * @public
 */
export type ResolvedConfig = Required<Pick<SeleniumPluginOptions, 'outputDir'>> &
  SeleniumPluginOptions;

/**
 * Resolves config from explicit values, then `TESTMAP_OUTPUT_DIR`, then defaults.
 * @public
 */
export function resolveConfig(config: SeleniumPluginOptions = {}): ResolvedConfig {
  return {
    ...config,
    outputDir: config.outputDir ?? process.env.TESTMAP_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR,
  };
}

/**
 * Builds runner metadata for a given test runner.
 * @public
 * @remarks
 * `source` is fixed to `"selenium"`; adapters merge per-test fields and the
 * recorder versions on top of this.
 */
export function buildRunnerInfo(type: string): RunnerInfo {
  return {
    source: 'selenium',
    type,
    // `version` is required by the backend converter (UITestRunnerData). The
    // Selenium runner executes under Node, so the Node runtime version is the
    // most reliable always-available version signal.
    version: process.version,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };
}
