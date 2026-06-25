import { defineConfig } from 'vitest/config';

// Unit tests never run the real rrweb UMD — they fake `executeScript`. The
// `*.umd.cjs.src` imports (resolved by an esbuild loader in tsup at build time)
// have no resolver under Vitest, so stub them to a non-empty placeholder here.
// (Non-empty matters: the recorder's injection skips falsy sources, and the fake
// driver simulates the bundle attaching to `window` only when injection runs.)
export default defineConfig({
  plugins: [
    {
      name: 'stub-umd-src',
      enforce: 'pre',
      resolveId(id: string) {
        if (id.endsWith('.umd.cjs.src')) return '\0umd-src:' + id;
        return null;
      },
      load(id: string) {
        if (id.startsWith('\0umd-src:')) return 'export default "/* fake-umd */";';
        return null;
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
