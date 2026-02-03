/// <reference types="vitest" />
import { defineProject, mergeConfig } from 'vitest/config';
import configShared from '../../vitest.config';
import pkg from './package.json';

export default mergeConfig(
  configShared,
  defineProject({
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    test: {
      globals: true,
      // Reduce concurrency to prevent race conditions and flaky tests
      maxConcurrency: 1,
      fileParallelism: false,
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true,
        },
      },
    },
  }),
);
