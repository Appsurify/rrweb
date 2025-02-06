import type { eventWithTime } from '@appsurify-testmap/rrweb-types';

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
  scroll?: number;
  media?: number;
  input?: 'last' | 'all';
  visibility?: boolean;
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

export type RecordSettings = {
  checkoutSetting: CheckoutSetting;
  sampling: SamplingSettings;
  maskInputOptions: MaskInputOptions;
};

export type AuthMethod = 'jwt' | 'apiKey';

export type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string;
  displayName: string;
};

export type Team = {
  id: number;
  slug: string;
  name: string;
};

export type Project = {
  id: number;
  name: string;
  teamId: number;
};

export type TestSuite = {
  id: number;
  name: string;
  projectId: number;
  teamId: number;
};

export type ApiCache = {
  teams?: Team[];
  projects?: Project[];
  testSuites?: TestSuite[];
};

export type ApiSettings = {
  authMethod: AuthMethod;
  apiKey?: string;

  jwtAccessToken?: string;
  jwtRefreshToken?: string;
  user?: User;

};

export type OtherSettings = {
  enableDebugMode: boolean;
};

export type ExtensionSettings = {
  recordSettings: RecordSettings;
  apiSettings: ApiSettings;
  otherSettings: OtherSettings;

  apiCache?: ApiCache;
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

export enum SyncDataKey {
  extensionSettings = 'extensionSettings',
}

export type SyncData = {
  [SyncDataKey.extensionSettings]: ExtensionSettings;
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
