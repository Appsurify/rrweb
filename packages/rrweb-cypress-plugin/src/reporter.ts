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


function writeFileAtomic(filePath: string, data: string) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readJsonArraySafe(filePath: string): unknown[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf-8').trim();
    if (!text) return [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function registerRRWebReportTasks(on: Cypress.PluginEvents, config?: Partial<typeof pluginConfig>) {
  pluginConfig = { ...pluginConfig, ...config };

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
      fs.mkdirSync(pluginConfig.outputReportDir, { recursive: true });
      fs.mkdirSync(path.dirname(jsonFilePathRaw), { recursive: true });
      fs.writeFileSync(jsonFilePathRaw, JSON.stringify(reportRaw, null, 2), 'utf-8');
      console.log(`[ui-coverage] Saved report to ${jsonFilePathRaw}`);

      // Агрегация: дописываем в один общий файл массивом
      try {
        const aggregatePath = path.join(pluginConfig.outputReportDir, "ui-coverage-aggregated.json");
        const current = readJsonArraySafe(aggregatePath);
        current.push(reportRaw);
        writeFileAtomic(aggregatePath, JSON.stringify(current, null, 2));
        console.log(`[ui-coverage] Updated aggregate: ${aggregatePath}`);
      } catch (e) {
        console.warn('[ui-coverage] Failed to update aggregate report:', e);
      }

      return null;
    }
  });
}
