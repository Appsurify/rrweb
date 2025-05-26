import config from './vite.config.default';


export default config(
  {
    'rrweb-cypress-plugin': 'src/index.ts',
    'rrweb-cypress-plugin-reporter': 'src/reporter.ts',
  },
  'rrweb-cypress-plugin',
  { outputDir: 'dist' },
);
