import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';

const recordPath = path.resolve(__dirname, '../record/dist/rrweb-record.umd.cjs');
const recordSource = fs.readFileSync(recordPath, 'utf-8');
const pluginPath = path.resolve(__dirname, '../plugins/rrweb-plugin-sequential-id-record/dist/rrweb-plugin-sequential-id-record.umd.cjs');
const pluginSource = fs.readFileSync(pluginPath, 'utf-8');

export default defineConfig({
  sourcemap: true,
  clean: true,
  bundle: true,
  minify: true,
  dts: true,
  noExternal: ['rrweb'],
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  esbuildPlugins: [
    {
      name: 'rrweb-record-loader',
      setup(build) {
        build.onResolve({ filter: /rrweb-record\.umd\.cjs\.src$/ }, (args) => ({
          path: args.path,
          namespace: 'rrweb-record',
        }));
        build.onLoad({ filter: /.*/, namespace: 'rrweb-record' }, () => ({
          contents: recordSource,
          loader: 'text',
        }));
        build.onResolve({ filter: /rrweb-plugin-sequential-id-record\.umd\.cjs\.src$/ }, (args) => ({
          path: args.path,
          namespace: 'rrweb-plugin-seq',
        }));
        build.onLoad({ filter: /.*/, namespace: 'rrweb-plugin-seq' }, () => ({
          contents: pluginSource,
          loader: 'text',
        }));
      },
    },
  ],
  external: [
    '@playwright/test',
    'playwright-core',
    'chromium-bidi',
  ],
});
