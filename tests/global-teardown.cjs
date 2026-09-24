'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = function teardown() {
  const state = global.__specFirstTestHome;
  if (!state) return;
  for (const [key, value] of Object.entries(state.env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const root = path.resolve(state.root);
  if (!path.basename(root).startsWith('spec-first-jest-home-')) throw new Error('unexpected_test_home');
  fs.rmSync(root, { recursive: true, force: true });
};
