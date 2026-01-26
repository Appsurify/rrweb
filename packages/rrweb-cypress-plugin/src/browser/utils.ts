/// <reference types="cypress" />
import type {
  TestSuiteInfo,
  TestInfo,
  TestInfoInvocationDetails,
  TestRunResult,
  TestRunContext, SpecInfo, BrowserInfo,
} from '../types';


export function safeSerializeArray(arr: unknown[]): (string | number | boolean | null)[] {
  return arr
    .filter((value): value is string | number | boolean | null => {
      // Удаляем { log: false }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (typeof value === 'object' && value !== null && 'log' in value && (value as any).log === false) {
        return false;
      }

      // Пропускаем только примитивы
      return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      );
    });
}

export function getTestKey(test: Mocha.Test | { titlePath: () => string[] }): string {
    return test.titlePath().join(' > ');
}

export function getSizeInBytes(data: unknown): number {
    let str: string;

    if (typeof data === 'string') {
        str = data;
    } else {
        try {
            str = JSON.stringify(data);
        } catch {
            return 0;
        }
    }

    return new TextEncoder().encode(str).length;
}

export function formatBytes(bytes: number): string {
    const kb = bytes / 1024;
    const mb = kb / 1024;

    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    if (kb >= 1) return `${kb.toFixed(2)} KB`;
    return `${bytes} B`;
}

export async function createHash(data: object): Promise<string> {
    const json = JSON.stringify(data);
    const buffer = new TextEncoder().encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


export function prepareTestSuite(suite: Mocha.Suite & {id: string, type: string} | undefined): TestSuiteInfo | undefined {
    if (!suite) return undefined;


  return {
        id: suite.id,
        file: suite.file,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        invocationDetails: safeInvocationDetails(suite.invocationDetails),
        pending: suite.pending,
        root: suite.root,
        title: suite.title,
        type: suite.type,
    }
}

export function prepareTest(test: Mocha.Test & {id: string, type: string, parent: Mocha.Suite | undefined}): TestInfo {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const suite = prepareTestSuite(test.parent);
    console.log("Suite", suite);
    return {
        suite: suite,
        file: test.file,
        duration: test.duration,
        id: test.id,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        invocationDetails: safeInvocationDetails(test.invocationDetails),
        pending: test.pending,
        state: test.state,
        sync: test.sync,
        timedOut: test.timedOut,
        title: test.title,
        titlePath: test.titlePath(),
        fullTitle: test.fullTitle(),
        type: test.type,
    }
}

export function safeInvocationDetails(details?: Partial<TestInfoInvocationDetails>): TestInfoInvocationDetails {
  return {
    absoluteFile: details?.absoluteFile ?? '',
    column: details?.column ?? 0,
    fileUrl: details?.fileUrl ?? '',
    function: details?.function ?? '',
    line: details?.line ?? 0,
    originalFile: details?.originalFile ?? '',
    relativeFile: details?.relativeFile ?? '',
  };
}


export function mapTestRunContextToResult(ctx: TestRunContext): TestRunResult {

  return {
    runner: ctx.runner,
    spec: mapSpec(ctx.spec),
    browser: mapBrowser(ctx.browser),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    test: mapTest(ctx.test),
    recorderEvents: Array.isArray(ctx.recorderEvents) ? ctx.recorderEvents : [],
  };
}

export function mapSpec(spec: Cypress.Spec): SpecInfo {
  return {
    name: spec.name ?? '',
    absolute: spec.absolute ?? '',
    relative: spec.relative ?? '',
    specFilter: spec.specFilter ?? '',
    specType: spec.specType ?? 'integration',
    baseName: spec.baseName ?? '',
    fileExtension: spec.fileExtension ?? '',
    fileName: spec.fileName ?? '',
    id: spec.id ?? '',
  };
}

export function mapBrowser(browser: Cypress.Browser): BrowserInfo {
  return {
    name: browser.name ?? '',
    version: browser.version ?? '',
    displayName: browser.displayName ?? '',
    family: browser.family ?? '',
    majorVersion: browser.majorVersion ?? '',
    channel: browser.channel ?? '',
    path: browser.path ?? '',
  };
}

export function mapTest(test: Mocha.Test & {id: string}): TestInfo {


  return {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    suite: prepareTestSuite(test.parent),
    file: test.file ?? '',
    duration: test.duration ?? 0,
    id: test.id ?? '',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    invocationDetails: safeInvocationDetails(test.invocationDetails),
    pending: test.pending ?? false,
    state: test.state ?? 'unknown',
    sync: test.sync ?? false,
    timedOut: test.timedOut ?? false,
    title: test.title ?? '',
    titlePath: typeof test.titlePath === 'function' ? test.titlePath() : [],
    fullTitle: typeof test.fullTitle === 'function' ? test.fullTitle() : '',
    type: test.type ?? 'test',
  };
}
