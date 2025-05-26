import type { RecorderEvent } from './recorder/types';
export interface TestRunContext {
    spec: Cypress.Spec;
    test: Mocha.Test;
    browser: Cypress.Browser;
    autWindow: Cypress.AUTWindow | null;
    waitForPaint: () => Promise<unknown>;
    paintComplete: boolean;
    commandLiveRefs: Map<string, Cypress.CommandQueue>;
    recorderEvents: RecorderEvent[];
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
    pending: boolean;
    root: boolean;
    title: string;
    type: string;
};
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
};
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
};
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
};
export type TestRunResult = {
    spec: SpecInfo;
    test: TestInfo;
    browser: BrowserInfo;
    recorderEvents: RecorderEvent[];
};
