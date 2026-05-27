import {
  test as base,
  expect,
} from '@playwright/test';
import type {
  ConsoleMessage,
} from '@playwright/test';
import RRWebRecorder from './recorder';
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

import type {
  TestmapConfig
} from './types';


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

    type ExtendedUse = typeof testInfo.project.use & { testmap?: TestmapConfig };
    const pwConfig = testInfo.project.use as ExtendedUse;
    const testmapConfig = pwConfig.testmap ?? {};
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
    page.on('framenavigated', async () => {
      /* empty */
    });

    page.on('close', async () => {
      await recorder.flush();
    });

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

    // Playwright >=1.58 introduced `_onDidFinishTestFunctionCallback` (a single
    // nullable hook called from `_didFinishTestFunction()`). Older versions
    // expose `_onDidFinishTestFunction` as a method we wrap directly.
    const stopRecorder = async () => {
      // Give the browser one rAF tick so the last user interaction's
      // mutation/scroll events emit before we tear down. Do NOT gate on
      // isRecordingReady — recorder.stop() awaits any in-flight start()
      // and drains the queued custom events itself.
      if (!page.isClosed()) {
        try { await waitForNextRAF(page); } catch { /* empty */ }
      }
      await recorder.stop();
    };

    if ('_onDidFinishTestFunctionCallback' in testInfo) {
      // @ts-ignore
      const prev = testInfo._onDidFinishTestFunctionCallback as (() => Promise<void> | void) | undefined;
      // @ts-ignore
      testInfo._onDidFinishTestFunctionCallback = async () => {
        await stopRecorder();
        await prev?.();
      };
      // @ts-ignore — legacy method
    } else if (typeof testInfo._onDidFinishTestFunction === 'function') {
      // @ts-ignore
      const originalDidFinish = testInfo._onDidFinishTestFunction.bind(testInfo);
      // @ts-ignore
      testInfo._onDidFinishTestFunction = async () => {
        await stopRecorder();
        await originalDidFinish();
      };
    }

    console.log(`[${Date.now()}] [🟢 TEST START] ${testInfo.title}`);

    await use(page);

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

export { test, expect };

