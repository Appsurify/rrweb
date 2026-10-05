import type { recordOptions } from '@appsurify-testmap/rrweb';
import type { RecorderEvent } from './recorder/types';

// recordingOpts reach the page through JSON.stringify, so functions, RegExp,
// Set and DOM references are dropped on the way. Only expose what survives.
type NonSerializableRecordOptionKeys =
  | 'emit'
  | 'excludeAttribute'
  | 'maskInputFn'
  | 'maskTextFn'
  | 'ignoreCSSAttributes'
  | 'hooks'
  | 'packFn'
  | 'plugins'
  | 'keepIframeSrcFn'
  | 'errorHandler'
  | 'customWindow'
  | 'customDocument';

export type TestmapRecordingOptions = Partial<
  Omit<recordOptions<RecorderEvent>, NonSerializableRecordOptionKeys>
>;

export type SettleBeforeStopOptions = {
  /** Wait until no request has been in flight for 500 ms. Default `true`. */
  networkIdle?: boolean;
  /** How long the DOM must stay free of mutations to count as settled. Default `300`. */
  domQuietMs?: number;
  /** Upper bound for the whole wait; the recorder then stops anyway, without an error. Default `5000`. */
  timeout?: number;
};

export type TestmapConfig = {
  outputReportDir?: string;
  recordingOpts?: TestmapRecordingOptions;
  /**
   * Before the recorder stops at the end of a test, wait for the page to
   * settle (network, then DOM) and, if the DOM changed since the last
   * FullSnapshot, take a final one — so the report ends with the loaded page
   * rather than its loading placeholders. Enabled by default; `false` restores
   * the stop-immediately behaviour.
   *
   * Runs during fixture teardown, after `afterEach` hooks. Playwright gives
   * after-hooks and teardown a separate budget (equal to the test timeout), so
   * the wait never eats into the test body's timeout; it does share that
   * budget with `afterEach` and other fixtures' teardown, and since Playwright
   * 1.60 it is included in the reported test duration. Worst case per test:
   * `timeout`. Skipped when the test did not pass or the page is closed.
   */
  settleBeforeStop?: false | SettleBeforeStopOptions;
};
