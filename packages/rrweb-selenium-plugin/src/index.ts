/**
 * `@appsurify-testmap/rrweb-selenium-plugin` — rrweb recording for Selenium v4.
 *
 * Usage (Mocha): add `--require @appsurify-testmap/rrweb-selenium-plugin/mocha`
 * (in `.mocharc`), then `attach(driver)` once where you build the driver.
 *
 * Usage (Jest): add `@appsurify-testmap/rrweb-selenium-plugin/jest` to
 * `setupFilesAfterEnv` (and `@appsurify-testmap/rrweb-selenium-plugin/jest-teardown`
 * to `globalTeardown`), then `attach(driver)` once.
 *
 * The same `attach(driver)` call is the only line a consumer needs in their tests
 * for every runner — see the per-runner entry points for the wiring.
 *
 * @packageDocumentation
 */

// Engine / consumer API
export {
  attach,
  enableAutoAttach,
  getActiveSessions,
  getEngineForDriver,
  SeleniumEngine,
  readBrowserInfo,
} from './engine';
export type {
  SeleniumDriver,
  SeleniumNavigation,
  SeleniumEngineOptions,
  BuilderLike,
} from './engine';

// Recorder (advanced / direct use)
export { WebDriverClassicRecorder } from './recorder';
export type { WebDriver, WebDriverIOLike, BindableTarget } from './recorder';

// Core (advanced)
export { AbstractRecorder, defaultRecordOptions, recorderHooks } from './core';
export type {
  Recorder,
  RecorderStatus,
  RecorderEvent,
  Engine,
  recordOptions,
  eventWithTime,
} from './core';

// Config
export { resolveConfig, buildRunnerInfo } from './config';
export type { SeleniumPluginOptions, ResolvedConfig } from './config';

// Reporter
export {
  FsReporter,
  bundleReports,
  prepareOutputDir,
  buildZip,
  collectJsonFiles,
  sanitizeFileNamePart,
  writeFileAtomic,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_ZIP_FILE,
} from './reporter';
export type { FsReporterOptions } from './reporter';

// Report types
export type {
  Report,
  ReportMetadata,
  Reporter,
  RecordingSession,
  RecorderInfo,
  RunnerInfo,
  SpecInfo,
  SuiteInfo,
  TestInfo,
  BrowserInfo,
} from './types';
