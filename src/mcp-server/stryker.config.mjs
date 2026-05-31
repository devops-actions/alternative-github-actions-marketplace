/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'jest',
  coverageAnalysis: 'all',
  mutate: [
    'lib/**/*.js',
    'index.js',
  ],
  jest: {
    config: {
      forceExit: true,
    },
  },
  reporters: ['json', 'progress'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 80, low: 70, break: null },
};
