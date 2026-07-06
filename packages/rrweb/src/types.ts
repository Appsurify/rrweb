import type {
  Mirror,
  MaskInputOptions,
  SlimDOMOptions,
  MaskInputFn,
  MaskTextFn,
} from '@appsurify-testmap/rrweb-snapshot';
import type { IframeManager } from './record/iframe-manager';
import type { ShadowDomManager } from './record/shadow-dom-manager';
import type { Replayer } from './replay';
import type { RRNode } from '@appsurify-testmap/rrdom';
import type { CanvasManager } from './record/observers/canvas/canvas-manager';
import type { VisibilityManager } from './record/observers/visibility/visibility-manager';
import type { NavigationManager } from './record/observers/navigation/navigation-manager';
import type { StylesheetManager } from './record/stylesheet-manager';
import type {
  DataURLOptions,
  InlineImagesOptions,
  addedNodeMutation,
  blockClass,
  excludeAttribute,
  canvasMutationCallback,
  customElementCallback,
  eventWithTime,
  fontCallback,
  hooksParam,
  inputCallback,
  IWindow,
  KeepIframeSrcFn,
  listenerHandler,
  maskTextClass,
  mediaInteractionCallback,
  mouseInteractionCallBack,
  mousemoveCallBack,
  mutationCallBack,
  navigationCallback,
  RecordPlugin,
  SamplingStrategy,
  scrollCallback,
  selectionCallback,
  SelectorOptions,
  styleDeclarationCallback,
  styleSheetRuleCallback,
  viewportResizeCallback,
  PackFn,
  UnpackFn,
} from '@appsurify-testmap/rrweb-types';
import type ProcessedNodeManager from './record/processed-node-manager';
import type { NormalizedSelectorOptions } from './record/selector';


export type recordOptions<T> = {
  emit?: (e: T, isCheckout?: boolean) => void;
  checkoutEveryNth?: number;
  checkoutEveryNms?: number;
  checkoutEveryNvm?: number;
  checkoutDebounce?: number;
  blockClass?: blockClass;
  blockSelector?: string;
  ignoreClass?: string;
  ignoreSelector?: string;
  maskTextClass?: maskTextClass;
  maskTextSelector?: string;
  excludeAttribute?: excludeAttribute;
  maskAllInputs?: boolean;
  maskInputOptions?: MaskInputOptions;
  maskInputFn?: MaskInputFn;
  maskTextFn?: MaskTextFn;
  slimDOMOptions?: SlimDOMOptions | 'all' | true;
  ignoreCSSAttributes?: Set<string>;
  inlineStylesheet?: boolean | 'all';
  hooks?: hooksParam;
  packFn?: PackFn;
  sampling?: SamplingStrategy;
  dataURLOptions?: DataURLOptions;
  recordDOM?: boolean;
  recordCanvas?: boolean;
  recordCrossOriginIframes?: boolean;
  recordAfter?: 'DOMContentLoaded' | 'load' | 'DOMContentStabilized';
  flushCustomEvent?: 'before' | 'after';
  userTriggeredOnInput?: boolean;
  collectFonts?: boolean;
  inlineImages?: boolean | InlineImagesOptions;
  plugins?: RecordPlugin[];
  selector?: boolean | SelectorOptions;
  trustSyntheticInput?: boolean;
  // departed, please use sampling options
  mousemoveWait?: number;
  keepIframeSrcFn?: KeepIframeSrcFn;
  errorHandler?: ErrorHandler;
  customWindow?: Window;
  customDocument?: Document;
};

export type observerParam = {
  mutationCb: mutationCallBack;
  mousemoveCb: mousemoveCallBack;
  mouseInteractionCb: mouseInteractionCallBack;
  scrollCb: scrollCallback;
  viewportResizeCb: viewportResizeCallback;
  navigationCb: navigationCallback;
  inputCb: inputCallback;
  mediaInteractionCb: mediaInteractionCallback;
  selectionCb: selectionCallback;
  blockClass: blockClass;
  blockSelector: string | null;
  ignoreClass: string;
  ignoreSelector: string | null;
  excludeAttribute: excludeAttribute;
  maskTextClass: maskTextClass;
  maskTextSelector: string | null;
  maskInputOptions: MaskInputOptions;
  maskInputFn?: MaskInputFn;
  maskTextFn?: MaskTextFn;
  keepIframeSrcFn: KeepIframeSrcFn;
  inlineStylesheet: boolean | 'all';
  styleSheetRuleCb: styleSheetRuleCallback;
  styleDeclarationCb: styleDeclarationCallback;
  canvasMutationCb: canvasMutationCallback;
  customElementCb: customElementCallback;
  fontCb: fontCallback;
  sampling: SamplingStrategy;
  recordDOM: boolean;
  recordCanvas: boolean;
  inlineImages: boolean | InlineImagesOptions;
  userTriggeredOnInput: boolean;
  trustSyntheticInput: boolean;
  collectFonts: boolean;
  slimDOMOptions: SlimDOMOptions;
  dataURLOptions: DataURLOptions;
  selectorOptions: NormalizedSelectorOptions | null;
  doc: Document;
  mirror: Mirror;
  iframeManager: IframeManager;
  stylesheetManager: StylesheetManager;
  shadowDomManager: ShadowDomManager;
  canvasManager: CanvasManager;
  processedNodeManager: ProcessedNodeManager;
  visibilityManager?: VisibilityManager;
  navigationManager?: NavigationManager;
  ignoreCSSAttributes: Set<string>;
  plugins: Array<{
    observer: (
      cb: (...arg: Array<unknown>) => void,
      win: IWindow,
      options: unknown,
    ) => listenerHandler;
    callback: (...arg: Array<unknown>) => void;
    options: unknown;
  }>;
};

export type MutationBufferParam = Pick<
  observerParam,
  | 'mutationCb'
  | 'blockClass'
  | 'blockSelector'
  | 'maskTextClass'
  | 'maskTextSelector'
  | 'excludeAttribute'
  | 'inlineStylesheet'
  | 'maskInputOptions'
  | 'maskTextFn'
  | 'maskInputFn'
  | 'keepIframeSrcFn'
  | 'recordCanvas'
  | 'inlineImages'
  | 'slimDOMOptions'
  | 'dataURLOptions'
  | 'selectorOptions'
  | 'doc'
  | 'mirror'
  | 'iframeManager'
  | 'stylesheetManager'
  | 'shadowDomManager'
  | 'canvasManager'
  | 'processedNodeManager'
>;

export type ReplayPlugin = {
  handler?: (
    event: eventWithTime,
    isSync: boolean,
    context: { replayer: Replayer },
  ) => void;
  onBuild?: (
    node: Node | RRNode,
    context: { id: number; replayer: Replayer },
  ) => void;
  getMirror?: (mirrors: { nodeMirror: Mirror }) => void;
};
export type { Replayer } from './replay';
export type playerConfig = {
  speed: number;
  maxSpeed: number;
  root: Element;
  loadTimeout: number;
  skipInactive: boolean;
  inactivePeriodThreshold: number;
  showWarning: boolean;
  showDebug: boolean;
  blockClass: string;
  liveMode: boolean;
  insertStyleRules: string[];
  triggerFocus: boolean;
  UNSAFE_replayCanvas: boolean;
  pauseAnimation?: boolean;
  mouseTail:
    | boolean
    | {
        duration?: number;
        lineCap?: string;
        lineWidth?: number;
        strokeStyle?: string;
      };
  unpackFn?: UnpackFn;
  useVirtualDom: boolean;
  logger: {
    log: (...args: Parameters<typeof console.log>) => void;
    warn: (...args: Parameters<typeof console.warn>) => void;
  };
  plugins?: ReplayPlugin[];
};

export type missingNode = {
  node: Node | RRNode;
  mutation: addedNodeMutation;
};
export type missingNodeMap = {
  [id: number]: missingNode;
};

declare global {
  interface Window {
    FontFace: typeof FontFace;
    Array: typeof Array;
  }
}

export type CrossOriginIframeMessageEventContent<T = eventWithTime> = {
  type: 'rrweb';
  event: T;
  isCheckout?: boolean;
};
export type CrossOriginIframeMessageEvent =
  MessageEvent<CrossOriginIframeMessageEventContent>;

export type ErrorHandler = (error: unknown) => void | boolean;
