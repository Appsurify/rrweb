/// <reference types="cypress" />

import {getCurrentTestContext, setCurrentTestContext} from '../runtime';
import {safeSerializeArray, buildSelector, getTestKey, mapTestRunContextToResult} from '../utils';
import RRWebRecorder from '../../recorder';
import type {RecorderEvent} from '../../recorder/types';
import type {TestRunContext} from '../../types';
import { TestmapConfig } from '../../testmap-config';

const testmapConfig = new TestmapConfig()
const recorder = new RRWebRecorder(testmapConfig.recording);

export const registerCypressEventListeners = () => {

    Cypress
        .on('test:before:run', onTestBeforeRun)
        .on('log:added', onLogAdded)
        .on('log:changed', onLogChanged)
        .on('window:before:load', onWindowBeforeLoad)
        .on('window:before:unload', onWindowBeforeUnload)
        .on('window:unload', onWindowUnload)
        .on('window:load', onWindowLoad)
        .on('command:enqueued', onCommandEnqueued)
        .on('command:start', onCommandStart)
        .on('command:end', onCommandEnd)
        .on('command:retry', onCommandRetry)
        .on('skipped:command:end', onSkippedCommandEnd)
        .on('test:after:run', onTestAfterRun)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        .on('command:failed', onCommandFailed)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        .on('command:queue:end', onCommandQueueEnd)
        .on('fail', onFail);


    afterEach(() => {
        // console.debug(`🟡 [${Date.now()}] [cypress] afterEach:`);
        const currentTest = Cypress.currentTest;
        if (!currentTest) return;

        const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
        const ctx = getCurrentTestContext(testKey);
        if (!ctx) return;

        ctx.recorderEvents.map((event) => {
            if (event.type !== 5 ) return event;

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            const liveCommand = ctx.commandLiveRefs.get(event.data.payload.id);

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // event.data.payload.element = element;
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            event.data.payload.state = liveCommand?.state ?? 'unknown';
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // event.data.payload.args = liveCommand?.get('args');
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            event.data.payload.args = safeSerializeArray(liveCommand?.get('args'));
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            event.data.payload.query = liveCommand?.get('query');
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            event.data.payload.timeout = liveCommand?.get('timeout');
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            event.data.payload.name = liveCommand?.get('name');
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            event.data.payload.type = liveCommand?.get('type');


            if (liveCommand?.get('prev')) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                event.data.payload.prev = {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
                    state: liveCommand?.get('prev').state,
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                    name: liveCommand?.get('prev').get('name'),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    args: safeSerializeArray(liveCommand?.get('prev').get('args')),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    type: liveCommand?.get('prev').get('type'),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    query: liveCommand?.get('prev').get('query'),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    id: liveCommand?.get('prev').get('id'),
                };
            }

            if (liveCommand?.get('next')) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                event.data.payload.next = {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    state: liveCommand?.get('next').state,
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    name: liveCommand?.get('next').get('name'),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    args: safeSerializeArray(liveCommand?.get('next').get('args')),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    type: liveCommand?.get('next').get('type'),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    query: liveCommand?.get('next').get('query'),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-argument
                    id: liveCommand?.get('next').get('id'),
                };
            }
            return event;
        })
        console.debug(`🟡 [${Date.now()}] [cypress] afterEach:`, ctx.recorderEvents);

        // const testRunResult: TestRunResult = {
        //     spec: ctx.spec as unknown as SpecInfo,
        //     test: prepareTest(ctx.test),
        //     browser: ctx.browser as BrowserInfo,
        //     recorderEvents: ctx.recorderEvents,
        // }

        const testRunResult = mapTestRunContextToResult(ctx);


        // const testRunResultSize = getSizeInBytes(testRunResult);
        // console.debug(`🟡 [${Date.now()}] [cypress] afterEach:testResult:`, testRunResult);
        // console.debug(`🟡 [${Date.now()}] [cypress] afterEach:testResult:size:`, formatBytes(testRunResultSize));
        // const debugReport = new UICoverageReport(testRunResult);
        // console.debug(`🟡 [${Date.now()}] [cypress] afterEach:testResult:debugReport:`, debugReport.toJSON());

        try {
          cy.task('saveRRWebReport', {
            testRunResult, config: {
              outputReportDirectory: testmapConfig.outputReportDirectory,
              includeRawReport: testmapConfig.includeRawReport,
            }
          }, { log: false });
        } catch (e) {
          console.error(`🟡 [${Date.now()}] [cypress] afterEach:saveRRWebReport`, e);
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
    // console.debug(`🟡 [${Date.now()}] [cypress] onTestBeforeRun`, attributes, test);
    const testKey = getTestKey(test);
    const testRunContext: TestRunContext = {
        spec: Cypress.spec,
        test: test,
        browser: Cypress.browser,
        autWindow: null,
        waitForPaint: () => Promise.resolve(undefined),
        paintComplete: false,
        recorderEvents: [] as RecorderEvent[],
        commandLiveRefs: new Map<string, Cypress.CommandQueue>()
    };

    setCurrentTestContext(testKey, testRunContext);

    recorder.bind({
        pushEvent: (event) => {
            console.debug(`🟡 [${Date.now()}] [cypress] pushEvent`, event);
            testRunContext.recorderEvents.push(event)
            if (event.type === 5) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                const liveCommand = testRunContext.commandLiveRefs.get(event.data.payload.id);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const subject = liveCommand?.get('subject')
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument
                const selector = subject?.selector ?? buildSelector(subject);

                const mirror = recorder.getMirror();
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
                const element = mirror?.getMeta(subject?.[0]);

                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                event.data.payload.element = {
                    ...element,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    selector,
                    childNodes: []
                };
            }
        },
    });

};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onLogAdded = (attributes: Cypress.ObjectLike, log: Cypress.Log) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onLogAdded`, attributes, log);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onLogChanged = (attributes: Cypress.ObjectLike, log: Cypress.Log) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onLogChanged`, attributes, log);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onWindowBeforeUnload = (event: BeforeUnloadEvent) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onWindowBeforeUnload`, event);
    // try {
    //     recorder.stop();
    // // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // } catch (e) { /* empty */ }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onWindowUnload = (event: BeforeUnloadEvent) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onWindowUnload`, event);
    try {
        recorder.stop();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) { /* empty */ }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onWindowBeforeLoad = (win: Cypress.AUTWindow) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onWindowBeforeLoad`, win);
    recorder.inject(win);
    // recorder.start();

    const currentTest = Cypress.currentTest;
    if (!currentTest) return;

    const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
    const ctx = getCurrentTestContext(testKey);
    if (!ctx) return;

    ctx.autWindow = win;
    ctx.paintComplete = false;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onWindowLoad = (win: Cypress.AUTWindow) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onWindowLoad`, win);
    recorder.inject(win);
    recorder.start();

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
        // recorder.inject(win);
        // recorder.start();
    });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onCommandEnqueued = (command: Cypress.EnqueuedCommandAttributes) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onCommandEnqueued`, command);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onCommandRetry = (command: Cypress.CommandQueue) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onCommandRetry`, command);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onCommandStart = (command: Cypress.CommandQueue) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onCommandStart`, command);
    const currentTest = Cypress.currentTest;
    if (!currentTest) return;

    const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
    const ctx = getCurrentTestContext(testKey);
    if (!ctx) return;

    // Control and store live object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
    ctx.commandLiveRefs.set(command.attributes.id, command);

    // If need before state
    // recorder.addCustomEvent(`${command.attributes.name}`, {
    //     id: command.attributes.id,
    // });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onCommandEnd = (command: Cypress.CommandQueue) => {
    console.debug(`🟡 [${Date.now()}] [cypress] onCommandEnd`, command);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/restrict-template-expressions
    recorder.addCustomEvent(`${command.attributes.name}`, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        id: command.attributes.id,
    });


    // const currentTest = Cypress.currentTest;
    // if (!currentTest) return;
    //
    // const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
    // const ctx = getCurrentTestContext(testKey);
    // if (!ctx) return;
    //
    // const waitAndSnapshot = async () => {
    //     if (typeof ctx.waitForPaint === 'function' && !ctx.paintComplete) {
    //         console.log(`${Date.now()} [cypress] command:end:waiting for paint...`);
    //         await ctx.waitForPaint();
    //         ctx.paintComplete = true;
    //         // recorder.addCustomEvent(`${command.attributes.name}`, {
    //         //     id: command.attributes.id,
    //         // });
    //         console.log(`${Date.now()} [cypress] command:end:paint complete`);
    //     }
    // }
    // void waitAndSnapshot();
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onCommandFailed = (command: Cypress.CommandQueue, err: unknown) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onCommandFailed`, command);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/restrict-template-expressions
    recorder.addCustomEvent(`${command.attributes.name}`, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        id: command.attributes.id,
    });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onSkippedCommandEnd = (command: Cypress.CommandQueue) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onSkippedCommandEnd`, command);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onCommandQueueEnd = () => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onCommandQueueEnd`);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
const onFail = (error: Cypress.CypressError, mocha: Mocha.Runnable) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onFail`, {error, mocha});
    throw error;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/require-await
const onTestAfterRun = async (attributes: Cypress.ObjectLike, test: Mocha.Test) => {
    // console.debug(`🟡 [${Date.now()}] [cypress] onTestAfterRun`, attributes, test);
    recorder.stop();

    // const testKey = getTestKey(test);
    // const ctx = getCurrentTestContext(testKey);
    // if (!ctx) return;
    //
    // console.debug(`🟡 [${Date.now()}] [cypress] onTestAfterRun`, ctx.recorderEvents);
};


