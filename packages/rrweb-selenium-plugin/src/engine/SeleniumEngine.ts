import type {
  recordOptions,
  eventWithTime,
  Recorder,
  RecorderEvent,
  Engine,
} from '../core/types';
import type { BrowserInfo, RecorderInfo, RecordingSession } from '../types';
import { NAVIGATION_CUSTOM_EVENT_TAG } from '../core/AbstractRecorder';
import { WebDriverClassicRecorder } from '../recorder/WebDriverClassicRecorder';
import type { SeleniumDriver, SeleniumEngineOptions } from './types';
import { readBrowserInfo } from './browserInfo';
import { deregisterEngine } from './registry';

const noop = (): void => {};
const DEFAULT_STABILIZE_MS = 800;

function isRealUrl(url: string): boolean {
  return !!url && !url.startsWith('about:') && !url.startsWith('data:');
}

/**
 * Per-driver Selenium engine: owns a fresh recorder per test and re-establishes
 * recording across navigations.
 * @public
 * @remarks
 * Implements {@link RecordingSession} so test-runner adapters can drive it
 * without knowing about Selenium. Recording failures are swallowed so they never
 * break the user's tests.
 */
export class SeleniumEngine
  implements Engine<SeleniumDriver>, RecordingSession
{
  private readonly _driver: SeleniumDriver;
  private readonly _recordOptions?: recordOptions<eventWithTime>;
  private readonly _stabilizeMs: number;
  private _recorder?: WebDriverClassicRecorder;
  private _browserInfo?: BrowserInfo;
  private _recorderInfo?: RecorderInfo;
  private _navDepth = 0;

  constructor(driver: SeleniumDriver, options: SeleniumEngineOptions = {}) {
    this._driver = driver;
    this._recordOptions = options.recordOptions;
    this._stabilizeMs = options.stabilizeMs ?? DEFAULT_STABILIZE_MS;
  }

  /**
   * The current recording session's recorder.
   * @remarks
   * The bound driver is a {@link SeleniumDriver} at runtime; the recorder is
   * typed to its structural `WebDriver` subset, so this widening is sound.
   */
  get recorder(): Recorder<SeleniumDriver> | undefined {
    return this._recorder as unknown as Recorder<SeleniumDriver> | undefined;
  }

  get target(): SeleniumDriver | undefined | null {
    return this._driver;
  }

  // ============================================
  // RecordingSession
  // ============================================

  /** Starts a fresh recording for the current test. */
  async beginTest(): Promise<void> {
    // Liveness probe: a dead/abandoned driver (e.g. a prior test's session that
    // was never quit and now lingers in the registry) self-evicts here rather
    // than producing phantom empty reports.
    let href: string;
    try {
      href = await this._driver.getCurrentUrl();
    } catch {
      deregisterEngine(this._driver);
      this._recorder = undefined;
      return;
    }

    this._recorder = new WebDriverClassicRecorder(
      this._recordOptions ? { recordOptions: this._recordOptions } : undefined,
    );
    await this._recorder.bind(this._driver);
    // Eager-start when already on a real page (e.g. navigated in a before
    // hook). The page may equally be a leftover from the previous test —
    // unknowable here — so the start is marked eagerHead: if the test's first
    // wrapped navigation arrives before any interaction, the head segment is
    // dropped there (see aroundNavigation).
    if (isRealUrl(href)) {
      await this._recorder.inject().catch(noop);
      await this._recorder.start({ eagerHead: true }).catch(noop);
      this._captureRecorderInfo();
    }
  }

  /** Stops recording and returns the captured events. */
  async endTest(): Promise<readonly RecorderEvent[]> {
    const recorder = this._recorder;
    if (!recorder) return [];
    if (recorder.status === 'recording') {
      await recorder.waitForRecorderStabilization(this._stabilizeMs).catch(noop);
      await recorder.stop().catch(noop);
    }
    this._captureRecorderInfo();
    return recorder.events;
  }

  /** Reads (and caches) browser metadata from the driver. */
  async getBrowserInfo(): Promise<BrowserInfo> {
    if (!this._browserInfo) {
      this._browserInfo = await readBrowserInfo(this._driver);
    }
    return this._browserInfo;
  }

  /** Recorder runtime versions captured during the session, if available. */
  getRecorderInfo(): RecorderInfo | undefined {
    return this._recorderInfo;
  }

  private _captureRecorderInfo(): void {
    const recorder = this._recorder;
    if (!recorder) return;
    try {
      this._recorderInfo = {
        scriptVersion: recorder.getScriptVersion(),
        libVersion: recorder.getLibVersion(),
      };
    } catch {
      // best-effort
    }
  }

  // ============================================
  // Navigation re-injection (called by the navigation patch)
  // ============================================

  /**
   * Wraps a navigation: drains+stops the recorder on the outgoing page, runs the
   * real navigation, then re-injects rrweb and marks a `testmap:navigation` event.
   * @remarks
   * A re-entrancy depth guard ensures only the OUTERMOST navigation re-injects —
   * Selenium's `get(url)` delegates to `navigate().to(url)`, so both would
   * otherwise fire.
   */
  async aroundNavigation<T>(
    kind: string,
    info: string,
    thunk: () => Promise<T>,
  ): Promise<T> {
    this._navDepth++;
    const outermost = this._navDepth === 1;
    try {
      const recorder = this._recorder;
      if (outermost && recorder && recorder.status === 'recording') {
        await recorder.waitForRecorderStabilization(this._stabilizeMs).catch(noop);
        await recorder.stop().catch(noop);
        // First wrapped navigation: if the buffer is still just the eager
        // test-begin segment with no interactions, it captured the previous
        // test's page — drop it so the report starts at this destination.
        recorder.discardEagerIdleHead();
      }

      const result = await thunk(); // real navigation — its errors propagate

      if (outermost && recorder) {
        await recorder.inject().catch(noop);
        await recorder.start().catch(noop);
        this._captureRecorderInfo();
        const url = (await this._safeCurrentUrl()) || info;
        await recorder
          .addCustomEvent(NAVIGATION_CUSTOM_EVENT_TAG, { type: kind, url })
          .catch(noop);
      }
      return result;
    } finally {
      this._navDepth--;
    }
  }

  private async _safeCurrentUrl(): Promise<string> {
    try {
      return await this._driver.getCurrentUrl();
    } catch {
      return '';
    }
  }
}
