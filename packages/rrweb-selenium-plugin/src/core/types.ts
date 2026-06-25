import type {
  eventWithTime,
  IMirror,
  listenerHandler,
  EventType,
} from '@appsurify-testmap/rrweb-types';
import type { recordOptions } from '@appsurify-testmap/rrweb';

export type { eventWithTime, recordOptions, EventType };

/**
 * An rrweb event with an optional sequential identifier.
 * @public
 * @remarks
 * `id` is stamped by the sequential-id record plugin (key `"id"`) so events keep
 * a stable, monotonic order independent of timestamp resolution. This mirrors the
 * shape produced by the Playwright and Cypress plugins.
 */
export type RecorderEvent = eventWithTime & {
  id?: string | number;
};

/**
 * Payload shape for rrweb custom events.
 * @public
 */
export type customEventPayload = Record<string, unknown>;

/**
 * Lifecycle states for a recorder.
 * @public
 * @remarks
 * Used to gate recorder commands and reflect transitions:
 * `idle` → `bound` → `injected` → `recording` → `stopped` (re-`start`able).
 */
export type RecorderStatus =
  | 'idle'
  | 'bound'
  | 'injected'
  | 'recording'
  | 'stopped'
  | 'disposed';

/**
 * The rrweb `record` callable, plus the helpers it exposes on `window.rrweb`.
 * @public
 */
export interface RRWebRecord {
  <T = eventWithTime>(options?: recordOptions<T>): listenerHandler | undefined;
  getVersion(): string;
  isRecording(): boolean;
  drainCustomEventQueue(): void;
  addCustomEvent<T>(tag: string, payload: T): void;
  freezePage(): void;
  takeFullSnapshot(isCheckout?: boolean): void;
  mirror: IMirror<Node>;
}

/**
 * Handle returned by `rrweb.record(...)` used to stop recording.
 * @public
 */
export type RRWebStop = listenerHandler | (() => void);

/**
 * `window` extended with the rrweb runtime handles the recorder relies on.
 * @public
 */
export type RecorderWindow = Window & {
  rrweb?: {
    record: RRWebRecord;
  };
  rrwebPluginSequentialIdRecord?: {
    getRecordSequentialIdPlugin: (options?: { key?: string }) => unknown;
  };
};

/**
 * Core interface implemented by every recorder, coordinating the rrweb lifecycle
 * across different execution contexts (Window, WebDriver, CDP, …).
 * @public
 * @typeParam TTarget - The recording target type.
 * @remarks
 * All lifecycle methods are idempotent.
 */
export interface Recorder<TTarget = unknown> {
  bind(target: TTarget): Promise<void>;
  inject(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addCustomEvent(tag: string, payload: customEventPayload): Promise<void>;

  readonly target: TTarget | undefined | null;
  readonly status: RecorderStatus;
  readonly events: readonly RecorderEvent[];

  isReady(): Promise<boolean>;
  isRecording(): Promise<boolean>;
  waitForRecorderStabilization?(timeout?: number): Promise<void>;
  getMirror?(): Promise<IMirror<Node> | null>;
  dispose?(): Promise<void>;
}

/**
 * A recording engine: owns the recorder bound to a particular automation target.
 * @public
 */
export interface Engine<TTarget = unknown> {
  readonly recorder?: Recorder<TTarget>;
  readonly target?: TTarget | undefined | null;
}
