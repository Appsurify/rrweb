import * as path from 'path';
import config from '../../vite.config.default';
// @ts-ignore
import pkg from './package.json';

export default config(path.resolve(__dirname, 'src/index.ts'), 'rrweb', {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
