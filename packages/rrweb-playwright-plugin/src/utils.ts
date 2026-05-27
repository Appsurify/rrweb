import os from 'os';
import path from 'path';
import fs from 'fs';
import { Browser, Page, Frame, TestInfo } from '@playwright/test';
import type { RecorderEvent } from './recorder/types';
import type { TestRunContext, TestRunResult, SerializedValue } from './types';
export const defaultOutputReportDir = 'test-results/playwright/ui';

export function saveRRWebReport(testRunResult: TestRunResult, outputReportDir?: string) {
  const reportDir = outputReportDir !== undefined ? outputReportDir : defaultOutputReportDir;

  // Note: per-run cleanup of `reportDir` is owned by RRWebReporter.onBegin,
  // which runs once in the main process before any worker spawns. Doing it
  // here per-test was racy (cleanupVerified is per-process, so it re-fired
  // whenever Playwright restarted a worker between spec files, deleting all
  // earlier specs' reports).

  const specName = sanitizeFileNamePart(testRunResult.spec.name);
  const suiteTitle = sanitizeFileNamePart(testRunResult.test.suite?.title);
  const testTitle = sanitizeFileNamePart(testRunResult.test.title);
  const browserName = testRunResult.browser.name;

  const jsonFileNameRaw = `${suiteTitle ? suiteTitle + '-' : ''}${testTitle}.json`;
  const jsonFilePathRaw = path.join(reportDir, specName, browserName, jsonFileNameRaw);
  const reportRaw = {
    events: testRunResult.recorderEvents,
    metadata: {
      runner: testRunResult.runner,
      spec: testRunResult.spec,
      suite: testRunResult.test.suite,
      test: testRunResult.test,
      browser: testRunResult.browser,
    }
  };
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(path.dirname(jsonFilePathRaw), { recursive: true });
  fs.writeFileSync(jsonFilePathRaw, JSON.stringify(reportRaw, null, 2), 'utf-8');
  console.log(`[ui-coverage] Saved report to ${jsonFilePathRaw}`);
}

export function sanitizeFileNamePart(name: string | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/[\s:/\\<>|"'?*]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function createTestrunContext(browser: Browser, testInfo: TestInfo): TestRunContext {
  const browserType = browser.browserType();
  const version = browser.version();
  const family = browserType.name();

  const absolute = testInfo.file;
  const relative = absolute.replace(process.cwd(), '').replace(/^[/\\]/, '');
  const baseName = relative.split(/[\\/]/).pop() ?? '';
  const [fileName, fileExtension] = baseName.split(/\.(?=[^\\.]+$)/);

  const suiteTitlePath = testInfo.titlePath.slice(1, -1); // всё кроме последнего (сам тест)
  const suiteTitle = suiteTitlePath.join(' > ') || 'Root Suite';

  const testRunContext: TestRunContext = {
    runner: {
      source: 'playwright',
      type: 'unknown',
      version: testInfo.config.version,
      platform: os.platform(),
      arch: os.arch(),
      recorder: {
        scriptVersion: 'unknown',
        libVersion: 'unknown'
      }

    },
    spec: {
      name: baseName,
      relative,
      absolute,
      baseName,
      fileName,
      fileExtension,
      id: relative,
    },
    test: {
      suite: {
        id: suiteTitlePath.join('::') || 'root',
        invocationDetails: {
          absoluteFile: absolute,
          column: testInfo.column ?? 0,
          line: testInfo.line ?? 0,
          fileUrl: undefined,
          function: undefined,
          originalFile: undefined,
          relativeFile: relative,
        },
        pending: false,
        root: suiteTitlePath.length === 0,
        title: suiteTitle,
        type: "unknown"
      },
      id: testInfo.testId,
      title: testInfo.title,
      titlePath: testInfo.titlePath.slice(1),
      fullTitle: testInfo.titlePath.slice(1).join(' '),
      file: testInfo.file,
      invocationDetails: {
        absoluteFile: absolute,
        column: testInfo.column,
        line: testInfo.line,
        fileUrl: '',
        relativeFile: relative,
      },
      state: testInfo.status,
      duration: testInfo.duration,
      pending: false,
      sync: false,
      timedOut: undefined,
      type: ''
    },
    browser: {
      name: family,
      family,
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
      displayName: testInfo.project.use?.channel?.toUpperCase?.() ?? family.charAt(0).toUpperCase() + family.slice(1),
      channel: testInfo.project.use?.channel ?? '',
      path: browserType.executablePath(),
    },
    recorderEvents: [] as RecorderEvent[],
  };
  return testRunContext
}

export function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      result[key] = sourceValue as unknown;
    }
  }

  return result;
}

export async function waitForNextRAF(page: Page) {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
}

export async function waitForRAF(
  pageOrFrame: Page | Frame,
) {
  return await pageOrFrame.evaluate(() => {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  });
}

export function parseSerializedValue(value: SerializedValue, handles: any[] | undefined): any {
  return innerParseSerializedValue(value, handles, new Map(), []);
}

function innerParseSerializedValue(value: SerializedValue, handles: any[] | undefined, refs: Map<number, object>, accessChain: Array<string | number>): any {
  if (value.ref !== undefined)
    return refs.get(value.ref);
  if (value.n !== undefined)
    return value.n;
  if (value.s !== undefined)
    return value.s;
  if (value.b !== undefined)
    return value.b;
  if (value.v !== undefined) {
    if (value.v === 'undefined')
      return undefined;
    if (value.v === 'null')
      return null;
    if (value.v === 'NaN')
      return NaN;
    if (value.v === 'Infinity')
      return Infinity;
    if (value.v === '-Infinity')
      return -Infinity;
    if (value.v === '-0')
      return -0;
  }
  if (value.d !== undefined)
    return new Date(value.d);
  if (value.u !== undefined)
    return new URL(value.u);
  if (value.bi !== undefined)
    return BigInt(value.bi);
  if (value.e !== undefined) {
    const error = new Error(value.e.m);
    error.name = value.e.n;
    error.stack = value.e.s;
    return error;
  }
  if (value.r !== undefined)
    return new RegExp(value.r.p, value.r.f);
  if (value.ta !== undefined) {
    const ctor = typedArrayKindToConstructor[value.ta.k] as any;
    return new ctor(value.ta.b.buffer, value.ta.b.byteOffset, value.ta.b.length / ctor.BYTES_PER_ELEMENT);
  }

  if (value.a !== undefined) {
    const result: any[] = [];
    refs.set(value.id!, result);
    for (let i = 0; i < value.a.length; i++)
      result.push(innerParseSerializedValue(value.a[i], handles, refs, [...accessChain, i]));
    return result;
  }
  if (value.o !== undefined) {
    const result: any = {};
    refs.set(value.id!, result);
    for (const { k, v } of value.o)
      result[k] = innerParseSerializedValue(v, handles, refs, [...accessChain, k]);
    return result;
  }
  if (value.h !== undefined) {
    if (handles === undefined)
      throw new Error('Unexpected handle');
    return handles[value.h];
  }
  throw new Error(`Attempting to deserialize unexpected value${accessChainToDisplayString(accessChain)}: ${value}`);
}

export type HandleOrValue = { h: number } | { fallThrough: any };
type VisitorInfo = {
  visited: Map<object, number>;
  lastId: number;
};

export function serializeValue(value: any, handleSerializer: (value: any) => HandleOrValue): SerializedValue {
  return innerSerializeValue(value, handleSerializer, { lastId: 0, visited: new Map() }, []);
}

function innerSerializeValue(value: any, handleSerializer: (value: any) => HandleOrValue, visitorInfo: VisitorInfo, accessChain: Array<string | number>): SerializedValue {
  const handle = handleSerializer(value);
  if ('fallThrough' in handle)
    value = handle.fallThrough;
  else
    return handle;

  if (typeof value === 'symbol')
    return { v: 'undefined' };
  if (Object.is(value, undefined))
    return { v: 'undefined' };
  if (Object.is(value, null))
    return { v: 'null' };
  if (Object.is(value, NaN))
    return { v: 'NaN' };
  if (Object.is(value, Infinity))
    return { v: 'Infinity' };
  if (Object.is(value, -Infinity))
    return { v: '-Infinity' };
  if (Object.is(value, -0))
    return { v: '-0' };
  if (typeof value === 'boolean')
    return { b: value };
  if (typeof value === 'number')
    return { n: value };
  if (typeof value === 'string')
    return { s: value };
  if (typeof value === 'bigint')
    return { bi: value.toString() };
  if (isError(value))
    return { e: { n: value.name, m: value.message, s: value.stack || '' } };
  if (isDate(value))
    return { d: value.toJSON() };
  if (isURL(value))
    return { u: value.toJSON() };
  if (isRegExp(value))
    return { r: { p: value.source, f: value.flags } };

  const typedArrayKind = constructorToTypedArrayKind.get(value.constructor);
  if (typedArrayKind)
    return { ta: { b: Buffer.from(value.buffer, value.byteOffset, value.byteLength), k: typedArrayKind } };

  const id = visitorInfo.visited.get(value);
  if (id)
    return { ref: id };

  if (Array.isArray(value)) {
    const a = [];
    const id = ++visitorInfo.lastId;
    visitorInfo.visited.set(value, id);
    for (let i = 0; i < value.length; ++i)
      a.push(innerSerializeValue(value[i], handleSerializer, visitorInfo, [...accessChain, i]));
    return { a, id };
  }
  if (typeof value === 'object') {
    const o: { k: string, v: SerializedValue }[] = [];
    const id = ++visitorInfo.lastId;
    visitorInfo.visited.set(value, id);
    for (const name of Object.keys(value))
      o.push({ k: name, v: innerSerializeValue(value[name], handleSerializer, visitorInfo, [...accessChain, name]) });
    return { o, id };
  }
  throw new Error(`Attempting to serialize unexpected value${accessChainToDisplayString(accessChain)}: ${value}`);
}

function accessChainToDisplayString(accessChain: Array<string | number>): string {
  const chainString = accessChain.map((accessor, i) => {
    if (typeof accessor === 'string')
      return i ? `.${accessor}` : accessor;
    return `[${accessor}]`;
  }).join('');

  return chainString.length > 0 ? ` at position "${chainString}"` : '';
}

function isRegExp(obj: any): obj is RegExp {
  return obj instanceof RegExp || Object.prototype.toString.call(obj) === '[object RegExp]';
}

function isDate(obj: any): obj is Date {
  return obj instanceof Date || Object.prototype.toString.call(obj) === '[object Date]';
}

function isURL(obj: any): obj is URL {
  return obj instanceof URL || Object.prototype.toString.call(obj) === '[object URL]';
}

function isError(obj: any): obj is Error {
  const proto = obj ? Object.getPrototypeOf(obj) : null;
  return obj instanceof Error || proto?.name === 'Error' || (proto && isError(proto));
}


type TypedArrayKind = NonNullable<SerializedValue['ta']>['k'];
const typedArrayKindToConstructor: Record<TypedArrayKind, Function> = {
  i8: Int8Array,
  ui8: Uint8Array,
  ui8c: Uint8ClampedArray,
  i16: Int16Array,
  ui16: Uint16Array,
  i32: Int32Array,
  ui32: Uint32Array,
  f32: Float32Array,
  f64: Float64Array,
  bi64: BigInt64Array,
  bui64: BigUint64Array,
};

const constructorToTypedArrayKind: Map<Function, TypedArrayKind> = new Map(Object.entries(typedArrayKindToConstructor).map(([k, v]) => [v, k as TypedArrayKind]));
