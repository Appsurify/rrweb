import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FsReporter,
  bundleReports,
  buildZip,
  prepareOutputDir,
  sanitizeFileNamePart,
  collectJsonFiles,
  DEFAULT_ZIP_FILE,
} from '../src/reporter';
import type { Report } from '../src/types';

function makeReport(over?: Partial<Report['metadata']>): Report {
  return {
    events: [{ type: 2, data: {}, timestamp: 1, id: 1 } as never],
    metadata: {
      runner: { source: 'selenium', type: 'mocha' },
      spec: { name: 'app.test.cjs' },
      suite: { title: 'Demo App', root: false },
      test: { title: 'increments the counter', state: 'passed' },
      browser: { name: 'chrome', family: 'chromium' },
      ...over,
    },
  };
}

describe('sanitizeFileNamePart', () => {
  it('collapses invalid chars to single dashes and trims', () => {
    expect(sanitizeFileNamePart('User: Auth/Flow')).toBe('User-Auth-Flow');
    expect(sanitizeFileNamePart('  logs in *fast*  ')).toBe('logs-in-fast');
    expect(sanitizeFileNamePart(undefined)).toBe('');
  });
});

describe('FsReporter', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sel-rep-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('computes <spec>/<browser>/<suite>-<test>.json', () => {
    const r = new FsReporter({ outputDir: dir });
    expect(r.reportPath(makeReport())).toBe(
      path.join(dir, 'app.test.cjs', 'chrome', 'Demo-App-increments-the-counter.json'),
    );
  });

  it('writes the appsurify report envelope', async () => {
    const r = new FsReporter({ outputDir: dir });
    await r.saveReport(makeReport());
    const file = path.join(
      dir,
      'app.test.cjs',
      'chrome',
      'Demo-App-increments-the-counter.json',
    );
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(Object.keys(parsed)).toEqual(['events', 'metadata']);
    expect(parsed.metadata.runner.source).toBe('selenium');
    expect(parsed.metadata).toHaveProperty('spec');
    expect(parsed.metadata).toHaveProperty('suite');
    expect(parsed.metadata).toHaveProperty('test');
    expect(parsed.metadata).toHaveProperty('browser');
    expect(parsed.events[0].id).toBe(1);
  });

  it('disambiguates colliding sanitized paths', async () => {
    const r = new FsReporter({ outputDir: dir });
    await r.saveReport(makeReport({ test: { title: 'a/b' } } as never));
    await r.saveReport(makeReport({ test: { title: 'a:b' } } as never));
    const browserDir = path.join(dir, 'app.test.cjs', 'chrome');
    const files = fs.readdirSync(browserDir).sort();
    expect(files).toEqual(['Demo-App-a-b-2.json', 'Demo-App-a-b.json']);
  });

  it('prepareOutputDir wipes stale reports and recreates the dir', () => {
    fs.mkdirSync(path.join(dir, 'old-spec', 'chrome'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'old-spec', 'chrome', 'orphan.json'), '{}');
    fs.writeFileSync(path.join(dir, DEFAULT_ZIP_FILE), 'stale-zip');

    prepareOutputDir(dir);

    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]); // overwritten, not appended
  });

  it('finalize() bundles per-test reports into a ZIP', async () => {
    const r = new FsReporter({ outputDir: dir });
    await r.saveReport(makeReport());
    await r.saveReport(makeReport({ test: { title: 'second test' } } as never));
    await r.finalize();
    const zipPath = path.join(dir, DEFAULT_ZIP_FILE);
    expect(fs.existsSync(zipPath)).toBe(true);
    const buf = fs.readFileSync(zipPath);
    // ZIP local-file-header magic "PK\x03\x04"
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // End-of-central-directory entry count == 2
    expect(buf.readUInt16LE(buf.length - 14)).toBe(2);
  });
});

describe('bundleReports / buildZip', () => {
  it('returns 0 when there is nothing to bundle', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sel-empty-'));
    try {
      expect(bundleReports(empty)).toBe(0);
      expect(fs.existsSync(path.join(empty, DEFAULT_ZIP_FILE))).toBe(false);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('preserves nested arc names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sel-arc-'));
    try {
      fs.mkdirSync(path.join(dir, 'spec', 'chrome'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec', 'chrome', 'a.json'), '{}');
      const files = collectJsonFiles(dir);
      expect(files.map((f) => f.arcName)).toEqual(['spec/chrome/a.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('buildZip produces a valid EOCD with the entry count', () => {
    const zip = buildZip([
      { name: 'a.json', data: Buffer.from('{"a":1}') },
      { name: 'b/c.json', data: Buffer.from('{"b":2}') },
    ]);
    expect(zip.readUInt16LE(zip.length - 14)).toBe(2);
  });
});
