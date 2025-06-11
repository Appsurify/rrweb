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
  waitForRecorderStabilization,
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

    // @ts-ignore
    const originalonStepEnd = testInfo._onStepEnd.bind(this);
    // @ts-ignore
    testInfo._onStepEnd = async (stepEndPayload: {
      testId: string;
      stepId: string;
      wallTime: number;
      error?: unknown;
      suggestedRebaseline?: string;
      annotations: { type: string, description?: string }[];
    }) => {

      // @ts-ignore
      const currentStepInfo = testInfo._stepMap.get(stepEndPayload.stepId);
      if (currentStepInfo.apiName && currentStepInfo?.location.file === testInfo.file) {
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
        } catch (error) { /* empty */ }
      }
      await originalonStepEnd(stepEndPayload);
    };

    // @ts-ignore
    const originalonDidFinishTestFunction = testInfo._onDidFinishTestFunction.bind(this);
    // @ts-ignore
    testInfo._onDidFinishTestFunction = async () => {

      if (recorder && recorder.isRecordingReady()) {
        await waitForRecorderStabilization(recorder, 500);
        await recorder.stop();
      }

      await originalonDidFinishTestFunction();
    }

    await use(page);


  },
});

test.beforeEach(async ({}, testInfo) => {
  console.log(`[${Date.now()}] [🟢 TEST START] ${testInfo.title}`);

});

test.afterEach(async ({}, testInfo) => {
  console.log(`[${Date.now()}] [🔴 TEST END] ${testInfo.title}`);
  const testRunContext = getCurrentTestContext(testInfo.testId);
  if (!testRunContext) return;

  testRunContext.test.duration = testInfo.duration;
  const testRunResult = {
      runner: testRunContext?.runner,
      spec: testRunContext?.spec,
      browser: testRunContext?.browser,
      test: testRunContext?.test,
      suite: testRunContext?.test.suite,
      recorderEvents: Array.isArray(testRunContext?.recorderEvents) ? testRunContext?.recorderEvents : []
  }

  type ExtendedUse = typeof testInfo.project.use & { testmap?: TestmapConfig };
  const pwConfig = testInfo.project.use as ExtendedUse;
  const testmapConfig = pwConfig.testmap ?? {};

  saveRRWebReport(testRunResult, testmapConfig.outputReportDir)

});

export { test, expect };

