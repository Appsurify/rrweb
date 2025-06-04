import { test as base, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page, Frame, ConsoleMessage } from '@playwright/test';
import { parseSerializedValue } from './serializers';
import RRWebRecorder from './recorder';

class PlaywrightRRWebAdapter {
  private recorder: RRWebRecorder;
  private page: Page;
  private buffer: any[] = [];

  constructor(recorder: RRWebRecorder, page: Page) {
    this.recorder = recorder;
    this.page = page;
  }

  public async setup() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const srcCode = this.recorder.getScriptCode();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-assignment
      await this.page.addInitScript({content: srcCode});
  }

}

const test = base.extend<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}>({
  browser: async ({ browser }: { browser: Browser }, use) => {

    // const originalOnMessage = browser._connection.onmessage.bind(browser._connection);
    //
    // browser._connection.onmessage = (message: any) => {
    //   originalOnMessage(message);
    // };

    await use(browser);
  },

  context: async ({ browser }: { browser: Browser }, use) => {
    const context = await browser.newContext();

    // const originalOnMessage = context._connection.onmessage.bind(context._connection);
    //
    // context._connection.onmessage = (message: any) => {
    //   originalOnMessage(message);
    // };

    await use(context);
    await context.close();
  },

  page: async ({ page }: { page: Page }, use) => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function,@typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    page.on('console', async (consoleMessage: ConsoleMessage) => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    page.on('load', async (page: Page) => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    page.on('domcontentloaded', async (page: Page) => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    page.on('framenavigated', async (frame: Frame) => {});
    // const originalOnMessage = page._connection.onmessage.bind(page._connection);
    // page._connection.onmessage = (message: any) => {
    //   // const curGuid = message.guid;
    //   // const curObject = page._objects?.get?.(curGuid);
    //   // const curInit = curObject?._initializer;
    //   // if (curInit?.name === '_captureEvent') {
    //   //   const curInitArgs = curInit.args;
    //   //   const event = parseSerializedValue(curInitArgs[0], undefined);
    //   //   console.log(`[onmessage][captureEvent]`, event.timestamp, event.type);
    //   // }
    //   console.log(`[onmessage]`, message.method);
    //   originalOnMessage(message);
    // };
    const recorder = new RRWebRecorder();
    const adapter = new PlaywrightRRWebAdapter(recorder, page);


    await use(page);
  },
});

// eslint-disable-next-line no-empty-pattern,@typescript-eslint/require-await
test.beforeEach(async ({}, testInfo) => {
  console.log(`[🟢 TEST START] ${testInfo.title}`);
});

// eslint-disable-next-line no-empty-pattern,@typescript-eslint/require-await
test.afterEach(async ({}, testInfo) => {
  console.log(`[🔴 TEST END] ${testInfo.title}`);
});

export { test, expect };

