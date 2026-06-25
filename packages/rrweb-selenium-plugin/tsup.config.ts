import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';

// Inline the rrweb-record UMD bundle and the sequential-id record plugin UMD at
// build time. They are injected verbatim into the page via `executeScript`, so
// the plugin has zero runtime/CDN dependency on rrweb being reachable from the
// browser under test. These UMDs must already be built (see the `prebuild`
// script); `devBuild` skips that step for fast iteration.
const recordPath = path.resolve(__dirname, '../record/dist/rrweb-record.umd.cjs');
const recordSource = fs.readFileSync(recordPath, 'utf-8');
const seqPluginPath = path.resolve(
  __dirname,
  '../plugins/rrweb-plugin-sequential-id-record/dist/rrweb-plugin-sequential-id-record.umd.cjs',
);
const seqPluginSource = fs.readFileSync(seqPluginPath, 'utf-8');

// The plugin version doubles as the baked-in rrweb lib version (lockstep monorepo).
// Injected so the Node-side recorder never imports the DOM-coupled rrweb package.
const pkgVersion = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
).version as string;

export default defineConfig({
  sourcemap: true,
  clean: true,
  bundle: true,
  minify: true,
  dts: true,
  noExternal: ['rrweb'],
  entry: [
    'src/index.ts',
    'src/reporter.ts',
    'src/mocha.ts',
    'src/jest.ts',
    'src/jest-setup.ts',
    'src/jest-teardown.ts',
    'src/vitest.ts',
    'src/vitest-teardown.ts',
    'src/node-test.ts',
  ],
  format: ['cjs', 'esm'],
  define: {
    'process.env.RRWEB_SELENIUM_LIB_VERSION': JSON.stringify(pkgVersion),
  },
  esbuildPlugins: [
    {
      name: 'rrweb-umd-loader',
      setup(build) {
        // `import rrSrc from './releases/rrweb-record.umd.cjs.src'` resolves to a
        // virtual module whose contents are the UMD source as a text string.
        build.onResolve({ filter: /rrweb-record\.umd\.cjs\.src$/ }, (args) => ({
          path: args.path,
          namespace: 'rrweb-record',
        }));
        build.onLoad({ filter: /.*/, namespace: 'rrweb-record' }, () => ({
          contents: recordSource,
          loader: 'text',
        }));
        build.onResolve(
          { filter: /rrweb-plugin-sequential-id-record\.umd\.cjs\.src$/ },
          (args) => ({
            path: args.path,
            namespace: 'rrweb-plugin-seq',
          }),
        );
        build.onLoad({ filter: /.*/, namespace: 'rrweb-plugin-seq' }, () => ({
          contents: seqPluginSource,
          loader: 'text',
        }));
      },
    },
  ],
  // node:test is a Node built-in only available at runtime — never bundle it.
  external: ['node:test'],
});
