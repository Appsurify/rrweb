declare global {
  interface Document {
    mozExitFullscreen: Document['exitFullscreen'];
    webkitExitFullscreen: Document['exitFullscreen'];
    msExitFullscreen: Document['exitFullscreen'];
    webkitIsFullScreen: Document['fullscreen'];
    mozFullScreen: Document['fullscreen'];
    msFullscreenElement: Document['fullscreen'];
  }

  interface HTMLElement {
    mozRequestFullScreen: Element['requestFullscreen'];
    webkitRequestFullscreen: Element['requestFullscreen'];
    msRequestFullscreen: Element['requestFullscreen'];
  }
}

import { EventType, IncrementalSource } from '@appsurify-testmap/rrweb-types';
import type { eventWithTime } from '@appsurify-testmap/rrweb-types';

export function inlineCss(cssObj: Record<string, string>): string {
  let style = '';
  Object.keys(cssObj).forEach((key) => {
    style += `${key}: ${cssObj[key]};`;
  });
  return style;
}

function padZero(num: number, len = 2): string {
  let str = String(num);
  const threshold = Math.pow(10, len - 1);
  if (num < threshold) {
    while (String(threshold).length > str.length) {
      str = `0${num}`;
    }
  }
  return str;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
export function formatTime(ms: number): string {
  if (ms <= 0) {
    return '00:00';
  }
  const hour = Math.floor(ms / HOUR);
  ms = ms % HOUR;
  const minute = Math.floor(ms / MINUTE);
  ms = ms % MINUTE;
  const second = Math.floor(ms / SECOND);
  if (hour) {
    return `${padZero(hour)}:${padZero(minute)}:${padZero(second)}`;
  }
  return `${padZero(minute)}:${padZero(second)}`;
}

export function openFullscreen(el: HTMLElement): Promise<void> {
  if (el.requestFullscreen) {
    return el.requestFullscreen();
  } else if (el.mozRequestFullScreen) {
    /* Firefox */
    return el.mozRequestFullScreen();
  } else if (el.webkitRequestFullscreen) {
    /* Chrome, Safari and Opera */
    return el.webkitRequestFullscreen();
  } else if (el.msRequestFullscreen) {
    /* IE/Edge */
    return el.msRequestFullscreen();
  }
  return Promise.resolve();
}

export function exitFullscreen(): Promise<void> {
  if (document.exitFullscreen) {
    return document.exitFullscreen();
  } else if (document.mozExitFullscreen) {
    /* Firefox */
    return document.mozExitFullscreen();
  } else if (document.webkitExitFullscreen) {
    /* Chrome, Safari and Opera */
    return document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    /* IE/Edge */
    return document.msExitFullscreen();
  }
  return Promise.resolve();
}

export function isFullscreen(): boolean {
  let fullscreen = false;
  (
    [
      'fullscreen',
      'webkitIsFullScreen',
      'mozFullScreen',
      'msFullscreenElement',
    ] as const
  ).forEach((fullScreenAccessor) => {
    if (fullScreenAccessor in document) {
      fullscreen = fullscreen || Boolean(document[fullScreenAccessor]);
    }
  });
  return fullscreen;
}

export function onFullscreenChange(handler: () => unknown): () => void {
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  document.addEventListener('mozfullscreenchange', handler);
  document.addEventListener('MSFullscreenChange', handler);

  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
    document.removeEventListener('mozfullscreenchange', handler);
    document.removeEventListener('MSFullscreenChange', handler);
  };
}

export function typeOf(
  obj: unknown,
):
  | 'boolean'
  | 'number'
  | 'string'
  | 'function'
  | 'array'
  | 'date'
  | 'regExp'
  | 'undefined'
  | 'null'
  | 'object' {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const toString = Object.prototype.toString;
  const map = {
    '[object Boolean]': 'boolean',
    '[object Number]': 'number',
    '[object String]': 'string',
    '[object Function]': 'function',
    '[object Array]': 'array',
    '[object Date]': 'date',
    '[object RegExp]': 'regExp',
    '[object Undefined]': 'undefined',
    '[object Null]': 'null',
    '[object Object]': 'object',
  } as const;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return map[toString.call(obj) as keyof typeof map];
}

/**
 * Forked from 'rrweb' replay/index.ts. The original function is not exported.
 * Determine whether the event is a user interaction event
 * @param event - event to be determined
 * @returns true if the event is a user interaction event
 */
function isUserInteraction(event: eventWithTime): boolean {
  if (event.type !== EventType.IncrementalSnapshot) {
    return false;
  }
  return (
    event.data.source > IncrementalSource.Mutation &&
    event.data.source <= IncrementalSource.Input
  );
}

/**
 * Get periods of time when no user interaction happened from a list of events.
 * @param events - all events
 * @param inactivePeriodThreshold - threshold of inactive time in milliseconds
 * @returns periods of time consist with [start time, end time]
 */
export function getInactivePeriods(
  events: eventWithTime[],
  inactivePeriodThreshold: number,
) {
  const inactivePeriods: [number, number][] = [];
  let lastActiveTime = events[0].timestamp;
  for (const event of events) {
    if (!isUserInteraction(event)) continue;
    if (event.timestamp - lastActiveTime > inactivePeriodThreshold) {
      inactivePeriods.push([lastActiveTime, event.timestamp]);
    }
    lastActiveTime = event.timestamp;
  }
  return inactivePeriods;
}

type TimelineNormalizationParams = {
  earliestProblem: number;
  span: number;
  blockSpan: number;
  blockStart: number;
  tailShift: number;
  firstFullTimestamp: number;
};

const NORMALIZATION_GAP = 0.001;
const NORMALIZATION_MIN_BLOCK_SPAN = 1;

export type TimelineMapper = {
  normalizationApplied: boolean;
  toReplayerTime(offset: number): number;
  toPlayerTime(offset: number): number;
  toReplayerAbsolute(value: number): number;
  toPlayerAbsolute(value: number): number;
  normalizeEvent<T extends eventWithTime>(event: T): T;
};

export function createIdentityTimelineMapper(): TimelineMapper {
  return {
    normalizationApplied: false,
    toReplayerTime: (offset) => offset,
    toPlayerTime: (offset) => offset,
    toReplayerAbsolute: (value) => value,
    toPlayerAbsolute: (value) => value,
    normalizeEvent: (event) => event,
  };
}

export function normalizeEventsForReplay(
  events: eventWithTime[],
  allowNormalization = true,
): { events: eventWithTime[]; mapper: TimelineMapper } {
  if (!events.length) {
    const mapper = createIdentityTimelineMapper();
    return { events, mapper };
  }

  const params = allowNormalization
    ? getNormalizationParams(events)
    : null;

  const normalizedEvents = events.map((event) =>
    normalizeEventWithParams(event, params),
  );

  const originalStart = getTimelineStart(events);
  const normalizedStart = getTimelineStart(normalizedEvents);

  const mapper = createTimelineMapper(params, originalStart, normalizedStart);

  return { events: normalizedEvents, mapper };
}

function getTimelineStart(events: eventWithTime[]): number {
  return events.reduce((min, event) => Math.min(min, event.timestamp), Infinity);
}

function getNormalizationParams(
  events: eventWithTime[],
): TimelineNormalizationParams | null {
  const firstFull = events.find((event) => event.type === EventType.FullSnapshot);
  if (!firstFull) {
    return null;
  }

  const problemEvents = events.filter(
    (event) =>
      event.type === EventType.IncrementalSnapshot &&
      event.timestamp < firstFull.timestamp,
  );

  if (!problemEvents.length) {
    return null;
  }

  const earliestProblem = problemEvents.reduce(
    (min, event) => Math.min(min, event.timestamp),
    Infinity,
  );
  const latestProblem = problemEvents.reduce(
    (max, event) => Math.max(max, event.timestamp),
    -Infinity,
  );

  const span = Math.max(0, latestProblem - earliestProblem);
  const blockSpan = Math.max(span, NORMALIZATION_MIN_BLOCK_SPAN);

  return {
    earliestProblem,
    span,
    blockSpan,
    blockStart: firstFull.timestamp + NORMALIZATION_GAP,
    tailShift: NORMALIZATION_GAP + blockSpan,
    firstFullTimestamp: firstFull.timestamp,
  };
}

function normalizeEventWithParams<T extends eventWithTime>(
  event: T,
  params: TimelineNormalizationParams | null,
): T {
  if (!params) {
    return event;
  }
  const domDependent =
    event.type === EventType.IncrementalSnapshot &&
    event.timestamp < params.firstFullTimestamp;
  const normalizedTimestamp = normalizeTimestamp(
    event.timestamp,
    domDependent,
    params,
  );
  if (normalizedTimestamp === event.timestamp) {
    return event;
  }
  return {
    ...event,
    timestamp: normalizedTimestamp,
  };
}

function normalizeTimestamp(
  timestamp: number,
  domDependent: boolean,
  params: TimelineNormalizationParams | null,
): number {
  if (!params) {
    return timestamp;
  }
  if (timestamp > params.firstFullTimestamp) {
    return timestamp + params.tailShift;
  }
  if (domDependent && timestamp < params.firstFullTimestamp) {
    if (params.span === 0) {
      return params.blockStart;
    }
    const scale = params.blockSpan / params.span;
    return params.blockStart + (timestamp - params.earliestProblem) * scale;
  }
  return timestamp;
}

function convertAbsoluteToNormalized(
  value: number,
  params: TimelineNormalizationParams | null,
): number {
  if (!params) {
    return value;
  }
  if (value > params.firstFullTimestamp) {
    return value + params.tailShift;
  }
  if (value >= params.earliestProblem && value < params.firstFullTimestamp) {
    if (params.span === 0) {
      return params.blockStart;
    }
    const scale = params.blockSpan / params.span;
    return params.blockStart + (value - params.earliestProblem) * scale;
  }
  return value;
}

function convertAbsoluteToOriginal(
  value: number,
  params: TimelineNormalizationParams | null,
): number {
  if (!params) {
    return value;
  }

  const blockEnd = params.blockStart + params.blockSpan;
  const tailStart = params.firstFullTimestamp + params.tailShift;

  if (value >= tailStart) {
    return value - params.tailShift;
  }

  if (value >= params.blockStart && value <= blockEnd) {
    if (params.span === 0) {
      return params.earliestProblem;
    }
    const scale = params.blockSpan / params.span;
    return params.earliestProblem + (value - params.blockStart) / scale;
  }

  return value;
}

function createTimelineMapper(
  params: TimelineNormalizationParams | null,
  originalStart: number,
  normalizedStart: number,
): TimelineMapper {
  const safeOriginalStart = Number.isFinite(originalStart) ? originalStart : 0;
  const safeNormalizedStart = Number.isFinite(normalizedStart)
    ? normalizedStart
    : 0;

  const toReplayerAbsolute = (value: number) =>
    convertAbsoluteToNormalized(value, params);
  const toPlayerAbsolute = (value: number) =>
    convertAbsoluteToOriginal(value, params);

  return {
    normalizationApplied: Boolean(params),
    normalizeEvent: (event) => normalizeEventWithParams(event, params),
    toReplayerAbsolute,
    toPlayerAbsolute,
    toReplayerTime: (offset) => {
      const absoluteOriginal = safeOriginalStart + offset;
      const normalizedAbsolute = toReplayerAbsolute(absoluteOriginal);
      return normalizedAbsolute - safeNormalizedStart;
    },
    toPlayerTime: (offset) => {
      const normalizedAbsolute = safeNormalizedStart + offset;
      const originalAbsolute = toPlayerAbsolute(normalizedAbsolute);
      return originalAbsolute - safeOriginalStart;
    },
  };
}
