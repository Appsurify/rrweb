// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

// The rrweb reporter reads `project.use.testmap.outputReportDir` to decide where
// per-test JSON recordings land. The plugin ships no type augmentation, so we
// extend PlaywrightTestOptions ourselves rather than scattering `as any` casts.
declare module '@playwright/test' {
  interface PlaywrightTestOptions {
    testmap?: {
      outputReportDir?: string;
    };
  }
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.{spec,cy}.{js,ts}',

  // No globalSetup needed for rrweb cleanup: the plugin's reporter wipes each
  // output directory once in onBegin (main process, before any worker), so each
  // run's ZIP bundle contains only that run's recordings.

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker per spec file is required by the current plugin version: within a
  // single worker only the first spec's tests get an rrweb afterEach callback,
  // so subsequent specs silently skip the JSON write. With one worker per spec
  // each gets fresh plugin state. Bump this if more spec files are added.
  workers: 4,

  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/playwright/junit/test-output.xml' }],
    ['@appsurify-testmap/rrweb-playwright-plugin/reporter'],
  ],

  outputDir: 'test-results/playwright/artifacts',

  use: {
    viewport: { width: 1266, height: 768 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'off',
    video: 'off',
    trace: 'off',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // testmap: {
        //   outputReportDir: 'test-results/playwright/ui',
        // },
      },
    },
  ],
});
