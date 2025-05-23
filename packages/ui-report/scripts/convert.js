#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';


import UICoverageReport from '../dist/rrweb-ui-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libPath = pathToFileURL(path.resolve(__dirname, '../dist/rrweb-ui-report.js')).href;

// CLI args
const [inputPath, outputPath = 'coverage-report.json'] = process.argv.slice(2);

if (!inputPath) {
  console.error('Usage: ui-report <input.json> [output.json]');
  process.exit(1);
}

// Read, parse, process
const jsonFile = fs.readFileSync(inputPath, 'utf-8');
const json = JSON.parse(jsonFile);
const uiReport = new UICoverageReport(json.events);
const report = uiReport.report;

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`✔ Coverage report written to ${outputPath}`);
