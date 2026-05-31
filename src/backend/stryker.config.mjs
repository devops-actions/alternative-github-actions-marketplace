/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'jest',
  coverageAnalysis: 'all',
  mutate: [
    'lib/**/*.js',
    'client/**/*.js',
    'ActionsGet/**/*.js',
    'ActionsList/**/*.js',
    'ActionsReadme/**/*.js',
    'ActionsStats/**/*.js',
    'ActionsUpsert/**/*.js',
  ],
  reporters: ['json', 'progress'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 80, low: 70, break: null },
};
