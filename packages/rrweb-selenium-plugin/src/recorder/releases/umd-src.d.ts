// The `*.umd.cjs.src` imports are virtual modules resolved at build time by the
// esbuild text loader in tsup.config.ts (and stubbed in vitest.config.ts). They
// evaluate to the UMD bundle source as a string.
declare module '*.umd.cjs.src' {
  const source: string;
  export default source;
}
