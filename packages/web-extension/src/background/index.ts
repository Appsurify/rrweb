import Browser from 'webextension-polyfill';
import { nanoid } from 'nanoid';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';
import Channel from '~/utils/channel';
import {
  EventName,
  LocalDataKey,
  MessageName,
  RecorderStatus,
  ServiceName,
  type SessionMetadata,
} from '~/types';
import type {
  LocalData,
  RecordStartedMessage,
  RecordStoppedMessage,
  Session,
} from '~/types';
import { isFirefox } from '~/utils';
import { addSession, updateSession } from '~/utils/storage';
import { RecordSettingsToRecordOptions } from '~/utils/settingsMapper';
import { apiClient } from '~/utils/apiClient';

import { settingsManager } from '~/utils/settingsManager';

void (async () => {

  await settingsManager.load();

  const events: eventWithTime[] = [];
  const channel = new Channel();

  let recorderStatus: LocalData[LocalDataKey.recorderStatus] = {
    status: RecorderStatus.IDLE,
    activeTabId: -1,
  };

  // Reset recorder status when the extension is reloaded.
  await Browser.storage.local.set({
    [LocalDataKey.recorderStatus]: recorderStatus,
  });

  channel.on(EventName.StartButtonClicked, async () => {
    const currentSettings = settingsManager.getSettings();
    if (recorderStatus.status !== RecorderStatus.IDLE) return;
    recorderStatus = {
      status: RecorderStatus.IDLE,
      activeTabId: -1,
    };
    await Browser.storage.local.set({
      [LocalDataKey.recorderStatus]: recorderStatus,
    });

    events.length = 0; // clear events before recording
    const tabId = await channel.getCurrentTabId();
    if (tabId === -1) return;

    const res = (await channel
      .requestToTab(tabId, ServiceName.StartRecord, {
        config: RecordSettingsToRecordOptions(currentSettings.recordSettings),
      })
      .catch(async (error: Error) => {
        recorderStatus.errorMessage = error.message;
        await Browser.storage.local.set({
          [LocalDataKey.recorderStatus]: recorderStatus,
        });
      })) as RecordStartedMessage;
    if (!res) return;
    Object.assign(recorderStatus, {
      status: RecorderStatus.RECORDING,
      activeTabId: tabId,
      startTimestamp: res.startTimestamp,
    });
    await Browser.storage.local.set({
      [LocalDataKey.recorderStatus]: recorderStatus,
    });
  });

  channel.on(EventName.StopButtonClicked, async (data) => {
    if (recorderStatus.status === RecorderStatus.IDLE) return;

    if (recorderStatus.status === RecorderStatus.RECORDING) {

      const stopResponse = (await channel.requestToTab(recorderStatus.activeTabId, ServiceName.StopRecord, {})
      .catch(() => ({
        message: MessageName.RecordStopped,
        endTimestamp: Date.now(),
      }))) as RecordStoppedMessage;
      console.debug(`${Date.now()} [rrweb-web-extension] background:stopResponse:`, stopResponse);
    }

    recorderStatus = {
      status: RecorderStatus.IDLE,
      activeTabId: -1,
    };
    await Browser.storage.local.set({
      [LocalDataKey.recorderStatus]: recorderStatus,
    });
    const title =
      (await Browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => tabs[0]?.title)
        .catch(() => {
          // ignore error
        })) ?? 'new session';
    // Extract metadata passed from popup or use an empty object
    const metadata =
      (data && (data as { metadata?: SessionMetadata }).metadata) || {};
    const newSession = generateSession(title, metadata);
    await addSession(newSession, events).catch((e) => {
      recorderStatus.errorMessage = (e as { message: string }).message;
      void Browser.storage.local.set({
        [LocalDataKey.recorderStatus]: recorderStatus,
      });
    });

    // Immediately send the session to the server
    try {
      const sendResponse = await apiClient.sendSession(newSession, events);
      // If the request is successful, update the session: syncStatus, lastSyncTimestamp, serverId (if available)
      newSession.syncStatus = 'synced';
      newSession.lastSyncTimestamp = Date.now();
      if (sendResponse.serverId) {
        newSession.serverId = sendResponse.serverId;
      }
    } catch (error: unknown) {
      newSession.syncStatus = 'error';
      if (error instanceof Error) {
        newSession.syncError = error.message;
      } else {
        newSession.syncError = 'Unexpected error occurred';
      }
    }

    // Save the updated session in storage
    await updateSession(newSession);

    channel.emit(EventName.SessionUpdated, {
      session: newSession,
    });
    events.length = 0;
  });

  async function pauseRecording(newStatus: RecorderStatus) {
    if (
      recorderStatus.status !== RecorderStatus.RECORDING ||
      recorderStatus.activeTabId === -1
    )
      return;

    const stopResponse = (await channel
      .requestToTab(recorderStatus.activeTabId, ServiceName.StopRecord, {})
      .catch(() => {
        // ignore error
      })) as RecordStoppedMessage | undefined;
    Object.assign(recorderStatus, {
      status: newStatus,
      activeTabId: -1,
      pausedTimestamp: stopResponse?.endTimestamp,
    });
    await Browser.storage.local.set({
      [LocalDataKey.recorderStatus]: recorderStatus,
    });
  }
  channel.on(EventName.PauseButtonClicked, async () => {
    if (recorderStatus.status !== RecorderStatus.RECORDING) return;
    await pauseRecording(RecorderStatus.PAUSED);
  });

  async function resumeRecording(newTabId: number) {
    const currentSettings = settingsManager.getSettings();
    if (
      ![RecorderStatus.PAUSED, RecorderStatus.PausedSwitch].includes(
        recorderStatus.status,
      )
    )
      return;
    const { startTimestamp, pausedTimestamp } = recorderStatus;
    // On Firefox, the new tab is not communicable immediately after it is created.
    if (isFirefox()) await new Promise((r) => setTimeout(r, 50));
    const pausedTime = pausedTimestamp ? Date.now() - pausedTimestamp : 0;
    // Decrease the time spent in the pause state and make it look like a continuous recording.
    events.forEach((event) => {
      event.timestamp += pausedTime;
    });
    const startResponse = (await channel
      .requestToTab(newTabId, ServiceName.StartRecord, {
        config: RecordSettingsToRecordOptions(currentSettings.recordSettings),
      })
      .catch((e: { message: string }) => {
        recorderStatus.errorMessage = e.message;
        void Browser.storage.local.set({
          [LocalDataKey.recorderStatus]: recorderStatus,
        });
      })) as RecordStartedMessage | undefined;
    if (!startResponse) {
      // Restore the events data when the recording fails to start.
      events.forEach((event) => {
        event.timestamp -= pausedTime;
      });
      return;
    }
    recorderStatus = {
      status: RecorderStatus.RECORDING,
      activeTabId: newTabId,
      startTimestamp: (startTimestamp || Date.now()) + pausedTime,
    };
    await Browser.storage.local.set({
      [LocalDataKey.recorderStatus]: recorderStatus,
    });
  }
  channel.on(EventName.ResumeButtonClicked, async () => {
    if (recorderStatus.status !== RecorderStatus.PAUSED) return;
    recorderStatus.errorMessage = undefined;
    await Browser.storage.local.set({
      [LocalDataKey.recorderStatus]: recorderStatus,
    });
    const tabId = await channel.getCurrentTabId();
    await resumeRecording(tabId);
  });

  channel.on(EventName.ContentScriptEmitEvent, (data) => {
    events.push(data as eventWithTime);
  });

  // When tab is changed during the recording process, pause recording in the old tab and start a new one in the new tab.
  Browser.tabs.onActivated.addListener((activeInfo) => {
    void (async () => {
      if (
        recorderStatus.status !== RecorderStatus.RECORDING &&
        recorderStatus.status !== RecorderStatus.PausedSwitch
      )
        return;
      if (activeInfo.tabId === recorderStatus.activeTabId) return;
      if (recorderStatus.status === RecorderStatus.RECORDING)
        await pauseRecording(RecorderStatus.PausedSwitch);
      if (recorderStatus.status === RecorderStatus.PausedSwitch)
        await resumeRecording(activeInfo.tabId);
    })();
    return;
  });

  // If the recording can't start on an invalid tab, resume it when the tab content is updated.
  Browser.tabs.onUpdated.addListener(function (tabId, info) {
    if (info.status !== 'complete') return;
    if (
      recorderStatus.status !== RecorderStatus.PausedSwitch ||
      recorderStatus.activeTabId === tabId
    )
      return;
    void resumeRecording(tabId);
  });

  /**
   * When the current tab is closed, and there is no other tab to resume recording, make sure the recording status is updated to SwitchPaused.
   */
  Browser.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      if (
        recorderStatus.activeTabId !== tabId ||
        recorderStatus.status !== RecorderStatus.RECORDING
      )
        return;
      // Update the recording status to make it resumable after users switch to other tabs.
      Object.assign(recorderStatus, {
        status: RecorderStatus.PausedSwitch,
        activeTabId: -1,
        pausedTimestamp: Date.now(),
      });

      await Browser.storage.local.set({
        [LocalDataKey.recorderStatus]: recorderStatus,
      });
    })();
  });
})();

function generateSession(title: string, metadata: SessionMetadata) {
  const newSession: Session = {
    id: nanoid(),
    name: title,
    metadata, // there might be empty fields
    tags: [],
    createTimestamp: Date.now(),
    modifyTimestamp: Date.now(),
    recorderVersion: Browser.runtime.getManifest().version_name || 'unknown',
  };
  return newSession;
}
