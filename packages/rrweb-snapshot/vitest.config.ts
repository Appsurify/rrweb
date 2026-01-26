/// <reference types="vitest" />
import { defineProject, mergeConfig } from 'vitest/config';
import configShared from '../../vitest.config.ts';

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      globals: true,
      setupFiles: ['./test/setup.ts'],
      environment: 'jsdom',
    },
  }),
);
