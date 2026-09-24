'use strict';

module.exports = {
  globalSetup: '<rootDir>/tests/global-setup.cjs',
  globalTeardown: '<rootDir>/tests/global-teardown.cjs',
  setupFiles: ['<rootDir>/tests/jest-setup.js'],
  modulePathIgnorePatterns: [
    '<rootDir>/.worktrees/',
    '<rootDir>/.agents/',
    '<rootDir>/.claude/',
    '<rootDir>/.codex/',
    '<rootDir>/.spec-first/',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.worktrees/',
    '<rootDir>/.agents/',
    '<rootDir>/.claude/',
    '<rootDir>/.codex/',
    '<rootDir>/.spec-first/',
    '<rootDir>/tests/fixtures/ai-dev-benchmarks/',
    '<rootDir>/skills/.*/evals/fixtures/repos/',
  ],
};
