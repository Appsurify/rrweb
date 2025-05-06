import type {
  eventWithTime,
  SamplingStrategy,
} from '@appsurify-testmap/rrweb-types';
import type { MaskInputOptions } from '@appsurify-testmap/rrweb-snapshot';

export type Team = {
  id: number;
  slug: string;
  name: string;
};

export type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string;
  displayName: string;
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

export type CheckoutEveryNth = { type: 'checkoutEveryNth'; value: number };
export type CheckoutEveryNms = { type: 'checkoutEveryNms'; value: number };
export type CheckoutEveryEvc = { type: 'checkoutEveryEvc'; value: boolean };

export type CheckoutType =
  | CheckoutEveryNth
  | CheckoutEveryNms
  | CheckoutEveryEvc;

export type RecordSettings = {
  checkoutType: CheckoutType;
  ignoreAttribute?: string;
  maskInputOptions: MaskInputOptions;
  slimDOMOptions?: string | boolean;
  inlineStylesheet?: boolean;
  sampling?: SamplingStrategy;
  recordDOM?: boolean;
  recordCanvas?: boolean;
  collectFonts?: boolean;
  inlineImages?: boolean;
};

export type JWTAuth = {
  type: 'jwt';
  jwtAccessToken?: string;
  jwtRefreshToken?: string;
};

export type PersonalTokenAuth = {
  type: 'personalToken';
  token: string;
};

export type AuthType = JWTAuth | PersonalTokenAuth;

export type ApiSettings = {
  baseUrl: string;
  connectionTimeout: number;
  authType?: AuthType;
  user?: User;
  currentTeam?: Team;
};

export type OtherSettings = {
  enableDebugMode: boolean;
};

export type ExtensionSettings = {
  recordSettings: RecordSettings;
  apiSettings: ApiSettings;
  otherSettings: OtherSettings;
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
  // when user changes the tab, the recorder will be paused during the tab change
  PausedSwitch = 'PAUSED_SWITCH',
}

export type SessionMetadata = {
  /**
   * Project name
   */
  projectName?: string;
  /**
   * Test suite name
   */
  testSuiteName?: string;
  /**
   * Test case name
   */
  testCaseName?: string;
  /**
   * Test run name
   */
  testRunName?: string;
  /**
   * Optional: if recording occurs online, a team can be attached
   */
  team?: Team;
};

export type Session = {
  id: string;
  metadata: SessionMetadata;
  name: string;
  tags: string[];
  createTimestamp: number;
  modifyTimestamp: number;
  recorderVersion: string;
  /**
   * Synchronization status:
   * - 'pending' — the session is recorded but not yet sent or in the process of being sent,
   * - 'synced' — the session has been successfully synchronized with the server,
   * - 'error' — an error occurred during synchronization.
   */
  syncStatus?: 'pending' | 'synced' | 'error';
  /**
   * Error message if synchronization failed.
   */
  syncError?: string;
  /**
   * Session identifier assigned by the server (if different from the local id).
   */
  serverId?: number;
  /**
   * Timestamp of the last successful synchronization.
   */
  lastSyncTimestamp?: number;
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

/**
 * Interface for a paginated response.
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Interface for the login response.
 */
export interface LoginResponse {
  status: string;
  detail: string;
  jwt: {
    access: string;
    refresh: string;
    user: User;
  };
}

export interface SendSessionResponse {
  serverId?: number;
}
