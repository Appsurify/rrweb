import type {
  eventWithTime,
  fullSnapshotEvent,
  GenerateReportOptions,
  metaEvent,
  serializedNodeWithId,
  UICoverageAction,
  UICoveragePage,
  UICoveragePageSnapshot,
  UICoverageReport,
} from "./types";

import { extractActionFromSnapshot, extractElementNodes } from "./utils";
import { EventType } from "@appsurify-testmap/rrweb-types";

function generateReport(
  {
    events,
    metadata
  }: GenerateReportOptions): UICoverageReport {

  const pages = createPages(events);
  return {
    metadata,
    pages,
  }
}

function createPages(events: eventWithTime[]): UICoveragePage[] {
  type EventGroup = { meta: metaEvent; events: eventWithTime[] };
  const eventGroups: EventGroup[] = [];

  let currentGroup: EventGroup | null = null;
  for (const event of events) {
    if (event.type === EventType.Meta) {
      currentGroup = { meta: event, events: [] };
      eventGroups.push(currentGroup);
    } else if (currentGroup) {
      currentGroup.events.push(event);
    }
  }

  const pageMap = new Map<string, UICoveragePage>();
  let snapshotIndex = 0;

  for (const { meta, events } of eventGroups) {
    const metaData = meta.data;
    const href = metaData.href;

    if (!pageMap.has(href)) {
      pageMap.set(href, {
        id: `page-${pageMap.size}`,
        href,
        snapshots: [],
        totalElementCount: 0,
        interactedElementCount: 0,
        coverageRatio: 0,
        coveragePercent: 0
      });
    }

    const page = pageMap.get(href)!;

    let buffer: eventWithTime[] = [];
    let currentFull: fullSnapshotEvent | null = null;

    for (const event of events) {
      if (event.type === EventType.FullSnapshot /* FullSnapshot */) {
        if (currentFull && buffer.length > 0) {
          const snapshotEvents = [meta, currentFull, ...buffer];
          page.snapshots.push(createSnapshot((snapshotEvents as eventWithTime[]), snapshotIndex++));
        }
        currentFull = event;
        buffer = [];
      } else {
        buffer.push(event);
      }
    }

    if (currentFull) {
      const snapshotEvents = [meta, currentFull, ...buffer];
      page.snapshots.push(createSnapshot((snapshotEvents as eventWithTime[]), snapshotIndex++));
    }

    const allVisible = new Map<number, serializedNodeWithId>();
    const allInteracted = new Map<number, serializedNodeWithId>();

    for (const snap of page.snapshots) {
      for (const el of snap.totalElements) {
        allVisible.set(el.id, el);
      }
      for (const el of snap.interactedElements) {
        allInteracted.set(el.id, el);
      }
    }
    page.totalElementCount = allVisible.size;
    page.interactedElementCount = allInteracted.size;
    page.coverageRatio = allVisible.size > 0 ? allInteracted.size / allVisible.size : 0;
    page.coveragePercent = Math.round(page.coverageRatio * 10000) / 100;

  }

  return Array.from(pageMap.values());
}

function createSnapshot(events: eventWithTime[], snapshotIndex: number): UICoveragePageSnapshot {
  const id = `snap-${snapshotIndex}`;

  const fullSnapshot = events.find(e => e.type === EventType.FullSnapshot);
  const fullDom = (fullSnapshot as fullSnapshotEvent)?.data.node;

  // const visibilityMap = new Map<number, boolean>();
  // for (const event of events) {
  //   if (
  //     event.type === EventType.IncrementalSnapshot &&
  //     event.data.source === IncrementalSource.VisibilityMutation
  //   ) {
  //     const mutations = (event.data as unknown as visibilityMutationData).mutations;
  //     for (const { id, isVisible } of mutations) {
  //       visibilityMap.set(id, isVisible);
  //     }
  //   }
  // }

  const elements = fullDom ? extractElementNodes(fullDom) : [];
  // for (const event of events) {
  //   if (
  //     event.type === EventType.IncrementalSnapshot &&
  //     event.data.source === IncrementalSource.Mutation
  //   ) {
  //     for (const addMutation of event.data.adds) {
  //       elements.push(addMutation.node);
  //     }
  //   }
  // }
  // for (const node of elements) {
  //   const overrideVisibility = visibilityMap.get(node.id);
  //   if (overrideVisibility !== undefined) {
  //     node.isVisible = overrideVisibility;
  //   }
  // }
  // console.log('snapshot elements#', id, elements.length);

  const visibleElements = elements.filter(n => n?.isVisible);
  // console.log('snapshot visibleElements#', id, visibleElements.length);

  const visibleInteractiveElements = visibleElements.filter(n => n?.isInteractive);
  // console.log('snapshot visibleInteractiveElements#', id, visibleInteractiveElements.length);

  const nodeMap = new Map<number, serializedNodeWithId>();
  for (const el of visibleElements) {
    if (el.id != null) {
      nodeMap.set(el.id, el);
    }
  }

  const actions = extractActionFromSnapshot(events, nodeMap);
  // console.log('snapshot interactions#', id, actions.length);

  const actionMap = new Map<serializedNodeWithId, UICoverageAction[]>();
  for (const action of actions) {
    const nodeMeta = action.nodeMeta;

    if (!nodeMeta) continue;

    if (!actionMap.has(nodeMeta)) actionMap.set(nodeMeta, []);

    actionMap.get(nodeMeta)?.push({
      ...action,
      nodeMeta: undefined,
    });
  }

  const interactedElements: UICoveragePageSnapshot['interactedElements'] = [];

  actionMap.forEach((_actions, nodeMeta) => {
    interactedElements.push(nodeMeta);
  })

  const totalCount = visibleInteractiveElements.length;
  const interactedCount = interactedElements.length;
  const ratio = totalCount > 0 ? interactedCount / totalCount : 0;
  const percent = Math.round(ratio * 10000) / 100;
  return {
    id,
    events,
    actions: actions,
    totalElements: visibleInteractiveElements,
    interactedElements: interactedElements,
    totalElementCount: totalCount,
    interactedElementCount: interactedCount,
    coverageRatio: ratio,
    coveragePercent: percent,
  };
}


export default generateReport;
