import type { BrowserInfo } from '../types';
import type { SeleniumDriver } from './types';

function familyFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('firefox')) return 'gecko';
  if (n.includes('safari')) return 'webkit';
  return 'chromium';
}

/**
 * Reads browser metadata from a driver's capabilities (best-effort).
 * @public
 * @remarks
 * Supports both selenium-webdriver `Capabilities`
 * (`getBrowserName`/`getBrowserVersion`) and a plain map (`get("browserName")`).
 * Never throws.
 */
export async function readBrowserInfo(driver: SeleniumDriver): Promise<BrowserInfo> {
  let name = 'unknown';
  let version: string | undefined;
  let platformName: string | undefined;
  let capabilities: Record<string, unknown> | undefined;

  try {
    if (typeof driver.getCapabilities === 'function') {
      const caps = (await driver.getCapabilities()) as {
        getBrowserName?: () => string;
        getBrowserVersion?: () => string;
        getPlatform?: () => string;
        get?: (key: string) => unknown;
        toJSON?: () => Record<string, unknown>;
      };
      name = (caps.getBrowserName?.() ?? (caps.get?.('browserName') as string) ?? name) || name;
      version = caps.getBrowserVersion?.() ?? (caps.get?.('browserVersion') as string | undefined);
      platformName = caps.getPlatform?.() ?? (caps.get?.('platformName') as string | undefined);
      if (typeof caps.toJSON === 'function') {
        capabilities = caps.toJSON();
      }
    }
  } catch {
    // best-effort — leave defaults
  }

  return { name, version, family: familyFor(name), platformName, capabilities };
}
