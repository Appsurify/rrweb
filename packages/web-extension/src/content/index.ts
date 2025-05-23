import Browser from 'webextension-polyfill';
import {
  type LocalData,
  LocalDataKey,
  RecorderStatus,
  ServiceName,
  type RecordStartedMessage,
  type RecordStoppedMessage,
  MessageName,
  type EmitEventMessage,
  EventName,
} from '~/types';
import Channel from '~/utils/channel';
import { isInCrossOriginIFrame } from '~/utils';
import {
  RecordSettingsToRecordOptions,
} from '~/utils/settingsMapper';

import { settingsManager } from '~/utils/settingsManager';


const channel = new Channel();

void (async () => {

  await settingsManager.load();

  window.addEventListener(
    'message',
    (
      event: MessageEvent<{
        message: MessageName;
      }>,
    ) => {
      const currentSettings = settingsManager.getSettings();
      if (event.source !== window) return;
      if (event.data.message === MessageName.RecordScriptReady)
        window.postMessage(
          {
            message: MessageName.StartRecord,
            config: {
              recordCrossOriginIframes: true,
              ...RecordSettingsToRecordOptions(currentSettings.recordSettings),
            },
          },
          location.origin,
        );
    },
  );
  if (isInCrossOriginIFrame()) {
    void initCrossOriginIframe();
  } else if (window === window.top) {
    void initMainPage();
  }
})();

async function initMainPage() {
  let startResponseCb: ((response: RecordStartedMessage) => void) | undefined =
    undefined;
  channel.provide(ServiceName.StartRecord, async () => {
    startRecord();
    return new Promise((resolve) => {
      startResponseCb = (response) => {
        resolve(response);
      };
    });
  });
  let stopResponseCb: ((response: RecordStoppedMessage) => void) | undefined =
    undefined;
  channel.provide(ServiceName.StopRecord, () => {
    window.postMessage({ message: MessageName.StopRecord });
    return new Promise((resolve) => {
      stopResponseCb = (response: RecordStoppedMessage) => {
        stopResponseCb = undefined;
        resolve(response);
      };
    });
  });

  window.addEventListener(
    'message',
    (
      event: MessageEvent<
        | RecordStartedMessage
        | RecordStoppedMessage
        | EmitEventMessage
        | {
            message: MessageName;
          }
      >,
    ) => {
      if (event.source !== window) return;
      else if (
        event.data.message === MessageName.RecordStarted &&
        startResponseCb
      )
        startResponseCb(event.data as RecordStartedMessage);
      else if (
        event.data.message === MessageName.RecordStopped &&
        stopResponseCb
      ) {
        // On firefox, the event.data is immutable, so we need to clone it to avoid errors.
        const data = { ...(event.data as RecordStoppedMessage) };
        stopResponseCb(data);
      } else if (event.data.message === MessageName.EmitEvent)
        channel.emit(
          EventName.ContentScriptEmitEvent,
          (event.data as EmitEventMessage).event,
        );
    },
  );

  const localData = (await Browser.storage.local.get()) as LocalData;
  if (
    localData?.[LocalDataKey.recorderStatus]?.status ===
    RecorderStatus.RECORDING
  ) {
    startRecord();
  }
}

async function initCrossOriginIframe() {
  Browser.storage.local.onChanged.addListener((change) => {
    if (change[LocalDataKey.recorderStatus]) {
      const statusChange = change[LocalDataKey.recorderStatus];
      const newStatus =
        statusChange.newValue as LocalData[LocalDataKey.recorderStatus];
      if (newStatus.status === RecorderStatus.RECORDING) startRecord();
      else
        window.postMessage(
          { message: MessageName.StopRecord },
          location.origin,
        );
    }
  });
  const localData = (await Browser.storage.local.get()) as LocalData;
  if (
    localData?.[LocalDataKey.recorderStatus]?.status ===
    RecorderStatus.RECORDING
  )
    startRecord();
}

function startRecord() {
  const scriptEl = document.createElement('script');
  scriptEl.src = Browser.runtime.getURL('content/inject.js');
  document.documentElement.appendChild(scriptEl);
  scriptEl.onload = () => {
    document.documentElement.removeChild(scriptEl);
  };
}
