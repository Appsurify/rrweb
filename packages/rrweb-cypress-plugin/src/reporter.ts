import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import type { TestRunResult } from './types';

let pluginConfig: {
  outputReportDir: string;
} = {
  outputReportDir: 'test-results/cypress/ui'
};

function sanitizeFileNamePart(name: string | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/[\s:/\\<>|"'?*]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

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
  name: string;          // arcname (forward slashes)
  data: Buffer;          // raw uncompressed
  compressed: Buffer;    // deflateRaw output
  crc: number;
  offset: number;        // offset of local header in output buffer
}

/**
 * Minimal STORE/DEFLATE ZIP writer (no central directory encryption,
 * no Zip64). Sufficient for archiving per-test JSON reports. Stays
 * tiny (no external deps) so demo node_modules doesn't need extra packages.
 */
function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const entries: ZipEntry[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const compressed = zlib.deflateRawSync(f.data, { level: 6 });
    const crc = crc32(f.data);
    const nameBuf = Buffer.from(f.name, 'utf-8');

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);    // signature
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // general purpose flags (UTF-8 name)
    local.writeUInt16LE(8, 8);             // method: deflate
    local.writeUInt16LE(0, 10);            // mod time
    local.writeUInt16LE(0, 12);            // mod date
    local.writeUInt32LE(crc, 14);          // crc-32
    local.writeUInt32LE(compressed.length, 18); // compressed size
    local.writeUInt32LE(f.data.length, 22);     // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);    // file name length
    local.writeUInt16LE(0, 28);                 // extra field length
    nameBuf.copy(local, 30);

    entries.push({ name: f.name, data: f.data, compressed, crc, offset });
    chunks.push(local, compressed);
    offset += local.length + compressed.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf-8');
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0x0800, 8);      // flags (UTF-8)
    central.writeUInt16LE(8, 10);          // method: deflate
    central.writeUInt16LE(0, 12);          // mod time
    central.writeUInt16LE(0, 14);          // mod date
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          // extra
    central.writeUInt16LE(0, 32);          // comment
    central.writeUInt16LE(0, 34);          // disk number start
    central.writeUInt16LE(0, 36);          // internal attrs
    central.writeUInt32LE(0, 38);          // external attrs
    central.writeUInt32LE(e.offset, 42);
    nameBuf.copy(central, 46);
    chunks.push(central);
    offset += central.length;
  }

  const cdSize = offset - cdStart;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                 // disk number
  eocd.writeUInt16LE(0, 6);                 // disk with central dir start
  eocd.writeUInt16LE(entries.length, 8);    // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);   // total entries
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);                // comment length
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

export default function registerRRWebReportTasks(on: Cypress.PluginEvents, config?: Partial<typeof pluginConfig>) {
  pluginConfig = { ...pluginConfig, ...config };

  // Clean output directory from previous run so it only contains
  // results from the current run (removes stale individual files too).
  if (fs.existsSync(pluginConfig.outputReportDir)) {
    fs.rmSync(pluginConfig.outputReportDir, { recursive: true, force: true });
  }
  fs.mkdirSync(pluginConfig.outputReportDir, { recursive: true });

  on('task', {
    saveRRWebReport(reportData: {testRunResult: TestRunResult}) {
      const { testRunResult } = reportData;

      const specName = sanitizeFileNamePart(testRunResult.spec.name);
      const suiteTitle = sanitizeFileNamePart(testRunResult.test.suite?.title);
      const testTitle = sanitizeFileNamePart(testRunResult.test.title);
      const browserName = testRunResult.browser.name;

      const jsonFileNameRaw = `${suiteTitle ? suiteTitle + '-' : ''}${testTitle}.json`;
      const jsonFilePathRaw = path.join(pluginConfig.outputReportDir, specName, browserName, jsonFileNameRaw);
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
      fs.mkdirSync(path.dirname(jsonFilePathRaw), { recursive: true });
      // Compact JSON — see the Playwright plugin: pretty-printing doubles the
      // payload and can push large recordings past V8's 512 MB max string
      // length, where JSON.stringify throws `RangeError: Invalid string length`.
      fs.writeFileSync(jsonFilePathRaw, JSON.stringify(reportRaw), 'utf-8');
      console.log(`[ui-coverage] Saved report to ${jsonFilePathRaw}`);

      return null;
    }
  });

  // After the whole run, bundle every per-test JSON into a single ZIP that
  // the consumer's extractor.py natively supports (handles .zip with N
  // .json inside). Per-test files are kept on disk for inspection.
  on('after:run', () => {
    try {
      const files = collectJsonFiles(pluginConfig.outputReportDir);
      if (files.length === 0) {
        console.log('[ui-coverage] No per-test reports found, skipping ZIP.');
        return;
      }
      const entries = files.map(f => ({
        name: f.arcName,
        data: fs.readFileSync(f.absPath),
      }));
      const zipBuf = buildZip(entries);
      const zipPath = path.join(pluginConfig.outputReportDir, 'ui-coverage-reports.zip');
      fs.writeFileSync(zipPath, zipBuf);
      console.log(`[ui-coverage] Bundled ${entries.length} reports into ${zipPath}`);
    } catch (e) {
      console.warn('[ui-coverage] Failed to bundle reports into ZIP:', e);
    }
  });
}
