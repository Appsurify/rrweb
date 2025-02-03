import { record } from '@appsurify-testmap/rrweb';
import type { recordOptions } from '@appsurify-testmap/rrweb';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';
import { MessageName, type RecordStartedMessage } from '~/types';
import { isInCrossOriginIFrame } from '~/utils';

/**
 * This script is injected into both main page and cross-origin IFrames through <script> tags.
 */

let stopFn: (() => void) | null = null;

function startRecord(config: recordOptions<eventWithTime>) {
  stopFn =
    record({
      emit: (event) => {
        console.info("startRecord -> record.emit -> event: ", event);
        postMessage({
          message: MessageName.EmitEvent,
          event,
        });
      },
      sampling: {
        mousemove: false,
        mouseInteraction: {
          MouseUp: false,
          MouseDown: false,
          Click: true,
          ContextMenu: false,
          DblClick: true,
          Focus: true,
          Blur: true,
          TouchStart: false,
          TouchEnd: false,
        },
        scroll: 150, // do not emit twice in 150ms
        media: 800,
        visibility: true,
        input: "last",
      },
      // checkoutEveryNth: 1,
      checkoutEveryEvc: true,
      maskInputOptions: {
        password: true
      },
      ...config

    }) || null;

  postMessage({
    message: MessageName.RecordStarted,
    startTimestamp: Date.now(),
  } as RecordStartedMessage);

}

const messageHandler = (
  event: MessageEvent<{
    message: MessageName;
    config?: recordOptions<eventWithTime>;
  }>,
) => {
  if (event.source !== window) return;

  const data = event.data;

  const eventHandler = {
    [MessageName.StartRecord]: () => {
      startRecord(data.config || {});
    },
    [MessageName.StopRecord]: () => {
      if (stopFn) {
        try {
          stopFn();
        } catch (e) {
          //
        }
      }
      postMessage({
        message: MessageName.RecordStopped,
        endTimestamp: Date.now(),
      });
      window.removeEventListener('message', messageHandler);
    },
  } as Record<MessageName, () => void>;
  if (eventHandler[data.message]) eventHandler[data.message]();
};

/**
 * Only post message in the main page.
 */
function postMessage(message: unknown) {
  if (!isInCrossOriginIFrame()) window.postMessage(message, location.origin);
}

window.addEventListener('message', messageHandler);

window.postMessage(
  {
    message: MessageName.RecordScriptReady,
  },
  location.origin,
);
