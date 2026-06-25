import type {
  customEventPayload,
  RecorderEvent,
  Recorder,
  RecorderStatus,
} from './types';

/**
 * Map of hook event names to their payload shapes.
 * @public
 */
export type HookEventMap = {
  // Recorder lifecycle
  'recorder:status:change': {
    from: RecorderStatus;
    to: RecorderStatus;
    recorder: Recorder;
  };

  // Custom-event queue
  'recorder:event:enqueue': {
    recorder: Recorder;
    tag: string;
    payload: customEventPayload;
  };
  'recorder:event:dispatch': {
    recorder: Recorder;
    tag: string;
    payload: customEventPayload;
  };
  'recorder:event:emit': {
    recorder: Recorder;
    event: RecorderEvent;
    isCheckout?: boolean;
    currentHref?: string;
  };

  // Recorder lifecycle hooks
  'recorder:hook:before:bind': { recorder: Recorder };
  'recorder:hook:after:bind': { recorder: Recorder };
  'recorder:hook:before:inject': { recorder: Recorder };
  'recorder:hook:after:inject': { recorder: Recorder };
  'recorder:hook:before:start': { recorder: Recorder };
  'recorder:hook:after:start': { recorder: Recorder };
  'recorder:hook:before:stop': { recorder: Recorder };
  'recorder:hook:after:stop': { recorder: Recorder };

  'recorder:error': { recorder: Recorder; error: unknown; context?: unknown };
};

/**
 * Minimal subscriber interface for hook events.
 * @public
 */
export interface Hookable<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void;
  once<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void;
  off<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void;
}

interface Emitter<TEvents extends Record<string, unknown>>
  extends Hookable<TEvents> {
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
}

/**
 * A tiny, dependency-free typed event emitter that runs identically in browser
 * and Node environments.
 * @public
 */
export class HookEmitter<TEvents extends Record<string, unknown>>
  implements Emitter<TEvents>
{
  private listeners = new Map<keyof TEvents, Set<(payload: unknown) => void>>();

  public on<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (payload: unknown) => void);
    this.listeners.set(event, set);
  }

  public once<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void {
    const wrapper = (payload: TEvents[K]) => {
      this.off(event, wrapper);
      handler(payload);
    };
    this.on(event, wrapper);
  }

  public off<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as (payload: unknown) => void);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  public emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (error) {
        // Never let one consumer's failure break the emitter.
        // eslint-disable-next-line no-console
        console.error(error);
      }
    }
  }
}

/**
 * Hook event payloads for the recorder runtime.
 * @public
 */
export type HookEvents = HookEventMap;

/**
 * Shared recorder hook emitter.
 * @public
 * @remarks
 * Backed by a `globalThis` singleton so the ESM and CJS builds of this package
 * share ONE emitter (the dual-package hazard): a consumer may import the CJS copy
 * while a runner entry loads the ESM copy.
 */
const GLOBAL_HOOKS_KEY = '__APPSURIFY_TESTMAP_HOOKS__';
type GlobalWithHooks = typeof globalThis & {
  [GLOBAL_HOOKS_KEY]?: HookEmitter<HookEvents>;
};
const g = globalThis as GlobalWithHooks;
export const recorderHooks: HookEmitter<HookEvents> =
  g[GLOBAL_HOOKS_KEY] ?? (g[GLOBAL_HOOKS_KEY] = new HookEmitter<HookEvents>());
