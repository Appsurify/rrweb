export default {
  test: {
    /**
     * Keeps old (pre-jest 29) snapshot format
     * its a bit ugly and harder to read than the new format,
     * so we might want to remove this in its own PR
     */
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    // Reduce concurrency to prevent race conditions and flaky tests
    maxConcurrency: 1,
    fileParallelism: false,
    pool: 'forks',
  },
};
