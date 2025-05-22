import { record } from '@appsurify-testmap/rrweb';
import type { recordOptions } from '@appsurify-testmap/rrweb';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';
import { MessageName, type RecordStartedMessage } from '~/types';
import { isInCrossOriginIFrame } from '~/utils';
import { getRecordSequentialIdPlugin } from '@appsurify-testmap/rrweb-plugin-sequential-id-record';


/**
 * This script is injected into both main page and cross-origin IFrames through <script> tags.
 */

let stopFn: (() => void) | null = null;

function startRecord(config: recordOptions<eventWithTime>) {
  stopFn =
    record({
      emit: (event, isCheckout) => {
        console.debug(
          `[${performance.now()+performance.timeOrigin}] [web-extension:content/inject] emit`,
          {
            isCheckout,
            event
          }
        );
        postMessage({
          message: MessageName.EmitEvent,
          event,
        });
      },
      plugins: [
        getRecordSequentialIdPlugin({
          key: 'id', // default value
        }),
      ],
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
