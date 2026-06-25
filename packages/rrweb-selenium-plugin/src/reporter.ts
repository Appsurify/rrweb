import * as path from 'node:path';
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import type { Report, Reporter } from './types';

/** Default directory reports are written under. @public */
export const DEFAULT_OUTPUT_DIR = 'test-results/selenium/ui';
/** Default ZIP bundle file name (built by `finalize`). @public */
export const DEFAULT_ZIP_FILE = 'ui-coverage-reports.zip';

// ============================================================================
// FS helpers
// ============================================================================

/** Monotonic counter guaranteeing unique temp names within a process. */
let tmpCounter = 0;

/**
 * Writes a file atomically: data is written to a unique temp file in the same
 * directory and then renamed over the target (rename is atomic on POSIX).
 * @public
 */
export function writeFileAtomic(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${tmpCounter++}`,
  );
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/**
 * Normalizes a string into a safe path segment (spaces and special characters
 * collapse to single dashes; leading/trailing dashes are trimmed).
 * @public
 */
export function sanitizeFileNamePart(name: string | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/[\s:/\\<>|"'?*]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Recursively collects `.json` files under `dir`, preserving their relative path
 * (forward-slashed) as the archive name.
 * @public
 */
export function collectJsonFiles(
  dir: string,
): { absPath: string; arcName: string }[] {
  const result: { absPath: string; arcName: string }[] = [];
  const walk = (current: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const arc = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, arc);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        result.push({ absPath: abs, arcName: arc });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return result;
}

// ============================================================================
// Minimal STORE/DEFLATE ZIP writer (no central-directory encryption, no Zip64).
// Kept dependency-free so consumers don't need an extra package.
// ============================================================================

const CRC32_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
  compressed: Buffer;
  crc: number;
  offset: number;
}

/**
 * Builds a DEFLATE-compressed ZIP buffer from the given files.
 * @public
 */
export function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const entries: ZipEntry[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const compressed = zlib.deflateRawSync(f.data, { level: 6 });
    const crc = crc32(f.data);
    const nameBuf = Buffer.from(f.name, 'utf-8');

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags (UTF-8 name)
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    entries.push({ name: f.name, data: f.data, compressed, crc, offset });
    chunks.push(local, compressed);
    offset += local.length + compressed.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf-8');
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // flags (UTF-8)
    central.writeUInt16LE(8, 10); // method: deflate
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(e.offset, 42);
    nameBuf.copy(central, 46);
    chunks.push(central);
    offset += central.length;
  }

  const cdSize = offset - cdStart;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

/**
 * Wipes and recreates the output directory so a run starts clean — matching the
 * Playwright (`Reporter.onBegin`) and Cypress (`registerRRWebReportTasks`)
 * plugins, which overwrite (never append) prior-run reports.
 * @public
 * @remarks
 * MUST be called once per run in a single pre-run process (a runner's
 * global-setup hook); calling it from a per-worker/per-file context would race
 * and wipe sibling workers' reports.
 */
export function prepareOutputDir(outputDir: string = DEFAULT_OUTPUT_DIR): void {
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch {
    // best-effort: a locked/odd entry shouldn't abort the run
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Bundles every per-test JSON under `outputDir` into a single ZIP the backend
 * extractor natively supports.
 * @public
 * @remarks
 * Parallel-safe: the per-test files are the source of truth, so this never does
 * a lossy read-modify-write of a shared file. Safe to run once in teardown.
 * @returns The number of reports bundled.
 */
export function bundleReports(
  outputDir: string = DEFAULT_OUTPUT_DIR,
  zipFileName: string = DEFAULT_ZIP_FILE,
): number {
  const files = collectJsonFiles(outputDir);
  if (files.length === 0) return 0;
  const entries = files.map((f) => ({
    name: f.arcName,
    data: fs.readFileSync(f.absPath),
  }));
  const zipBuf = buildZip(entries);
  writeFileAtomic(path.join(outputDir, zipFileName), zipBuf);
  return entries.length;
}

// ============================================================================
// Reporter
// ============================================================================

/**
 * Options for {@link FsReporter}.
 * @public
 */
export interface FsReporterOptions {
  /** Directory reports are written under. */
  outputDir?: string;
  /** ZIP bundle file name (written by `finalize`). */
  zipFileName?: string;
}

/**
 * Filesystem {@link Reporter}: writes one JSON file per test, plus a ZIP bundle
 * built in `finalize`.
 * @public
 * @remarks
 * Per-test path: `<outputDir>/<spec>/<browser>/<suite>-<test>.json`, matching the
 * Playwright and Cypress plugins. All writes are atomic and never throw into the
 * test runner.
 */
export class FsReporter implements Reporter {
  private readonly outputDir: string;
  private readonly zipFileName: string;
  /** Per-test paths already written this run, to disambiguate collisions. */
  private readonly _usedPaths = new Set<string>();

  constructor(options: FsReporterOptions = {}) {
    this.outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    this.zipFileName = options.zipFileName ?? DEFAULT_ZIP_FILE;
  }

  /** Computes the per-test file path for a report. */
  reportPath(report: Report): string {
    const spec = sanitizeFileNamePart(report.metadata.spec?.name) || 'unknown-spec';
    const browser =
      sanitizeFileNamePart(report.metadata.browser?.name) || 'unknown-browser';
    const suite = sanitizeFileNamePart(report.metadata.suite?.title);
    const test = sanitizeFileNamePart(report.metadata.test?.title) || 'unknown-test';
    const fileName = `${suite ? suite + '-' : ''}${test}.json`;
    return path.join(this.outputDir, spec, browser, fileName);
  }

  /** Writes a single per-test report atomically. */
  async saveReport(report: Report): Promise<void> {
    try {
      const filePath = this._uniquePath(this.reportPath(report));
      writeFileAtomic(filePath, JSON.stringify(report, null, 2));
    } catch (error) {
      // Recording/reporting must never break the user's tests.
      // eslint-disable-next-line no-console
      console.warn('[ui-coverage] FsReporter.saveReport failed:', error);
    }
  }

  /**
   * Disambiguates report paths that collide after sanitization (two distinct
   * tests whose titles reduce to the same file name) by appending `-2`, `-3`, …
   * so a later report never silently overwrites an earlier one.
   */
  private _uniquePath(base: string): string {
    if (!this._usedPaths.has(base)) {
      this._usedPaths.add(base);
      return base;
    }
    const suffix = base.endsWith('.json') ? '.json' : '';
    const stem = suffix ? base.slice(0, -suffix.length) : base;
    let i = 2;
    let candidate = `${stem}-${i}${suffix}`;
    while (this._usedPaths.has(candidate)) {
      i += 1;
      candidate = `${stem}-${i}${suffix}`;
    }
    this._usedPaths.add(candidate);
    return candidate;
  }

  /** Bundles all per-test files into the ZIP. */
  async finalize(): Promise<void> {
    try {
      const count = bundleReports(this.outputDir, this.zipFileName);
      if (count > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[ui-coverage] Bundled ${count} reports into ${path.join(
            this.outputDir,
            this.zipFileName,
          )}`,
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[ui-coverage] FsReporter.finalize failed:', error);
    }
  }
}
