import type { eventWithTime } from '@appsurify-testmap/rrweb-types';
import type { Mirror } from '@appsurify-testmap/rrweb-snapshot';


export interface RecorderContext {
  pushEvent(event: RecorderEvent): void;
}

export interface Recorder {
  inject(targetWindow: Window): void;
  start(): void;
  stop(): void;
  reset(): void;
  flush(): void;
  addCustomEvent(tag: string, payload: Record<string, unknown>): void;
  isRecordingReady(): boolean;
  getEvents(): readonly RecorderEvent[];
  getMirror(): Mirror | undefined;
  bind(ctx: {
    pushEvent: (event: RecorderEvent) => void;
  }): void;
  onBeforeStart?(): void | Promise<void>;
  onAfterStop?(): void | Promise<void>;
}

export type RecorderEvent = eventWithTime & {
  id?: number;
}

