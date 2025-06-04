// import type { Page } from '@playwright/test';
// import type { IRRWebRecorder } from '../rrweb/IRRWebRecorder';
// import type { RRWebEvent } from '../../types';
//
// export class PlaywrightRRWebAdapter {
//   private recorder: IRRWebRecorder;
//   private page: Page;
//   private buffer: RRWebEvent[] = [];
//
//   constructor(recorder: IRRWebRecorder, page: Page) {
//     this.recorder = recorder;
//     this.page = page;
//   }
//
//   /**
//    * Устанавливает rrweb в контекст страницы и запускает запись
//    */
//   public async setup() {
//     // Вставляем rrweb код до загрузки страницы
//     await this.page.addInitScript({ path: 'path/to/rrweb-record.umd.js' });
//
//     // Встраиваем emit collector
//     await this.page.exposeFunction('__rrwebEmit', (event: RRWebEvent) => {
//       this.buffer.push(event);
//     });
//
//     await this.page.evaluate(() => {
//       window.rrweb?.record({
//         emit: window.__rrwebEmit,
//         maskInputOptions: { password: true },
//         slimDOMOptions: 'all',
//         inlineStylesheet: true,
//         sampling: {
//           mousemove: false,
//           scroll: 1000,
//           input: 'last',
//           canvas: 'all',
//         },
//         recordCanvas: true,
//         recordAfter: 'DOMContentLoaded'
//       });
//     });
//
//     // Для унификации можно вызвать .inject(), но она в текущем виде работает с window
//     this.recorder.bind({
//       pushRRWebEvent: (e) => this.buffer.push(e),
//     });
//
//     this.recorder.start(); // если ты хочешь сохранить формат RRWebRecorder
//   }
//
//   /**
//    * Остановка записи и возврат событий
//    */
//   public async teardown(): Promise<RRWebEvent[]> {
//     await this.page.evaluate(() => {
//       window.__rrwebStop?.();
//     });
//
//     this.recorder.stop();
//     return [...this.buffer].sort((a, b) => a.timestamp - b.timestamp);
//   }
//
//   /**
//    * Добавление кастомного события
//    */
//   public async addCustomEvent(tag: string, payload: Record<string, unknown>) {
//     await this.page.evaluate(
//       ([tag, payload]) => {
//         window.rrweb?.record?.addCustomEvent?.(tag, payload);
//       },
//       [tag, payload]
//     );
//   }
//
//   /**
//    * Возвращает текущий буфер
//    */
//   public getEvents(): RRWebEvent[] {
//     return [...this.buffer];
//   }
// }
