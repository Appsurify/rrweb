import { test as base, expect } from '@playwright/test';
import type { Page, Frame, ConsoleMessage } from '@playwright/test';
import RRWebRecorder from './recorder';
import defaultRecordOptions from './recorder';

import { createTestrunContext, saveRRWebReport } from './utils';
import { getCurrentTestContext, setCurrentTestContext } from './runtime';

async function waitForRecorderStabilization(recorder: RRWebRecorder, timeout = 500) {
  const start = Date.now();
  let lastCount = recorder.getEvents().length;

  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const currentCount = recorder.getEvents().length;
      if (currentCount === lastCount || Date.now() - start > timeout) {
        clearInterval(interval);
        resolve();
      }
      lastCount = currentCount;
    }, 50);
  });
}

async function waitForNextRAF(page: Page) {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
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

    const pwConfig = testInfo.project.use;
    const testmapConfig = pwConfig.testmap ? pwConfig.testmap : undefined;
    const recordingOpts =
      typeof testmapConfig === 'object' && 'recordingOpts' in testmapConfig
        ? testmapConfig.recordingOpts
        : defaultRecordOptions;

    const recorder = new RRWebRecorder(recordingOpts);

    const testRunContext = getCurrentTestContext(testInfo.testId);
    if (testRunContext) {
      testRunContext.recorderInstance = recorder;
    }

    recorder.bind({
      pushEvent: async (event) => {
        testRunContext?.recorderEvents.push(event);
        await Promise.resolve();
      },
    });
    await recorder.inject(page);

    page.on('console', async (consoleMessage: ConsoleMessage) => {
      if (consoleMessage.type() === 'debug') return;
      console.debug(`[${Date.now()}] [page] console`, consoleMessage.text());
    });

    page.on('load', async () => {
      /* empty */
    });

    page.on('domcontentloaded', async () => {
      await recorder.start();
    });
    page.on('framenavigated', async () => {
      /* empty */
    });

    page.on('close', async () => {
      await recorder.flush();
    });

    const originalonStepEnd = testInfo._onStepEnd.bind(this);
    testInfo._onStepEnd = async (stepEndPayload: any) => {

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
      originalonStepEnd(stepEndPayload);
    };

    const originalonDidFinishTestFunction = testInfo._onDidFinishTestFunction.bind(this);
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

  const pwConfig = testInfo.project.use;
  const testmapConfig = pwConfig.testmap !== undefined ? pwConfig.testmap : {};
  await saveRRWebReport(testRunResult, testmapConfig.outputReportDir)

});

export { test, expect };

