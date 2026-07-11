// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';


export default defineConfig({
  // globalSetup: 'playwright-rrweb/globalSetup',
  testDir: './tests/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 3 : undefined,
  outputDir: 'test-results/playwright',

  reporter: [
    ['junit', { outputFile: 'test-results/playwright/junit/results.xml' }],
    ['@appsurify-testmap/rrweb-playwright-plugin/reporter'],
  ],

  use: {
    // baseURL: 'http://localhost:5180',
    // trace: 'on-first-retry',
    trace: "off",
    screenshot: "off",
    headless: true,
    testmap: {
      recordingOpts: {
        maskInputOptions: { password: true },
        sampling: {
          mousemove: false,
          mouseInteraction: {
            MouseUp: false,
            MouseDown: false,
            Click: true,
            ContextMenu: true,
            DblClick: true,
            Focus: true,
            Blur: true,
            TouchStart: false,
            TouchEnd: false,
          },
          scroll: 100,
          media: 100,
          input: 'last',
          canvas: 'all',
          visibility: {
            mode: 'none',
            debounce: 0,
            threshold: 0.5,
            sensitivity: 0.05,
            rafThrottle: 10
          }
        },
        flushCustomEvent: 'after',
        recordAfter: 'DOMContentLoaded',
        userTriggeredOnInput: true,
      },
      outputReportDir: 'test-results/playwright/ui'
    }
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],

  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5180',
  //   reuseExistingServer: !process.env.CI,
  // },
});
