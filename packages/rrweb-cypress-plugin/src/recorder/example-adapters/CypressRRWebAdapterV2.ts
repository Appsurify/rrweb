//
// import type { RecorderEvent, Recorder } from '../../recorder/types';
// import { getCurrentTestContext, setCurrentTestContext } from '../runtime';
// import {getTestKey, prepareTest} from '../utils';
// import {TestRunResult} from "../../types";
// import {generateCoverageReport} from "../../reportJsonGenerator";
//
//
// export class CypressRRWebAdapter {
// private recorder: Recorder;
//
// constructor(recorder: Recorder) {
// this.recorder = recorder;
// }
//
// public registerHooks() {
//
// Cypress.on('test:before:run', (attributes, test) => {
// // console.debug(`🟡 [${Date.now()}] [cypress-adapter] test:before:run`, attributes, test);
// const testKey = getTestKey(test);
// const context = {
// spec: Cypress.spec,
// test: test,
// browser: Cypress.browser,
// autWindow: null,
// waitForPaint: () => Promise.resolve(undefined),
// paintComplete: false,
// rrWebEvents: [] as RecorderEvent[],
// rrWebNodes: [],
// testEvents: new Map<string, Cypress.CommandQueue>()
//
// };
// setCurrentTestContext(testKey, context);
//
// this.recorder.bind({
// pushEvent: (event) => {
// // if (event.type === 5) {
// // console.log(`Received ${event.type}`, event.data);
// // const liveCommand = context.testEvents.get(event.data.payload.id);
// // console.log(`Received ${event.type}`, liveCommand?.get('state'));
// // console.log(`Received ${event.type}`, liveCommand?.get('subject'));
// // console.log(`Received ${event.type}`, liveCommand?.get('prev'));
// // console.log(`Received ${event.type}`, liveCommand?.get('next'));
// // }
// context.rrWebEvents.push(event)
// },
// });
// });
//
// Cypress.on('window:before:load', (win: Cypress.AUTWindow) => {
// // console.debug(`🟡 [${Date.now()}] [cypress-adapter] window:before:load`, win);
// this.recorder.inject(win);
// this.recorder.start();
// const currentTest = Cypress.currentTest;
// if (!currentTest) return;
// const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
// const ctx = getCurrentTestContext(testKey);
// if (!ctx) return;
// ctx.autWindow = win;
// ctx.paintComplete = false;
// });
//
// Cypress.on('window:load', (win: Cypress.AUTWindow) => {
// // console.debug(`🟡 [${Date.now()}] [cypress-adapter] window:before:load`, win);
// this.recorder.inject(win);
// this.recorder.start();
//
// const currentTest = Cypress.currentTest;
// if (!currentTest) return;
// const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
// const ctx = getCurrentTestContext(testKey);
// if (!ctx) return;
// if (!ctx.autWindow) {
// ctx.autWindow = win;
// ctx.paintComplete = false;
// }
//
// ctx.waitForPaint = (value?: unknown): Promise<unknown> => {
// return new Promise<unknown>((resolve) => {
// const maxWaitMs = 5000;
//
// const captureAfterPaint = () => {
// requestAnimationFrame(() => {
// requestAnimationFrame(() => {
// resolve(value);
// });
// });
// };
//
// const safeResolve = (() => {
// let called = false;
// return () => {
// if (!called) {
// called = true;
// captureAfterPaint();
// }
// };
// })();
//
// if (['interactive', 'complete'].includes(win.document.readyState)) {
// safeResolve();
// } else {
// win.addEventListener('DOMContentLoaded', safeResolve, { once: true });
// win.addEventListener('load', safeResolve, { once: true });
// setTimeout(() => {
// console.warn('⏳ Timeout: forcing resolution');
// safeResolve();
// }, maxWaitMs);
// }
// });
// };
//
// ctx.waitForPaint().then(async () => {
// ctx.paintComplete = true;
// });
// });
//
// Cypress.on('window:before:unload', (event: BeforeUnloadEvent) => {
// // console.debug(`🟡 [${Date.now()}] [cypress-adapter] window:before:unload:`, event);
// try {
// this.recorder.stop();
// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// } catch (e) { /* empty */ }
// });
//
// Cypress.on('window:unload', (event: BeforeUnloadEvent) => {
// // console.debug(`🟡 [${Date.now()}] [cypress-adapter] window:unload:`, event);
// try {
// this.recorder.stop();
// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// } catch (e) { /* empty */ }
// });
//
// Cypress.on('command:start', (command: Cypress.CommandQueue) => {
// // console.debug(`🟡 [${Date.now()}] [cypress-adapter] command:start`, command);
// const currentTest = Cypress.currentTest;
// if (!currentTest) return;
//
// const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
// const ctx = getCurrentTestContext(testKey);
// if (!ctx) return;
//
// ctx.commandLiveRefs.set(command.attributes.id, command);
// // If nead before event time
// // const eventPayload = {
// //     args: command.attributes.args,
// //     name: command.attributes.name,
// //     id: command.attributes.id,
// //     type: command.attributes.type,
// // };
// // this.recorder.addEvent(`${command.attributes.name}:before`, eventPayload);
// });
//
// Cypress.on('command:end', (command: Cypress.CommandQueue) => {
// console.debug(`🟡 [${Date.now()}] [cypress-adapter] command:end`, command);
// const eventPayload = {
// args: command.attributes.args,
// name: command.attributes.name,
// id: command.attributes.id,
// type: command.attributes.type,
// };
// this.recorder.addCustomEvent(`${command.attributes.name}`, eventPayload);
// })
//
// Cypress.on('command:failed', (command: Cypress.CommandQueue, err) => {
// console.debug(`🟡 [${Date.now()}] [cypress-adapter] command:failed`, command);
// // const commandSubject = command.attributes.subject;
// // const mirror = this.recorder.getMirror();
// // const element = mirror?.getMeta(commandSubject[0]);
// const eventPayload = {
// args: command.attributes.args,
// name: command.attributes.name,
// id: command.attributes.id,
// type: command.attributes.type,
// };
// //   console.log(eventPayload);
// this.recorder.addCustomEvent(`${command.attributes.name}`, eventPayload);
// })
//
// Cypress.on('test:after:run', (attributes: Cypress.ObjectLike, test: Mocha.Test) => {
// console.debug(`🟡 [${Date.now()}] [cypress-adapter] test:after:run`, attributes, test);
//
// this.recorder.stop();
//
// const testKey = getTestKey(test);
// const ctx = getCurrentTestContext(testKey);
// if (!ctx) return;
//
// console.debug(`🟡 [${Date.now()}] [cypress-adapter] test:after:run events count: ${ctx.recorderEvents.length}`);
// console.debug(`🟡 [${Date.now()}] [cypress-adapter] test:after:run rrWebEvents:`, ctx.recorderEvents);
//
// });
//
// afterEach(() => {
// console.debug(`🟡 [${Date.now()}] [cypress-adapter] afterEach:`);
//
// const currentTest = Cypress.currentTest;
// if (!currentTest) return;
//
// const testKey = getTestKey({ titlePath: () => currentTest.titlePath });
// const ctx = getCurrentTestContext(testKey);
// if (!ctx) return;
//
// const testRunResult: TestRunResult = {
// spec: ctx.spec,
// test: prepareTest(ctx.test),
// browser: ctx.browser,
// rrWebEvents: ctx.recorderEvents,
// rrWebNodes: [],
// testEvents: [],
// }
// const debugReport = generateCoverageReport(testRunResult);
// console.debug(`🟡 [${Date.now()}] [cypress-adapter] afterEach:debugReport:`, debugReport);
// })
//
// }
// }
