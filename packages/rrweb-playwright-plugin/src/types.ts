import type { RecorderEvent } from './recorder/types';
import RRWebRecorder from './recorder';

export type RunnerInfo = Partial<{
  source: string,
  type: string,
  version: string,
  platform?: string,
  arch?: string,
  recorder?: {
    scriptVersion?: string,
    libVersion?: string,
  }
}>

export interface TestRunContext {
  runner: RunnerInfo;
  spec: SpecInfo;
  test: TestInfo;
  browser: BrowserInfo;
  recorderEvents: RecorderEvent[],
  recorderInstance?: RRWebRecorder
}

export type TestInfoInvocationDetails = {
  absoluteFile: string;
  column: number;
  fileUrl?: string;
  function?: string;
  line: number;
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

export type TestRunResult = {
    runner: RunnerInfo;
    spec: SpecInfo;
    test: TestInfo;
    browser: BrowserInfo;
    recorderEvents: RecorderEvent[];
}

export type Binary = Buffer;

export type SerializedValue = {
  n?: number,
  b?: boolean,
  s?: string,
  v?: 'null' | 'undefined' | 'NaN' | 'Infinity' | '-Infinity' | '-0',
  d?: string,
  u?: string,
  bi?: string,
  ta?: {
    b: Binary,
    k: 'i8' | 'ui8' | 'ui8c' | 'i16' | 'ui16' | 'i32' | 'ui32' | 'f32' | 'f64' | 'bi64' | 'bui64',
  },
  e?: {
    m: string,
    n: string,
    s: string,
  },
  r?: {
    p: string,
    f: string,
  },
  a?: SerializedValue[],
  o?: {
    k: string,
    v: SerializedValue,
  }[],
  h?: number,
  id?: number,
  ref?: number,
};

