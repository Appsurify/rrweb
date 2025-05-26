import type {
    eventWithTime,
    serializedNodeWithId,
    elementNode,
    incrementalData,
    metaEvent,
    fullSnapshotEvent,
} from '@appsurify-testmap/rrweb-types';

import {
    IncrementalSource,
    MediaInteractions,
    MouseInteractions,
    NodeType,
    EventType,
} from '@appsurify-testmap/rrweb-types';

export type TestInfoInvocationDetails = {
    absoluteFile: string;
    column?: number;
    fileUrl?: string;
    function?: string;
    line?: number;
    originalFile?: string;
    relativeFile: string;
};

export type TestSuiteInfo = {
    id: string;
    file?: string | null;
    invocationDetails: TestInfoInvocationDetails;
    order?: number;
    pending: boolean
    root: boolean;
    title: string;
    type: string;
}

export type TestInfo = {
    suite?: TestSuiteInfo;
    duration?: number;
    file?: string | null;
    hasAttemptPassed?: boolean;
    id?: string;
    invocationDetails?: TestInfoInvocationDetails;
    order?: number;
    pending: boolean;
    state?: string;
    sync: boolean;
    timedOut: unknown;
    title: string;
    titlePath: string[];
    fullTitle: string;
    type: string;
}

export type SpecInfo = {
    name: string;
    relative: string;
    absolute: string;
    specFilter?: string;
    specType?: string;
    baseName?: string;
    fileExtension?: string;
    fileName?: string;
    id?: string;
}

export type BrowserInfo = {
    name: string;
    version: string;
    displayName?: string;
    family?: string;
    isHeaded?: boolean;
    isHeadless?: boolean;
    majorVersion?: string | number;
    channel?: string;
    path?: string;
}

export type UICoverageMetadata = {
    source: 'extension' | 'test' | 'manual' | 'other';
    spec?: SpecInfo;
    test?: TestInfo;
    suite?: TestSuiteInfo;
    browser?: BrowserInfo;
};

export type GenerateReportOptions = {
  events: eventWithTime[];
  metadata?: Partial<UICoverageMetadata>; // можно частично
};

export type UICoverageReport = {
    metadata?: Partial<UICoverageMetadata>;
    pages: UICoveragePage[];
};

export type UICoveragePage = {
    id: string;
    href: string;
    snapshots: UICoveragePageSnapshot[];
    totalElementCount: number;
    interactedElementCount: number;
    coverageRatio: number;      // e.g. 0.67
    coveragePercent: number;    // e.g. 67.1
};

export type UICoveragePageSnapshot = {
    id: string;
    events: eventWithTime[];
    totalElements: serializedNodeWithId[];  // Visible interactive nodes
    interactedElements: serializedNodeWithId[]; // Only interacted from (events) nodes
    actions: UICoverageAction[];
    totalElementCount: number;
    interactedElementCount: number;
    coverageRatio: number;      // e.g. 0.67
    coveragePercent: number;    // e.g. 67.1
};

export type UICoverageAction = {
  id?: number | string;
  timestamp: number;

  // источник события
  source: IncrementalSource;

  // нормализованное имя действия
  action: 'click' | 'dblclick' | 'contextmenu' | 'mousedown' | 'mouseup' |
          'focus' | 'blur' |
          'type' | 'check' |
          'scroll' |
          'select' |
          'play' | 'pause' | 'seek' | 'volume' |
          'hover'; // <- mousemove/touchmove

  // мета-информация об элементе
  nodeMeta?: serializedNodeWithId;

  // конкретное значение действия
  value?: string | number | boolean;

  // позиция (для scroll/hover)
  position?: { x: number; y: number };
};

export type NodeLookup = Map<number, serializedNodeWithId>;

export type {
    eventWithTime,
    serializedNodeWithId,
    elementNode,
    incrementalData,
    metaEvent,
    fullSnapshotEvent
}

export {
    IncrementalSource,
    MediaInteractions,
    MouseInteractions,
    NodeType,
    EventType,
}
