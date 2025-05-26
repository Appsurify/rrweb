/// <reference types="cypress" />
import * as path from 'path';
import * as fs from 'fs';
import type { TestRunResult } from "./types";
import generateReport from '@appsurify-testmap/rrweb-ui-report';


let pluginConfig: {
  outputUIReportDir: string;
  includeHtml: boolean;
  compress: boolean;
  upload: boolean;
  uploadUrl: string;
  projectId: string;
  apiKey: string;
} = {
  outputUIReportDir: 'results/ui',
  includeHtml: false,
  compress: false,
  upload: false,
  uploadUrl: '',
  projectId: '',
  apiKey: ''
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
    saveRRWebReport(testRunResult: TestRunResult) {
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
      return null;
    }
  });
}
