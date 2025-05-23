// import * as rrwebTypes from '@appsurify-testmap/rrweb-types';
import * as rrwebTypes from '../../types';
import * as uiTypes from './types';
import type { serializedNodeWithId } from "@appsurify-testmap/rrweb-types";
import { extractActionLogFromSnapshot } from "./extractActionLogFromSnapshot";



export default class UICoverageReport {
  private readonly report: uiTypes.UICoverageReport;
  private readonly events: rrwebTypes.eventWithTime[];

  constructor(events: rrwebTypes.eventWithTime[]) {
    this.events = events;
    this.report = this.generate();
  }


  private generate(): uiTypes.UICoverageReport {

    type EventGroup = { meta: rrwebTypes.metaEvent; events: rrwebTypes.eventWithTime[] };
    const eventGroups: EventGroup[] = [];

    let currentGroup: EventGroup | null = null;
    for (const event of this.events) {
      if (event.type === rrwebTypes.EventType.Meta) {
        currentGroup = { meta: event, events: [] };
        eventGroups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.events.push(event);
      }
    }

    const pageMap = new Map<string, uiTypes.UICoveragePage>();
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

      let buffer: rrwebTypes.eventWithTime[] = [];
      let currentFull: rrwebTypes.fullSnapshotEvent | null = null;

      for (const event of events) {
        if (event.type === rrwebTypes.EventType.FullSnapshot /* FullSnapshot */) {
          if (currentFull && buffer.length > 0) {
            const snapshotEvents = [meta, currentFull, ...buffer];
            page.snapshots.push(this.createSnapshot((snapshotEvents as rrwebTypes.eventWithTime[]), snapshotIndex++));
          }
          currentFull = event;
          buffer = [];
        } else {
          buffer.push(event);
        }
      }

      if (currentFull) {
        const snapshotEvents = [meta, currentFull, ...buffer];
        page.snapshots.push(this.createSnapshot((snapshotEvents as rrwebTypes.eventWithTime[]), snapshotIndex++));
      }

      const allVisible = new Map<string, rrwebTypes.serializedNodeWithId>();
      const allInteracted = new Map<string, rrwebTypes.serializedNodeWithId>();

      for (const snap of page.snapshots) {
        for (const el of snap.totalElements) {
          allVisible.set(String(el.id), el);
        }
        for (const { node } of snap.interactedElements) {
          allInteracted.set(String(node.id), node);
        }
      }
      page.totalElementCount = allVisible.size;
      page.interactedElementCount = allInteracted.size;
      page.coverageRatio = allVisible.size > 0 ? allInteracted.size / allVisible.size : 0;
      page.coveragePercent = Math.round(page.coverageRatio * 10000) / 100;

    }

    return {
      pages: Array.from(pageMap.values()),
    };
  }

  private createSnapshot(events: rrwebTypes.eventWithTime[], snapshotIndex: number): uiTypes.UICoveragePageSnapshot {
    const id = `snap-${snapshotIndex}`;

    const fullSnapshot = events.find(e => e.type === rrwebTypes.EventType.FullSnapshot);
    const fullDom = (fullSnapshot as rrwebTypes.fullSnapshotEvent)?.data.node;
    // console.debug('createSnapshot', fullDom?.type);
    const visibleElements = fullDom ? this.extractVisibleNodes(fullDom) : [];

    const visibilityMap = new Map<number, boolean>();
    for (const event of events) {
      if (
        event.type === rrwebTypes.EventType.IncrementalSnapshot &&
        event.data.source === rrwebTypes.IncrementalSource.VisibilityMutation
      ) {
        const mutations = (event.data as unknown as rrwebTypes.visibilityMutationData).mutations;
        for (const { id, isVisible } of mutations) {
          visibilityMap.set(id, isVisible);
        }
      }
    }

    // Применить последние значения visibility
    // for (const el of visibleElements) {
    //   if ((el as rrwebTypes.serializedNodeWithId).id && visibilityMap.has((el as rrwebTypes.serializedNodeWithId).id)) {
    //     (el as rrwebTypes.serializedNodeWithId).isVisible = visibilityMap.get((el as rrwebTypes.serializedNodeWithId).id);
    //   }
    // }
    console.log('snapshot #', id, visibleElements.length);

    const visibleInteractiveElements = visibleElements.filter(n => (n as rrwebTypes.serializedNodeWithId)?.isInteractive);
    console.log('snapshot ##', id, visibleInteractiveElements.length);
    // Собираем взаимодействия
    const interactedMap = new Map<number, rrwebTypes.eventWithTime[]>();
    for (const event of events) {
      if (
        event.type === rrwebTypes.EventType.IncrementalSnapshot &&
        event.data &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (event.data as any).id != null &&
        event.data.source !== rrwebTypes.IncrementalSource.VisibilityMutation
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const id = (event.data as any).id as number;
        if (!interactedMap.has(id)) interactedMap.set(id, []);
        interactedMap.get(id)!.push(event);
      }
    }

    // Преобразуем в interactedElements[]
    const interactedElements: uiTypes.UICoveragePageSnapshot['interactedElements'] = [];
    for (const el of visibleElements) {
      if ((el as rrwebTypes.serializedNodeWithId).id != null && interactedMap.has((el as rrwebTypes.serializedNodeWithId).id)) {
        interactedElements.push({
          node: el as rrwebTypes.serializedNodeWithId,
          events: interactedMap.get((el as rrwebTypes.serializedNodeWithId).id)!,
        });
      }
    }
    console.log('snapshot ###', id, interactedElements.length);

    const nodeMap = new Map<string, rrwebTypes.serializedNodeWithId>();
    for (const el of visibleElements) {
      if ((el as serializedNodeWithId).id != null) {
        nodeMap.set(String((el as serializedNodeWithId).id), (el as rrwebTypes.serializedNodeWithId));
      }
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const actionLogs = extractActionLogFromSnapshot(events, nodeMap);
    console.log('snapshot ####', id, actionLogs.length);
    // const visibleInteractiveElements = visibleElements.filter(n => n.isInteractive);
    //
    // const interactedEvents = events.filter(e => e.type === 5 && e.data?.payload?.element?.id != null);
    //
    // // Сгруппировать события по element.id
    // const interactedEventsByElementId = new Map<string, any[]>();
    // for (const evt of interactedEvents) {
    //   const id = evt.data.payload.element.id;
    //   if (!interactedEventsByElementId.has(id)) {
    //     interactedEventsByElementId.set(id, []);
    //   }
    //   interactedEventsByElementId.get(id)!.push(evt);
    // }
    //
    // const interactedInteractiveElements = visibleInteractiveElements
    //   .filter(node => interactedEventsByElementId.has(node.id))
    //   .map(node => ({
    //     node,
    //     events: interactedEventsByElementId.get(node.id)!,
    //   }));
    //
    const totalCount = visibleInteractiveElements.length;
    const interactedCount = interactedElements.length;
    const ratio = totalCount > 0 ? interactedCount / totalCount : 0;
    const percent = Math.round(ratio * 10000) / 100;
    return {
      id,
      events,
      totalElements: (visibleInteractiveElements as serializedNodeWithId[]),
      interactedElements: interactedElements,
      totalElementCount: totalCount,
      interactedElementCount: interactedCount,
      coverageRatio: ratio,
      coveragePercent: percent,
    };
  }

  private extractVisibleNodes(node: rrwebTypes.serializedNodeWithId): Partial<rrwebTypes.elementNode | rrwebTypes.serializedNodeWithId>[] {
    const flat: Partial<rrwebTypes.elementNode | rrwebTypes.serializedNodeWithId>[] = [];

    function walk(n: rrwebTypes.serializedNodeWithId) {
      if (n?.type === rrwebTypes.NodeType.Element && n.isVisible) {
        flat.push({
          id: n.id,
          tagName: (n as rrwebTypes.elementNode).tagName,
          xpath: n.xpath ?? undefined,
          isVisible: n.isVisible ?? false,
          isInteractive: n.isInteractive ?? false,
          selector: n.selector ?? undefined
        });
      }
      for (const child of (n as rrwebTypes.elementNode).childNodes ?? []) {
        walk(child);
      }
    }

    walk(node);
    return flat;
  }


  public getPageCoverageBreakdown(): {
    pageId: string;
    href: string;
    total: number;
    covered: number;
    ratio: number;
    percent: number;
  }[] {
    return this.report.pages.map(page => ({
      pageId: page.id,
      href: page.href,
      total: page.totalElementCount,
      covered: page.interactedElementCount,
      ratio: page.coverageRatio,
      percent: page.coveragePercent,
    }));
  }

  public getGlobalCoverageSummary(): {
    total: number;
    covered: number;
    ratio: number;
    percent: number;
  } {
    let total = 0;
    let covered = 0;

    for (const page of this.report.pages) {
      total += page.totalElementCount;
      covered += page.interactedElementCount;
    }

    const ratio = total > 0 ? covered / total : 0;
    const percent = Math.round(ratio * 10000) / 100;

    return { total, covered, ratio, percent };
  }
}

//
// function convertToActionLog(events: rrwebTypes.eventWithTime[]): ActionLog[] {
//   const logs: uiTypes.ActionLog[] = [];
//
//   for (const e of events) {
//     if (e.type !== rrwebTypes.EventType.IncrementalSnapshot) continue;
//
//     const { source } = e.data;
//     const id = (e.data as any).id;
//     if (id == null) continue;
//
//     let action: string | null = null;
//     let value: string | boolean | number | undefined;
//
//     switch (source) {
//       case rrwebTypes.IncrementalSource.MouseInteraction: {
//         const m = e.data as rrwebTypes.mouseInteractionData;
//         switch (m.type) {
//           case rrwebTypes.MouseInteractions.Click:
//             action = 'click'; break;
//           case rrwebTypes.MouseInteractions.DblClick:
//             action = 'dblclick'; break;
//           case rrwebTypes.MouseInteractions.ContextMenu:
//             action = 'contextmenu'; break;
//           case rrwebTypes.MouseInteractions.MouseDown:
//             action = 'mousedown'; break;
//           case rrwebTypes.MouseInteractions.MouseUp:
//             action = 'mouseup'; break;
//           case rrwebTypes.MouseInteractions.Focus:
//             action = 'focus'; break;
//           case rrwebTypes.MouseInteractions.Blur:
//             action = 'blur'; break;
//         }
//         break;
//       }
//
//       case rrwebTypes.IncrementalSource.Input: {
//         const i = e.data as rrwebTypes.inputData;
//         action = 'type';
//         value = i.text ?? i.isChecked;
//         break;
//       }
//
//       case rrwebTypes.IncrementalSource.Scroll: {
//         const s = e.data as rrwebTypes.scrollData;
//         action = 'scroll';
//         value = `x=${s.x}, y=${s.y}`;
//         break;
//       }
//
//       case rrwebTypes.IncrementalSource.Selection: {
//         action = 'select';
//         break;
//       }
//
//       case rrwebTypes.IncrementalSource.MediaInteraction: {
//         const m = e.data as rrwebTypes.mediaInteractionData;
//         switch (m.type) {
//           case rrwebTypes.MediaInteractions.Play: action = 'play'; break;
//           case rrwebTypes.MediaInteractions.Pause: action = 'pause'; break;
//           case rrwebTypes.MediaInteractions.Seeked: action = 'seek'; break;
//           case rrwebTypes.MediaInteractions.VolumeChange: action = 'volume'; break;
//         }
//         break;
//       }
//     }
//
//     if (action) {
//       logs.push({
//         action,
//         id,
//         timestamp: e.timestamp,
//         selector: 'TODO', // заполнится ниже
//         value,
//       });
//     }
//   }
//
//   return logs;
// }
