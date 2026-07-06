import type {
  RecorderStatus,
  eventWithTime,
  RecorderEvent,
  customEventPayload,
  recordOptions,
  Recorder,
  RecorderStartOptions,
} from './types';
import { recorderHooks } from './hooks';

/**
 * Tag of the custom event the engine emits around wrapped navigations. Not a
 * user interaction — excluded from eager-head interaction detection.
 * @public
 */
export const NAVIGATION_CUSTOM_EVENT_TAG = 'testmap:navigation';

// rrweb protocol discriminators used for interaction detection. Numeric
// mirrors of EventType/IncrementalSource from rrweb-types — the values are
// frozen by the recorded-data format.
const EVENT_TYPE_INCREMENTAL = 3;
const EVENT_TYPE_CUSTOM = 5;
/**
 * IncrementalSource values that represent USER activity on the page. Passive
 * sources (Mutation, StyleSheetRule, AdoptedStyleSheet, Visibility, …) are
 * deliberately excluded: a page left over from the previous test keeps
 * emitting those on its own.
 */
const INTERACTIVE_INCREMENTAL_SOURCES: ReadonlySet<number> = new Set([
  2, // MouseInteraction
  3, // Scroll
  5, // Input
  6, // TouchMove
  7, // MediaInteraction
  12, // Drag
  14, // Selection
]);

/**
 * Baseline rrweb record options.
 * @public
 * @remarks
 * Mirrors the defaults used by the Playwright and Cypress plugins so all three
 * runners produce comparable recordings. User options are merged over these in
 * the recorder constructor.
 */
export const defaultRecordOptions: recordOptions<eventWithTime> = {
  slimDOMOptions: 'all',
  inlineStylesheet: 'all',
  recordDOM: true,
  recordCanvas: true,
  collectFonts: true,
  inlineImages: true,
  checkoutEveryNvm: 20,
  maskInputOptions: { password: true },
  sampling: {
    mousemove: false,
    mouseInteraction: {
      MouseUp: false,
      MouseDown: false,
      Click: true,
      ContextMenu: true,
      DblClick: true,
      Focus: false,
      Blur: false,
      TouchStart: false,
      TouchEnd: false,
    },
    scroll: 100,
    media: 100,
    input: 'last',
    canvas: 'all',
    visibility: {
      mode: 'none',
      debounce: 50,
      throttle: 100,
      threshold: 0.5,
      sensitivity: 0.05,
      rafThrottle: 100,
    },
  },
  flushCustomEvent: 'after',
  recordAfter: 'DOMContentLoaded',
  userTriggeredOnInput: true,
} as recordOptions<eventWithTime>;

/**
 * A custom event queued for dispatch once the recorder is ready.
 * @public
 */
export type QueuedEvent = {
  tag: string;
  payload: customEventPayload;
  __retries?: number;
};

/**
 * Abstract base coordinating the rrweb lifecycle and event buffering.
 * @public
 * @typeParam TTarget - Recording target (Window, WebDriver, CDPSession, …).
 * @typeParam TRecordFn - rrweb record-function handle type.
 * @typeParam TStopFn - Stop-function handle type.
 * @remarks
 * Subclasses implement how rrweb is injected/invoked in a given execution
 * context; this class owns state transitions, the segmented event buffer, the
 * custom-event queue with retry, and lifecycle hooks.
 */
export abstract class AbstractRecorder<TTarget, TRecordFn, TStopFn>
  implements Recorder<TTarget>
{
  /** rrweb UMD bundle source, injected by subclasses. */
  protected readonly _rrwebUmdSource: string;

  protected _target?: TTarget | null = null;
  protected _recordFn?: TRecordFn | null = null;
  protected _stopFn?: TStopFn | null = null;
  protected readonly _recordOptions: recordOptions<eventWithTime>;
  protected _status: RecorderStatus = 'idle';

  /** Event buffer segmented by checkout boundaries. */
  protected _eventsMatrix: RecorderEvent[][] = [[]];
  protected _currentSegmentIndex = 0;

  /**
   * True while the buffer holds nothing but the test-begin eager segment (see
   * {@link RecorderStartOptions.eagerHead}). Invalidated by any subsequent
   * recording (re)start — including the self-heal path — so a discard can
   * never drop more than that head.
   */
  protected _bufferIsEagerHead = false;
  /** True once any user interaction has been recorded (never reset — the recorder lives one test). */
  private _interactionRecorded = false;

  protected _queue: QueuedEvent[] = [];
  protected readonly _retries = 5;
  private _flushInProgress = false;

  constructor(config?: {
    recordOptions?: recordOptions<eventWithTime>;
    rrwebUmdSource?: string;
  }) {
    this._recordOptions = {
      ...defaultRecordOptions,
      ...config?.recordOptions,
      sampling: {
        ...defaultRecordOptions.sampling,
        ...config?.recordOptions?.sampling,
      },
    };
    this._rrwebUmdSource = config?.rrwebUmdSource ?? '';
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  private validateStatus(allowed: RecorderStatus[], action: string): void {
    if (allowed.length === 0) return;
    if (!allowed.includes(this._status)) {
      const error = new Error(
        `Action "${action}" not allowed in status "${this._status}". Allowed: ${allowed.join(', ')}`,
      );
      this.onError(error, {
        action,
        currentStatus: this._status,
        allowedStatuses: allowed,
      });
      throw error;
    }
  }

  private transitionState(to: RecorderStatus): void {
    const from = this._status;
    this._status = to;
    recorderHooks.emit('recorder:status:change', { recorder: this, from, to });
  }

  // ============================================
  // PUBLIC API
  // ============================================

  public get hooks(): typeof recorderHooks {
    return recorderHooks;
  }

  public get target(): TTarget | undefined | null {
    return this._target;
  }

  public get status(): RecorderStatus {
    return this._status;
  }

  /** Flattened view of all captured events across segments. */
  public get events(): RecorderEvent[] {
    return this._eventsMatrix.flat();
  }

  /** Events as a 2D array segmented by checkout boundaries. */
  public get eventsMatrix(): RecorderEvent[][] {
    return this._eventsMatrix;
  }

  public get currentSegmentIndex(): number {
    return this._currentSegmentIndex;
  }

  public get segmentCount(): number {
    return this._eventsMatrix.length;
  }

  public async bind(target: TTarget): Promise<void> {
    if (this._status === 'bound' && this._target === target) {
      return;
    }
    this.validateStatus(['idle', 'bound', 'injected', 'stopped'], 'bind');

    await this.onBeforeBind();
    recorderHooks.emit('recorder:hook:before:bind', { recorder: this });

    this._target = target;

    await this.onAfterBind();
    recorderHooks.emit('recorder:hook:after:bind', { recorder: this });

    this.transitionState('bound');
  }

  public async inject(): Promise<void> {
    if (this._status === 'injected') {
      return;
    }
    this.validateStatus(['bound', 'stopped'], 'inject');

    await this.onBeforeInject();
    recorderHooks.emit('recorder:hook:before:inject', { recorder: this });

    await this.invokeInjectFn(this._rrwebUmdSource);

    await this.onAfterInject();
    recorderHooks.emit('recorder:hook:after:inject', { recorder: this });

    this.transitionState('injected');
  }

  public async start(options?: RecorderStartOptions): Promise<void> {
    if (this._status === 'recording') {
      return;
    }
    this.validateStatus(['injected', 'stopped'], 'start');

    // The eager marker only holds while the buffer will contain nothing but
    // this start's own segment; any restart clears it.
    this._bufferIsEagerHead =
      options?.eagerHead === true && this.events.length === 0;

    await this.onBeforeStart();
    recorderHooks.emit('recorder:hook:before:start', { recorder: this });

    await this.flushEventQueue();
    await this.invokeRecordFn(this._recordOptions);
    await this.flushEventQueue();

    await this.onAfterStart();
    recorderHooks.emit('recorder:hook:after:start', { recorder: this });

    this.transitionState('recording');
  }

  public async stop(): Promise<void> {
    if (this._status !== 'recording') {
      return;
    }

    await this.onBeforeStop();
    recorderHooks.emit('recorder:hook:before:stop', { recorder: this });

    await this.flushEventQueue();
    await this.invokeStopFn();

    await this.onAfterStop();
    recorderHooks.emit('recorder:hook:after:stop', { recorder: this });

    this.transitionState('stopped');
  }

  public async addCustomEvent(
    tag: string,
    payload: customEventPayload,
  ): Promise<void> {
    this._queue.push({ tag, payload });
    recorderHooks.emit('recorder:event:enqueue', { recorder: this, tag, payload });
    await this.flushEventQueue();
  }

  /**
   * Drops the buffered events when they are only the test-begin eager segment
   * with no recorded user interaction — i.e. the snapshot of a page inherited
   * from the previous test that this test immediately navigated away from.
   * Keeping it would put a phantom page-session (zero interactions) into the
   * report and double its weight on heavy pages.
   *
   * The engine calls this right after the recorder is stopped for the test's
   * FIRST wrapped navigation (the tail is fully drained, the destination
   * segment not yet started). The decision is consumed either way: later
   * navigations never re-evaluate it.
   *
   * @returns true when the head was discarded.
   */
  public discardEagerIdleHead(): boolean {
    if (!this._bufferIsEagerHead) return false;
    this._bufferIsEagerHead = false;
    if (this._interactionRecorded) return false;

    this._eventsMatrix = [[]];
    this._currentSegmentIndex = 0;
    return true;
  }

  // ============================================
  // PROTECTED: EVENT HANDLING
  // ============================================

  /**
   * Flushes queued custom events to rrweb with retry, preserving order.
   * Mutex-guarded to prevent concurrent execution / duplication.
   */
  protected async flushEventQueue(): Promise<void> {
    if (this._queue.length === 0) return;
    if (this._flushInProgress) return;

    this._flushInProgress = true;
    try {
      if (!(await this.isReady())) {
        return;
      }

      while (this._queue.length > 0) {
        const queued = this._queue[0];
        const { tag, payload } = queued;
        const retries = queued.__retries ?? 0;

        if (retries >= this._retries) {
          this.onError(new Error('Max dispatch retries exceeded'), {
            tag,
            payload,
            retries,
          });
          this._queue.shift();
          continue;
        }

        try {
          await this.invokeAddEventFn(tag, payload);
          recorderHooks.emit('recorder:event:dispatch', {
            recorder: this,
            tag,
            payload,
          });
          this._queue.shift();
        } catch (error) {
          queued.__retries = retries + 1;
          this.onError(error as Error, { tag, payload, retries: retries + 1 });
          break; // preserve order; retry remaining later
        }
      }
    } finally {
      this._flushInProgress = false;
    }
  }

  /**
   * Stores an incoming rrweb event in the segmented buffer. Resilient: a handler
   * failure never stops recording.
   * @param event rrweb event with timestamp.
   * @param isCheckout When true, starts a new segment.
   */
  public async handleEvent(
    event: eventWithTime,
    isCheckout?: boolean,
  ): Promise<void> {
    const currentHref = await this.getHref();
    try {
      const recEvent: RecorderEvent = { ...event };

      if (!this._interactionRecorded && this.isInteractionEvent(event)) {
        this._interactionRecorded = true;
      }

      if (isCheckout) {
        this._eventsMatrix.push([]);
        this._currentSegmentIndex++;
      }
      this._eventsMatrix[this._currentSegmentIndex].push(recEvent);

      await this.onHandleEvent(recEvent, isCheckout);

      recorderHooks.emit('recorder:event:emit', {
        recorder: this,
        event: recEvent,
        isCheckout,
        currentHref,
      });
    } catch (error) {
      this.onError(error as Error, { event, isCheckout, method: 'handleEvent' });
    }
  }

  /**
   * Whether the event represents user activity: an interactive incremental
   * source, or any custom event except the engine's own navigation marker.
   */
  private isInteractionEvent(event: eventWithTime): boolean {
    if (event.type === EVENT_TYPE_INCREMENTAL) {
      const source = (event.data as { source?: number } | undefined)?.source;
      return source !== undefined && INTERACTIVE_INCREMENTAL_SOURCES.has(source);
    }
    if (event.type === EVENT_TYPE_CUSTOM) {
      const tag = (event.data as { tag?: string } | undefined)?.tag;
      return tag !== undefined && tag !== NAVIGATION_CUSTOM_EVENT_TAG;
    }
    return false;
  }

  // ============================================
  // PROTECTED HOOKS (optional overrides)
  // ============================================

  protected async onHandleEvent(
    _event: RecorderEvent,
    _isCheckout?: boolean,
  ): Promise<void> {}

  protected async onBeforeBind(): Promise<void> {}
  protected async onAfterBind(): Promise<void> {}
  protected async onBeforeInject(): Promise<void> {}
  protected async onAfterInject(): Promise<void> {}

  protected async onBeforeStart(): Promise<void> {
    // If restarting after a stop, add a fresh segment to continue history.
    if (
      this._eventsMatrix.length > 0 &&
      this._eventsMatrix[this._currentSegmentIndex].length > 0
    ) {
      this._eventsMatrix.push([]);
      this._currentSegmentIndex++;
    }
  }

  protected async onAfterStart(): Promise<void> {}
  protected async onBeforeStop(): Promise<void> {}
  protected async onAfterStop(): Promise<void> {}

  protected onError(error: Error, context?: unknown): void {
    recorderHooks.emit('recorder:error', { recorder: this, error, context });
  }

  // ============================================
  // ABSTRACT METHODS
  // ============================================

  protected abstract invokeInjectFn(umdSource: string): Promise<void>;
  protected abstract invokeRecordFn(
    options: recordOptions<eventWithTime>,
  ): Promise<void>;
  protected abstract invokeStopFn(): Promise<void>;
  protected abstract invokeAddEventFn(
    tag: string,
    payload: customEventPayload,
  ): Promise<void>;
  abstract isReady(): Promise<boolean>;
  abstract isRecording(): Promise<boolean>;
  abstract getHref(): Promise<string>;

  /**
   * Resolves once the buffered event count stops growing or the timeout elapses.
   * Useful to let rrweb flush delayed/trailing events before reading them.
   */
  public async waitForRecorderStabilization(timeout = 500): Promise<void> {
    const startTime = Date.now();
    let lastCount = this.events.length;

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const currentCount = this.events.length;
        if (currentCount === lastCount || Date.now() - startTime > timeout) {
          clearInterval(interval);
          resolve();
        }
        lastCount = currentCount;
      }, 50);
    });
  }
}
