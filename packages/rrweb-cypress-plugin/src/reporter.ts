import * as path from 'path';
import * as fs from 'fs';
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

export default function registerRRWebReportTasks(on: Cypress.PluginEvents, config?: Partial<typeof pluginConfig>) {
  pluginConfig = { ...pluginConfig, ...config };

  on('task', {
    saveRRWebReport(reportData: {testRunResult: TestRunResult}) {
      const { testRunResult } = reportData;

      const specName = sanitizeFileNamePart(testRunResult.spec.name);
      const suiteTitle = sanitizeFileNamePart(testRunResult.test.suite?.title);
      const testTitle = sanitizeFileNamePart(testRunResult.test.title);

      const jsonFileNameRaw = `${suiteTitle ? suiteTitle + '-' : ''}${testTitle}.json`;
      const jsonFilePathRaw = path.join(pluginConfig.outputReportDir, specName, jsonFileNameRaw);
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
      fs.mkdirSync(pluginConfig.outputReportDir, { recursive: true });
      fs.mkdirSync(path.dirname(jsonFilePathRaw), { recursive: true });
      fs.writeFileSync(jsonFilePathRaw, JSON.stringify(reportRaw, null, 2), 'utf-8');
      console.log(`[ui-coverage] Saved report to ${jsonFilePathRaw}`);

      return null;
    }
  });
}
