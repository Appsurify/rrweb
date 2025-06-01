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

export type MaskInputOptions = Partial<{
  color: boolean;
  date: boolean;
  'datetime-local': boolean;
  email: boolean;
  month: boolean;
  number: boolean;
  range: boolean;
  search: boolean;
  tel: boolean;
  text: boolean;
  time: boolean;
  url: boolean;
  week: boolean;
  textarea: boolean;
  select: boolean;
  password: boolean;
}>;

export type SamplingOptions = Partial<{
  mousemove: boolean | number;
  mouseInteraction: boolean | Record<string, boolean | undefined>;
  scroll: number;
  media: number;
  input: 'all' | 'last';
  canvas: 'all' | number;
  visibility: boolean | {
    mode?: 'debounce' | 'immediate';
    debounce?: number;
    threshold?: number;
    sensitivity?: number;
    rafThrottle?: number;
  };
}>;

export type RecordingConfig = {
  checkoutEveryNvm?: number;
  excludeAttribute?: string | RegExp;
  maskInputOptions?: MaskInputOptions;
  sampling?: SamplingOptions;
  flushCustomEvent?: 'before' | 'after';
  recordAfter?: 'DOMContentLoaded' | 'load' | 'DOMContentStabilized';
}

export const defaultVisibilitySampling: NonNullable<SamplingOptions['visibility']> = {
  mode: 'debounce',
  debounce: 50,
  threshold: 0.5,
  sensitivity: 0.05,
  rafThrottle: 50,
};
