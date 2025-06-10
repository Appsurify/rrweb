import type { eventWithTime } from '@appsurify-testmap/rrweb-types';

export interface RecorderContext {
  pushEvent(event: RecorderEvent): void;
}

export type RecorderEvent = eventWithTime & {
  id?: number;
}

