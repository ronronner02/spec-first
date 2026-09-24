'use strict';

const os = require('node:os');
const path = require('node:path');

test('测试及其子进程使用独立的用户配置目录', () => {
  expect(path.basename(os.homedir())).toMatch(/^spec-first-jest-home-/);
  expect(process.env.HOME).toBe(process.env.USERPROFILE);
  expect(process.env.CODEX_HOME).toBe(path.join(os.homedir(), '.codex'));
  expect(process.env.CLAUDE_CONFIG_DIR).toBe(path.join(os.homedir(), '.claude'));
});
