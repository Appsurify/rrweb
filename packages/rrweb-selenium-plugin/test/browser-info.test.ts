/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { readBrowserInfo } from '../src/engine/browserInfo';

describe('readBrowserInfo', () => {
  it('reads from selenium Capabilities getters', async () => {
    const driver: any = {
      getCapabilities: async () => ({
        getBrowserName: () => 'firefox',
        getBrowserVersion: () => '128.0',
        getPlatform: () => 'linux',
        toJSON: () => ({ browserName: 'firefox' }),
      }),
    };
    const info = await readBrowserInfo(driver);
    expect(info.name).toBe('firefox');
    expect(info.version).toBe('128.0');
    expect(info.family).toBe('gecko');
    expect(info.platformName).toBe('linux');
    expect(info.capabilities).toEqual({ browserName: 'firefox' });
  });

  it('falls back to a plain capability map', async () => {
    const driver: any = {
      getCapabilities: async () => ({
        get: (k: string) =>
          ({ browserName: 'chrome', browserVersion: '125' } as Record<string, string>)[k],
      }),
    };
    const info = await readBrowserInfo(driver);
    expect(info.name).toBe('chrome');
    expect(info.version).toBe('125');
    expect(info.family).toBe('chromium');
  });

  it('maps safari to webkit family', async () => {
    const driver: any = {
      getCapabilities: async () => ({ getBrowserName: () => 'Safari' }),
    };
    expect((await readBrowserInfo(driver)).family).toBe('webkit');
  });

  it('never throws and defaults to unknown', async () => {
    const driver: any = {
      getCapabilities: async () => {
        throw new Error('no caps');
      },
    };
    const info = await readBrowserInfo(driver);
    expect(info.name).toBe('unknown');
  });
});
