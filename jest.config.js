module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  globalSetup: './tests/globalSetup.js',
  globalTeardown: './tests/globalTeardown.js',
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 30000,
  collectCoverage: true,
  coverageDirectory: 'coverage/backend',
  coverageReporters: ['text', 'lcov', 'html'],
};
