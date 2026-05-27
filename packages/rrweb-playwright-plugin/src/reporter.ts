import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
} from '@playwright/test/reporter';
import { defaultOutputReportDir } from './utils';
import type { TestmapConfig } from './types';

// CRC-32 table (IEEE 802.3 polynomial) — used by ZIP local & central headers.
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
 * Minimal STORE/DEFLATE ZIP writer (no central directory encryption,
 * no Zip64). Mirrors the writer in rrweb-cypress-plugin/reporter.ts so
 * the on-disk ZIP layout is identical between the two plugins.
 */
function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const entries: ZipEntry[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const compressed = zlib.deflateRawSync(f.data, { level: 6 });
    const crc = crc32(f.data);
    const nameBuf = Buffer.from(f.name, 'utf-8');

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
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
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
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

function collectJsonFiles(dir: string): { absPath: string; arcName: string }[] {
  const result: { absPath: string; arcName: string }[] = [];
  const walk = (current: string, prefix: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
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

export default class RRWebReporter implements Reporter {
  private reportDirs = new Set<string>();
  // Relative paths are resolved against the directory holding playwright.config.*,
  // falling back to process.cwd(). This matches fixture-side behavior, since
  // Playwright is normally invoked from the directory containing the config.
  private baseDir = process.cwd();

  onBegin(config: FullConfig, _suite: Suite): void {
    if (config.configFile) {
      this.baseDir = path.dirname(config.configFile);
    }

    // Mirror fixture-side resolution (saveRRWebReport in utils.ts):
    // for every project, the effective reportDir is
    //   project.use.testmap.outputReportDir ?? defaultOutputReportDir
    // We collect the unique set so each on-disk directory gets its own ZIP.
    for (const project of config.projects) {
      const use = project.use as { testmap?: TestmapConfig } | undefined;
      const dir = use?.testmap?.outputReportDir ?? defaultOutputReportDir;
      this.reportDirs.add(this.resolveDir(dir));
    }

    // Fallback: no projects (rare — e.g. single-config setup without a projects array).
    if (this.reportDirs.size === 0) {
      this.reportDirs.add(this.resolveDir(defaultOutputReportDir));
    }

    // Wipe stale per-test reports from the previous run. The Reporter runs
    // exactly once in the main process before any worker spawns, so this is
    // the only safe place — no cross-worker race, no in-memory-flag gymnastics,
    // and (unlike the previous per-test ensureRunCleanup) immune to worker
    // process restarts between spec files.
    for (const dir of this.reportDirs) {
      this.cleanDir(dir);
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    for (const dir of this.reportDirs) {
      this.bundleDir(dir);
    }
  }

  private resolveDir(dir: string): string {
    return path.isAbsolute(dir) ? dir : path.resolve(this.baseDir, dir);
  }

  private cleanDir(dir: string): void {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[ui-coverage] Cleaned report dir ${dir}`);
    } catch (e) {
      console.warn(`[ui-coverage] Failed to clean ${dir}:`, e);
    }
  }

  private bundleDir(dir: string): void {
    try {
      const files = collectJsonFiles(dir);
      if (files.length === 0) {
        console.log(`[ui-coverage] No per-test reports in ${dir}, skipping ZIP.`);
        return;
      }
      const entries = files.map((f) => ({
        name: f.arcName,
        data: fs.readFileSync(f.absPath),
      }));
      const zipBuf = buildZip(entries);
      const zipPath = path.join(dir, 'ui-coverage-reports.zip');
      fs.writeFileSync(zipPath, zipBuf);
      console.log(`[ui-coverage] Bundled ${entries.length} reports into ${zipPath}`);
    } catch (e) {
      console.warn(`[ui-coverage] Failed to bundle reports into ZIP at ${dir}:`, e);
    }
  }
}
