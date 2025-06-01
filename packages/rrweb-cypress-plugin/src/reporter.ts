import * as path from 'path';
import * as fs from 'fs';
import type { TestRunResult } from './types';
import generateReport from '@appsurify-testmap/rrweb-ui-report';
import type { TestmapConfigSchema } from './testmap-config';

let pluginConfig: {
  outputUIReportDir: string;
  includeRawReport: boolean;
} = {
  outputUIReportDir: 'test-results/cypress/ui',
  includeRawReport: false,
};

function sanitizeFileNamePart(name: string | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/[\s:/\\<>|"'?*]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function registerRRWebReportTasks(on: Cypress.PluginEvents, config?: Partial<typeof pluginConfig>) {
  pluginConfig = { ...pluginConfig, ...config };

  on('task', {
    saveRRWebReport(reportData: {testRunResult: TestRunResult, config?: TestmapConfigSchema}) {
      const { testRunResult, config } = reportData;
      if (config) {
        pluginConfig.outputUIReportDir = config.outputReportDirectory !== undefined
          ? config.outputReportDirectory : pluginConfig.outputUIReportDir;
        pluginConfig.includeRawReport = config.includeRawReport !== undefined
        ? config.includeRawReport : pluginConfig.includeRawReport;
      }
      console.log('REPORTER', pluginConfig);
      console.log('REPORTER', config);
      const specName = sanitizeFileNamePart(testRunResult.spec.name);
      const suiteTitle = sanitizeFileNamePart(testRunResult.test.suite?.title);
      const testTitle = sanitizeFileNamePart(testRunResult.test.title);
      const jsonFileName = `${suiteTitle ? suiteTitle + '-' : ''}${testTitle}.json`;
      const jsonFilePath = path.join(pluginConfig.outputUIReportDir, specName, jsonFileName);
      const report = generateReport({ events: testRunResult.recorderEvents });
      fs.mkdirSync(pluginConfig.outputUIReportDir, { recursive: true });
      fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
      fs.writeFileSync(jsonFilePath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`[ui-coverage] Saved report to ${jsonFilePath}`);

      if (pluginConfig.includeRawReport) {
        const jsonFileNameRaw = `${suiteTitle ? suiteTitle + '-' : ''}${testTitle}.raw.json`;
        const jsonFilePathRaw = path.join(pluginConfig.outputUIReportDir, specName, jsonFileNameRaw);
        const reportRaw = {
          events: testRunResult.recorderEvents,
          metadata: {
            spec: testRunResult.spec,
            test: testRunResult.test,
            browser: testRunResult.browser,
          }
        };
        fs.mkdirSync(pluginConfig.outputUIReportDir, { recursive: true });
        fs.mkdirSync(path.dirname(jsonFilePathRaw), { recursive: true });
        fs.writeFileSync(jsonFilePathRaw, JSON.stringify(reportRaw, null, 2), 'utf-8');
        console.log(`[ui-coverage] Saved raw report to ${jsonFilePathRaw}`);
      }

      return null;
    }
  });
}
