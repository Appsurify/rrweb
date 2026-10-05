import {
  test as base,
  expect,
} from '@playwright/test';
import type {
  ConsoleMessage,
} from '@playwright/test';
import RRWebRecorder from './recorder';
import type { RecorderEvent } from './recorder/types';
import defaultRecordOptions from './recorder';

import {
  createTestrunContext,
  saveRRWebReport,
  waitForNextRAF,
} from './utils';
import {
  getCurrentTestContext,
  setCurrentTestContext,
} from './runtime';
import {
  NetworkTracker,
  resolveSettleOptions,
  settlePage,
} from './settle';

import type {
  TestmapConfig,
  TestmapRecordingOptions,
  SettleBeforeStopOptions,
} from './config';

export type { TestmapConfig, TestmapRecordingOptions, SettleBeforeStopOptions };

declare module '@playwright/test' {
  interface PlaywrightTestOptions {
    testmap?: TestmapConfig;
  }
}


const test = base.extend<{}>({
  browser: async ({ browser }, use) => {
    await use(browser);
  },

  context: async ({ browser }, use, testInfo) => {
    const context = await browser.newContext();
    const testRunContext = createTestrunContext(browser, testInfo);
    setCurrentTestContext(testInfo.testId, testRunContext);
    await use(context);
    await context.close();
  },

  page: async ({ page }, use, testInfo) => {

    const testmapConfig: TestmapConfig = testInfo.project.use.testmap ?? {};
    const settleOptions = resolveSettleOptions(testmapConfig.settleBeforeStop);
    const recordingOpts =
      typeof testmapConfig === 'object' && 'recordingOpts' in testmapConfig
        ? testmapConfig.recordingOpts
        : defaultRecordOptions;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    // @ts-ignore
    const recorder = new RRWebRecorder(recordingOpts);

    const testRunContext = getCurrentTestContext(testInfo.testId);
    if (testRunContext) {
      testRunContext.recorderInstance = recorder;
    }

    recorder.bind({
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      pushEvent: async (event) => {
        testRunContext?.recorderEvents.push(event);
        await Promise.resolve();
      },
    });
    await recorder.inject(page);
    const network = settleOptions ? new NetworkTracker(page) : null;

    // eslint-disable-next-line @typescript-eslint/require-await
    page.on('console', async (consoleMessage: ConsoleMessage) => {
      if (consoleMessage.type() === 'debug') return;
      console.debug(`[${Date.now()}] [page] console`, consoleMessage.text());
    });

    page.on('load', async () => {
      /* empty */
    });

    page.on('domcontentloaded', async () => {
      await recorder.start();
      if (testRunContext?.runner) {
        testRunContext.runner.recorder = {
          scriptVersion: recorder.getScriptVersion(),
          libVersion: recorder.getLibVersion(),
        };
      }
    });
    page.on('close', async () => {
      await recorder.flush();
    });

    // Ensure the CURRENT document has been captured (META + FullSnapshot).
    // The recorder starts on a fresh document only from the
    // page.on('domcontentloaded') hook above, so there are two windows where
    // a page can slip away unrecorded:
    //   * before page.goBack/goForward — they resolve on the DESTINATION's
    //     load state and do nothing to guarantee the page being LEFT was
    //     recorded. With a commit-time assertion (expect(page).toHaveURL —
    //     matches when the url changes, before DOMContentLoaded) a test can
    //     navigate away only a few ms after navigating in.
    //   * at test end — a click-triggered navigation right before the test
    //     finishes tears the recorder down before the destination's
    //     DOMContentLoaded, so the final page never gets a snapshot.
    // Waiting for the current document to load (then starting the
    // per-document-idempotent recorder) closes both gaps transparently —
    // no per-test waitForLoadState needed.
    const ensureCurrentPageCaptured = async () => {
      if (page.isClosed()) return;
      try {
        // Let the current page reach DOMContentLoaded before we capture it.
        // No hard cap here: if the page is already loaded this resolves
        // immediately; only the "navigated in then straight back out" case
        // actually waits, and only as long as the page needs — bounded by the
        // project's own navigationTimeout. A short fixed cap (e.g. 5s) dropped
        // the snapshot of heavy pages under worker contention. The timeout is
        // still non-fatal: on the rare genuine hang we attempt a best-effort
        // snapshot of whatever DOM exists rather than losing the page.
        await page
          .waitForLoadState('domcontentloaded')
          .catch(() => { /* slow/hanging page — capture whatever exists */ });
        await recorder.start();
        await waitForNextRAF(page);
      } catch { /* best effort — never block the caller */ }
    };

    for (const method of ['goBack', 'goForward'] as const) {
      const original = page[method].bind(page);
      page[method] = (async (options?: Parameters<typeof original>[0]) => {
        await ensureCurrentPageCaptured();
        return original(options);
      }) as typeof page[typeof method];
    }

    // Playwright >=1.58 moved per-test step callbacks from `testInfo._onStepEnd`
    // (direct method) into `testInfo._callbacks.onStepEnd` (shared callbacks object).
    // Older versions still expose the legacy method, so we feature-detect.
    type StepEndPayload = {
      testId: string;
      stepId: string;
      wallTime: number;
      error?: unknown;
      suggestedRebaseline?: string;
      annotations: { type: string, description?: string }[];
    };
    // @ts-ignore — accessing internal TestInfo fields
    const callbacks = testInfo._callbacks as { onStepEnd?: (p: StepEndPayload) => void } | undefined;
    // @ts-ignore — legacy field, may be undefined in newer Playwright
    const legacyOnStepEnd = testInfo._onStepEnd as ((p: StepEndPayload) => void) | undefined;

    const onStepEndWrapper = async (stepEndPayload: StepEndPayload, originalFn?: (p: StepEndPayload) => void) => {
      // @ts-ignore
      const currentStepInfo = testInfo._stepMap.get(stepEndPayload.stepId);
      if (currentStepInfo?.apiName && currentStepInfo?.location.file === testInfo.file) {
        await recorder.addCustomEvent(currentStepInfo.apiName, {
          stepId: currentStepInfo.stepId,
          category: currentStepInfo.category,
          location: currentStepInfo.location,
          title: currentStepInfo.title,
          apiName: currentStepInfo.apiName,
          endWallTime: currentStepInfo.endWallTime,
        });
      }
      if (!page.isClosed()) {
        try {
          await waitForNextRAF(page);
        } catch { /* empty */ }
      }
      originalFn?.(stepEndPayload);
    };

    if (callbacks && typeof callbacks.onStepEnd === 'function') {
      const originalOnStepEnd = callbacks.onStepEnd.bind(callbacks);
      callbacks.onStepEnd = (payload: StepEndPayload) => {
        void onStepEndWrapper(payload, originalOnStepEnd);
      };
    } else if (typeof legacyOnStepEnd === 'function') {
      // @ts-ignore
      const originalOnStepEnd = legacyOnStepEnd.bind(testInfo);
      // @ts-ignore
      testInfo._onStepEnd = (payload: StepEndPayload) => onStepEndWrapper(payload, originalOnStepEnd);
    }

    // Stop the recorder exactly once. recorder.stop() invokes window.stopFn(),
    // which runs rrweb's NavigationManager.destroy() — the synchronous flush of
    // any pending post-navigation FullSnapshot (e.g. the destination route of a
    // page.goBack() on an SPA) — and executes a debounced checkout that is
    // still waiting on its timer. If stop() never runs, that snapshot is lost.
    let recorderStopped = false;
    const stopRecorder = async () => {
      if (recorderStopped) return;
      recorderStopped = true;
      // The final page of a test has the same blind spot as the goBack case:
      // when the last action is a click-triggered navigation, commit-time
      // assertions (expect(page).toHaveURL, body visibility) let the test
      // finish before the destination's DOMContentLoaded — the only trigger
      // that starts the recorder on a fresh document. Stopping right away
      // would save a report that ends at the page the test navigated AWAY
      // from. Capture the current document first.
      await ensureCurrentPageCaptured();
      // A test usually ends on an assertion that is satisfied by the first
      // paint (URL, heading) while API data is still loading. Let the page
      // settle, then re-snapshot it if it changed, so the report's last
      // FullSnapshot shows the loaded page and not its skeleton placeholders.
      // Skipped for failed tests: the page is in an unknown state and the
      // wait would only delay the failure report.
      if (
        settleOptions &&
        network &&
        testInfo.status === 'passed' &&
        !page.isClosed()
      ) {
        await settlePage(page, network, settleOptions);
        if (hasMutationsSinceLastFullSnapshot(testRunContext?.recorderEvents)) {
          await recorder.takeFullSnapshot();
        }
      }
      // Give the browser one rAF tick so the last user interaction's
      // mutation/scroll events emit before we tear down. Do NOT gate on
      // isRecordingReady — recorder.stop() awaits any in-flight start()
      // and drains the queued custom events itself.
      if (!page.isClosed()) {
        try { await waitForNextRAF(page); } catch { /* empty */ }
      }
      await recorder.stop();
    };

    // Where the recorder stops: in this fixture's teardown, i.e. AFTER the
    // test's afterEach hooks, so whatever they do to the page is recorded too.
    // There is intentionally no early stop via Playwright internals
    // (testInfo._onDidFinishTestFunctionCallback / _onDidFinishTestFunction /
    // _onDidFinishTestFunctionCallbacks). Those fire BEFORE afterEach, their
    // shape changed across releases (single callback ≤1.58 —
    // a slot that Playwright's artifacts recorder also assigns —
    // a Set from 1.60), and hooking them made the stop point, and therefore
    // what the report contains, depend on the installed Playwright version.
    // Teardown runs on every version while the page is still open (the
    // context fixture closes it later).

    console.log(`[${Date.now()}] [🟢 TEST START] ${testInfo.title}`);

    await use(page);

    await stopRecorder();

    // Teardown: save the per-test rrweb report. This is intentionally inside
    // the page fixture (not in test.afterEach) because top-level
    // `test.beforeEach`/`test.afterEach` declared in a shared plugin module
    // only register for the spec file whose first import loaded the plugin
    // — Playwright scopes module-top-level hooks to the loading file, and
    // subsequent specs get the cached module without re-registration. A
    // fixture-scoped teardown runs for every test that uses the fixture,
    // regardless of spec file.
    console.log(`[${Date.now()}] [🔴 TEST END] ${testInfo.title}`);
    if (testRunContext) {
      testRunContext.test.duration = testInfo.duration;
      const testRunResult = {
        runner: testRunContext.runner,
        spec: testRunContext.spec,
        browser: testRunContext.browser,
        test: testRunContext.test,
        suite: testRunContext.test.suite,
        recorderEvents: Array.isArray(testRunContext.recorderEvents)
          ? testRunContext.recorderEvents
          : [],
      };
      saveRRWebReport(testRunResult, testmapConfig.outputReportDir);
    }
  },
});

// Numeric values of EventType.FullSnapshot / IncrementalSnapshot and
// IncrementalSource.Mutation; importing the enums would bundle rrweb-types.
const FULL_SNAPSHOT = 2;
const INCREMENTAL_SNAPSHOT = 3;
const MUTATION_SOURCE = 0;

function hasMutationsSinceLastFullSnapshot(events: RecorderEvent[] | undefined): boolean {
  if (!events) return false;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === FULL_SNAPSHOT) return false;
    if (
      event.type === INCREMENTAL_SNAPSHOT &&
      (event.data as { source?: number }).source === MUTATION_SOURCE
    ) {
      return true;
    }
  }
  return false;
}

export { test, expect };

