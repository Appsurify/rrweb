/// <reference types="cypress" />

import {getCurrentTestContext, setCurrentTestContext} from '../runtime';
import {safeSerializeArray, getTestKey, mapTestRunContextToResult} from '../utils';
import RRWebRecorder from '../../recorder';
import defaultRecordOptions from '../../recorder';
import type {RecorderEvent} from '../../recorder/types';
import type {TestRunContext} from '../../types';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const testmapEnv = Cypress.env('testmap') ?? {};
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const recordingOpts = typeof testmapEnv === 'object' && 'recordingOpts' in testmapEnv
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ? testmapEnv.recordingOpts
    : defaultRecordOptions;
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const recorder = new RRWebRecorder(recordingOpts);

export const registerCypressEventListeners = () => {

    Cypress
        .on('test:before:run', onTestBeforeRun)
        .on('window:before:load', onWindowBeforeLoad)
        .on('window:before:unload', onWindowBeforeUnload)
        .on('window:unload', onWindowUnload)
        .on('window:load', onWindowLoad)
        .on('command:end', onCommandEnd)
        .on('test:after:run', onTestAfterRun)
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        .on('command:queue:end', onCommandQueueEnd)
        .on('fail', onFail);


    afterEach(() => {
        // Stop recording before collecting events so that any pending
        // navigation snapshots are flushed into the events array.
        recorder.stop();

        const currentTest = Cypress.currentTest;
        if (!currentTest) return;

        const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
        const ctx = getCurrentTestContext(testKey);
        if (!ctx) return;

        // Safety pass: fill defaults for type=5 events that were not enriched
        // in command:end (e.g. aborted mid-command, uncaught exception).
        for (const event of ctx.recorderEvents) {
            if (event.type !== 5) continue;
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const payload = event.data?.payload as Record<string, unknown> | undefined;
            if (!payload) continue;
            if (payload.name === undefined) payload.name = 'unknown';
            if (payload.state === undefined) payload.state = 'unknown';
            if (payload.type === undefined) payload.type = 'unknown';
            if (payload.args === undefined) payload.args = [];
            if (payload.element === undefined) payload.element = { selector: undefined, childNodes: [] };
        }

        // const testRunResult: TestRunResult = {
        //     spec: ctx.spec as unknown as SpecInfo,
        //     test: prepareTest(ctx.test),
        //     browser: ctx.browser as BrowserInfo,
        //     recorderEvents: ctx.recorderEvents,
        // }

        const testRunResult = mapTestRunContextToResult(ctx);


        // const testRunResultSize = getSizeInBytes(testRunResult);
        // console.debug(`[${Date.now()}] [cypress] afterEach:testResult:`, testRunResult);
        // console.debug(`[${Date.now()}] [cypress] afterEach:testResult:size:`, formatBytes(testRunResultSize));
        // const debugReport = new UICoverageReport(testRunResult);
        // console.debug(`[${Date.now()}] [cypress] afterEach:testResult:debugReport:`, debugReport.toJSON());

        try {
          cy.task('saveRRWebReport', {
            testRunResult
          }, { log: false });
        } catch (e) {
          console.error(`[${Date.now()}] [cypress] afterEach:saveRRWebReport`, e);
        }

    });


    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // Cypress.Commands.overwrite('type', (originalFn, subject, text, options) => {
    //     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //     // @ts-expect-error
    //     return originalFn(subject, text, options).then(() => {
    //         if (Cypress.dom.isElement(subject[0])) {
    //             const el = subject[0];
    //             if (el) {
    //                 // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //                 // @ts-expect-error
    //                 // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    //                 el.dispatchEvent(new Event('input', { bubbles: true }));
    //                 // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //                 // @ts-expect-error
    //                 // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    //                 el.dispatchEvent(new Event('change', { bubbles: true }));
    //             }
    //         }
    //     });
    // });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onTestBeforeRun = (attributes: Cypress.ObjectLike, test: Mocha.Test) => {
    // Each test is a fresh data set: clear internal events array and reset
    // the sequential-id counter so per-test reports start with id=1.
    recorder.reset();

    const testKey = getTestKey(test);
    const testRunContext: TestRunContext = {
        runner: {
          source: 'cypress',
          type: Cypress.testingType,
          version: Cypress.version,
          platform: Cypress.platform,
          arch: Cypress.arch,
          recorder: {
            scriptVersion: recorder.getLibVersion() || 'unknown',
            libVersion: recorder.getLibVersion() || 'unknown'
          }

        },
        spec: Cypress.spec,
        test: test,
        browser: Cypress.browser,
        autWindow: null,
        waitForPaint: () => Promise.resolve(undefined),
        paintComplete: false,
        recorderEvents: [] as RecorderEvent[],
    };

    setCurrentTestContext(testKey, testRunContext);

    recorder.bind({
        pushEvent: (event) => {
            testRunContext.recorderEvents.push(event);
        },
    });

};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onLogAdded = (attributes: Cypress.ObjectLike, log: Cypress.Log) => {
    // console.debug(`[${Date.now()}] [cypress] onLogAdded`, attributes, log);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onLogChanged = (attributes: Cypress.ObjectLike, log: Cypress.Log) => {
    // console.debug(`[${Date.now()}] [cypress] onLogChanged`, attributes, log);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onWindowBeforeUnload = (event: BeforeUnloadEvent) => {
    // console.debug(`[${Date.now()}] [cypress] onWindowBeforeUnload`, event);
    // try {
    //     recorder.stop();
    // // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // } catch (e) { /* empty */ }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onWindowUnload = (event: BeforeUnloadEvent) => {
    // console.debug(`[${Date.now()}] [cypress] onWindowUnload`, event);
    try {
        recorder.stop();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) { /* empty */ }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onWindowBeforeLoad = (win: Cypress.AUTWindow) => {
    // console.debug(`[${Date.now()}] [cypress] onWindowBeforeLoad`, win);
    recorder.inject(win);
    // recorder.start();

    const currentTest = Cypress.currentTest;
    if (!currentTest) return;

    const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
    const ctx = getCurrentTestContext(testKey);
    if (!ctx) return;

    ctx.runner.recorder!.scriptVersion = recorder.getScriptVersion();
    ctx.autWindow = win;
    ctx.paintComplete = false;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onWindowLoad = (win: Cypress.AUTWindow) => {
    console.debug(`[${Date.now()}] [cypress] onWindowLoad`, win);
    // recorder.inject(win);
    // recorder.start();
    // console.debug(`[${Date.now()}] [cypress] onWindowLoad after start`, recorder.isRecording());

    const currentTest = Cypress.currentTest;
    if (!currentTest) return;

    const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
    const ctx = getCurrentTestContext(testKey);
    if (!ctx) return;

    if (!ctx.autWindow) {
        ctx.autWindow = win;
        ctx.paintComplete = false;
    }

    ctx.waitForPaint = (value?: unknown): Promise<unknown> => {
      return new Promise<unknown>((resolve) => {
      const maxWaitMs = 5000;

      const captureAfterPaint = () => {
          requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                  resolve(value);
              });
          });
      };

      const safeResolve = (() => {
          let called = false;
          return () => {
              if (!called) {
                  called = true;
                  captureAfterPaint();
              }
          };
      })();

      if (['interactive', 'complete'].includes(win.document.readyState)) {
          safeResolve();
      } else {
          win.addEventListener('DOMContentLoaded', safeResolve, { once: true });
          win.addEventListener('load', safeResolve, { once: true });
          setTimeout(() => {
              console.warn('⏳ Timeout: forcing resolution');
              safeResolve();
          }, maxWaitMs);
      }
      });
    };

    // eslint-disable-next-line @typescript-eslint/require-await
    void ctx.waitForPaint().then(async () => {
        ctx.paintComplete = true;
        recorder.inject(win);
        recorder.start();
    });
    // console.debug(`[${Date.now()}] [cypress] onWindowLoad after waitForPaint`);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onCommandEnd = (command: Cypress.CommandQueue) => {
    const currentTest = Cypress.currentTest;
    if (!currentTest) return;

    const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
    const ctx = getCurrentTestContext(testKey);
    if (!ctx) return;

    // Trigger a paint settle in the background (existing behavior).
    if (!ctx.paintComplete && typeof ctx.waitForPaint === 'function') {
        void ctx.waitForPaint().then(() => {
            ctx.paintComplete = true;
        });
    }

    // Snapshot the live command's data BEFORE emitting the custom event,
    // because liveCommand state can shift on the next tick.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const commandId = command.attributes.id as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const commandName = command.attributes.name as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
    const subject = command.get('subject');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
    const selector = subject?.selector;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
    const rawArgs = command.get('args');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
    const commandType = command.get('type');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment
    const commandState = command.state ?? 'unknown';

    // Emit the custom event — synchronously pushes a type=5 event into
    // ctx.recorderEvents via the bound pushEvent callback.
    recorder.addCustomEvent(commandName, { id: commandId });

    // Find the just-emitted event (latest type=5 with this id) and enrich it
    // in place. Only fields actually consumed by the backend are populated:
    // name, args, element (consumed); state, type (kept by user request).
    for (let i = ctx.recorderEvents.length - 1; i >= 0; i--) {
        const event = ctx.recorderEvents[i];
        if (event.type !== 5) continue;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const payload = event.data?.payload as { id?: string } | undefined;
        if (!payload || payload.id !== commandId) continue;

        const mirror = recorder.getMirror();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
        const elementMeta = mirror?.getMeta(subject?.[0]);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        event.data.payload.name = commandName;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        event.data.payload.args = Array.isArray(rawArgs) ? safeSerializeArray(rawArgs) : [];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        event.data.payload.state = commandState;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        event.data.payload.type = commandType;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        event.data.payload.element = {
            ...elementMeta,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            selector,
            childNodes: [],
        };
        break;
    }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onCommandQueueEnd = () => {
    // console.debug(`[${Date.now()}] [cypress] onCommandQueueEnd`);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onFail = (error: Cypress.CypressError, mocha: Mocha.Runnable) => {
    // console.debug(`[${Date.now()}] [cypress] onFail`, {error, mocha});
    throw error;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/require-await
const onTestAfterRun = async (attributes: Cypress.ObjectLike, test: Mocha.Test) => {
    console.debug(`[${Date.now()}] [cypress] onTestAfterRun`, attributes, test);
    recorder.stop();

    // const testKey = getTestKey(test);
    // const ctx = getCurrentTestContext(testKey);
    // if (!ctx) return;
    //
    // console.debug(`[${Date.now()}] [cypress] onTestAfterRun`, ctx.recorderEvents);
};


