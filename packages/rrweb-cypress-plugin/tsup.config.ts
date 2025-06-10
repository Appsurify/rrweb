import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';

const recordPath = path.resolve(__dirname, '../record/dist/rrweb-record.umd.cjs');
const recordSource = fs.readFileSync(recordPath, 'utf-8');

export default defineConfig({
  sourcemap: true,
  clean: true,
  bundle: true,
  minify: true,
  dts: true,
  noExternal: ['rrweb'],
  entry: ['src/index.ts', 'src/reporter.ts'],
  format: ['cjs', 'esm'], // 'iife'
  // loader: {
  //   '.src': 'text',
  // },
  esbuildPlugins: [
    {
      name: 'rrweb-record-loader',
      setup(build) {
        build.onResolve({ filter: /rrweb-record\.umd\.cjs\.src$/ }, args => ({
          path: args.path,
          namespace: 'rrweb-record',
        }));
        build.onLoad({ filter: /.*/, namespace: 'rrweb-record' }, () => ({
          contents: recordSource,
          loader: 'text',
        }));
      },
    },
  ],
});
