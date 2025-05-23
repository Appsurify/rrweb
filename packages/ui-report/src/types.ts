import type {
  eventWithTime,
  serializedNodeWithId,
  IncrementalSource
} from '@appsurify-testmap/rrweb-types';


export type UICoverageReport = {
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
