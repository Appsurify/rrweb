import type {
  eventWithTime,
  serializedNodeWithId,
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
    interactedElements: {
        node: serializedNodeWithId;
        events: eventWithTime[];
    }[]; // Only interacted from (events) nodes
    totalElementCount: number;
    interactedElementCount: number;
    coverageRatio: number;      // e.g. 0.67
    coveragePercent: number;    // e.g. 67.1
};

export type ActionLog = {
  action: string;
  selector: string;
  xpath: string;
  id: number;
  timestamp: number;
  value?: string | boolean | number;
};
