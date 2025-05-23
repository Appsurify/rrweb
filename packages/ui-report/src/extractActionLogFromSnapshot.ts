import type {
  eventWithTime,
  serializedNodeWithId,
} from '../../types';
import { IncrementalSource, MouseInteractions, MediaInteractions } from '../../types';
import type { ActionLog } from './types';
import { EventType } from "@appsurify-testmap/rrweb-types";

type NodeLookup = Map<string, serializedNodeWithId>;

export function extractActionLogFromSnapshot(
  events: eventWithTime[],
  nodeMap: NodeLookup
): ActionLog[] {
  const logs: ActionLog[] = [];

  for (const e of events) {
    if (e.type !== EventType.IncrementalSnapshot /* IncrementalSnapshot */) continue;

    const data: any = e.data;
    const id: number = data?.id;
    if (id == null) continue;

    const node = nodeMap.get(String(id));
    if (!node) continue;

    let action: string | null = null;
    let value: string | boolean | number | undefined;

    switch (data.source) {
      case IncrementalSource.MouseInteraction: {
        switch (data.type) {
          case MouseInteractions.Click:
            action = 'click'; break;
          case MouseInteractions.DblClick:
            action = 'dblclick'; break;
          case MouseInteractions.ContextMenu:
            action = 'contextmenu'; break;
          case MouseInteractions.MouseDown:
            action = 'mousedown'; break;
          case MouseInteractions.MouseUp:
            action = 'mouseup'; break;
          case MouseInteractions.Focus:
            action = 'focus'; break;
          case MouseInteractions.Blur:
            action = 'blur'; break;
        }
        break;
      }

      case IncrementalSource.Input: {
        action = 'type';
        value = data.text ?? data.isChecked;
        break;
      }

      case IncrementalSource.Scroll: {
        action = 'scroll';
        value = `x=${data.x}, y=${data.y}`;
        break;
      }

      case IncrementalSource.Selection: {
        action = 'select';
        break;
      }

      case IncrementalSource.MediaInteraction: {
        switch (data.type) {
          case MediaInteractions.Play: action = 'play'; break;
          case MediaInteractions.Pause: action = 'pause'; break;
          case MediaInteractions.Seeked: action = 'seek'; break;
          case MediaInteractions.VolumeChange: action = 'volume'; break;
        }
        break;
      }
    }

    if (action) {
      logs.push({
        action,
        id,
        timestamp: e.timestamp,
        selector: node.selector ?? `#${id}`,
        xpath: node.xpath || '',
        value,
      });
    }
  }

  return logs;
}
