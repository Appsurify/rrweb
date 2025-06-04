import config from '../../vite.config.default';
import pkg from './package.json';

// export default config('src/index.ts', 'rrweb', { outputDir: 'dist/main' });
export default config('src/index.ts', 'rrweb', {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
