import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig, buildRunnerInfo } from '../src/config';
import { DEFAULT_OUTPUT_DIR } from '../src/reporter';

describe('resolveConfig', () => {
  const prev = process.env.TESTMAP_OUTPUT_DIR;
  beforeEach(() => {
    delete process.env.TESTMAP_OUTPUT_DIR;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.TESTMAP_OUTPUT_DIR;
    else process.env.TESTMAP_OUTPUT_DIR = prev;
  });

  it('falls back to the default output dir', () => {
    expect(resolveConfig().outputDir).toBe(DEFAULT_OUTPUT_DIR);
    expect(DEFAULT_OUTPUT_DIR).toBe('test-results/selenium/ui');
  });

  it('honors TESTMAP_OUTPUT_DIR over the default', () => {
    process.env.TESTMAP_OUTPUT_DIR = 'custom/dir';
    expect(resolveConfig().outputDir).toBe('custom/dir');
  });

  it('honors an explicit outputDir over the env var', () => {
    process.env.TESTMAP_OUTPUT_DIR = 'env/dir';
    expect(resolveConfig({ outputDir: 'explicit/dir' }).outputDir).toBe('explicit/dir');
  });

  it('preserves recordOptions passthrough', () => {
    const cfg = resolveConfig({ recordOptions: { maskAllInputs: true } });
    expect(cfg.recordOptions).toEqual({ maskAllInputs: true });
  });
});

describe('buildRunnerInfo', () => {
  it('stamps source=selenium and runtime metadata', () => {
    const info = buildRunnerInfo('mocha');
    expect(info.source).toBe('selenium');
    expect(info.type).toBe('mocha');
    expect(info.platform).toBe(process.platform);
    expect(info.arch).toBe(process.arch);
    expect(info.nodeVersion).toBe(process.version);
    expect(typeof info.timestamp).toBe('string');
  });
});
