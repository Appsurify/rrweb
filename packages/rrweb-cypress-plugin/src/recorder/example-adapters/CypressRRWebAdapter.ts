// import type { IRRWebRecorder } from './IRRWebRecorder';
// import type { RRWebEvent } from '../../types';
// import { getCurrentTestContext, setCurrentTestContext } from '../runtime';
// import { getTestKey } from '../utils';
//
// export class CypressRRWebAdapter {
//   private recorder: IRRWebRecorder;
//
//   constructor(recorder: IRRWebRecorder) {
//     this.recorder = recorder;
//   }
//
//   public registerHooks() {
//     Cypress.on('window:before:load', (win) => {
//       this.recorder.inject(win);
//     });
//
//     Cypress.on('window:load', () => {
//       this.recorder.start();
//     });
//
//     Cypress.on('window:before:unload', () => {
//       this.recorder.stop();
//     });
//
//     Cypress.on('test:before:run', (attributes, test) => {
//       const testKey = getTestKey(test);
//       const context = {
//         rrWebEvents: [] as RRWebEvent[],
//       };
//       setCurrentTestContext(testKey, context);
//
//       this.recorder.bind({
//         pushRRWebEvent: (e) => context.rrWebEvents.push(e),
//       });
//     });
//
//     Cypress.on('log:changed', (attributes, log) => {
//       if (!attributes.ended) return;
//
//       this.recorder.addCustomEvent('test:action', {
//         id: log.id,
//         name: log.name,
//         state: log.state,
//         message: log.message,
//         createdAtTimestamp: log.createdAtTimestamp,
//         updatedAtTimestamp: log.updatedAtTimestamp,
//       });
//     });
//
//     Cypress.on('test:after:run', (attributes, test) => {
//       this.recorder.stop();
//
//       const testKey = getTestKey(test);
//       const ctx = getCurrentTestContext(testKey);
//       if (!ctx) return;
//
//       const events = [...ctx.rrWebEvents].sort((a, b) => a.timestamp - b.timestamp);
//       console.debug(`[adapter] events count: ${events.length}`);
//     });
//   }
// }
