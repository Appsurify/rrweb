import type { eventWithTime } from '@appsurify-testmap/rrweb-types';

export enum SyncDataKey {
  settings = 'settings',
}

export type SyncData = {
  [SyncDataKey.settings]: Settings;
};

export type CheckoutEveryNth = { type: 'checkoutEveryNth'; value: number };
export type CheckoutEveryNms = { type: 'checkoutEveryNms'; value: number };
export type CheckoutEveryEvc = { type: 'checkoutEveryEvc'; value: boolean };

export type CheckoutSetting = CheckoutEveryNth | CheckoutEveryNms | CheckoutEveryEvc;

export type MouseInteractionSettings = {
  MouseUp: boolean;
  MouseDown: boolean;
  Click: boolean;
  ContextMenu: boolean;
  DblClick: boolean;
  Focus: boolean;
  Blur: boolean;
  TouchStart: boolean;
  TouchEnd: boolean;
};

export type SamplingSettings = {
  mousemove: boolean | number;
  mouseInteraction: MouseInteractionSettings;
  scroll: number | boolean;
  media: number | boolean;
  input: 'last' | 'all' | boolean;
  visibility: number | boolean;
};

export type MaskInputOptions = {
  password: boolean;
  email: boolean;
  number: boolean;
  tel: boolean;
  text: boolean;
  textarea: boolean;
  select: boolean;
};

export type Settings = {
  checkoutSetting: CheckoutSetting;
  sampling: SamplingSettings;
  maskInputOptions: MaskInputOptions;
};

export enum LocalDataKey {
  recorderStatus = 'recorder_status',
}

export type LocalData = {
  [LocalDataKey.recorderStatus]: {
    status: RecorderStatus;
    activeTabId: number;
    startTimestamp?: number;
    // the timestamp when the recording is paused
    pausedTimestamp?: number;
    errorMessage?: string; // error message when recording failed
  };
};

export const defaultSettings: Settings = {
  checkoutSetting: { type: "checkoutEveryEvc", value: true},
  sampling: {
    mousemove: false,
    mouseInteraction: {
      MouseUp: false,
      MouseDown: false,
      Click: false,
      ContextMenu: false,
      DblClick: false,
      Focus: false,
      Blur: false,
      TouchStart: false,
      TouchEnd: false,
    },
    scroll: 500,
    media: 1000,
    input: 'last',
    visibility: false,
  },
  maskInputOptions: {
    password: false,
    email: false,
    number: false,
    tel: false,
    text: false,
    textarea: false,
    select: false,
  },
};

export enum RecorderStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PAUSED = 'PAUSED',
  // when user change the tab, the recorder will be paused during the tab change
  PausedSwitch = 'PAUSED_SWITCH',
}

export type Session = {
  id: string;
  name: string;
  tags: string[];
  createTimestamp: number;
  modifyTimestamp: number;
  recorderVersion: string;
};

// all service names for channel
export enum ServiceName {
  StartRecord = 'start-record',
  StopRecord = 'stop-record',
}

// all event names for channel
export enum EventName {
  SessionUpdated = 'session-updated',
  ContentScriptEmitEvent = 'content-script-emit-event',
  StartButtonClicked = 'start-recording-button-clicked',
  StopButtonClicked = 'stop-recording-button-clicked',
  PauseButtonClicked = 'pause-recording-button-clicked',
  ResumeButtonClicked = 'resume-recording-button-clicked',
}

// all message names for postMessage API
export enum MessageName {
  RecordScriptReady = 'rrweb-extension-record-script-ready',
  StartRecord = 'rrweb-extension-start-record',
  RecordStarted = 'rrweb-extension-record-started',
  StopRecord = 'rrweb-extension-stop-record',
  RecordStopped = 'rrweb-extension-record-stopped',
  EmitEvent = 'rrweb-extension-emit-event',
}

export type RecordStartedMessage = {
  message: MessageName.RecordStarted;
  startTimestamp: number;
};

export type RecordStoppedMessage = {
  message: MessageName.RecordStopped;
  endTimestamp: number;
};

export type EmitEventMessage = {
  message: MessageName.EmitEvent;
  event: eventWithTime;
};
