'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

module.exports = function setup() {
  const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-first-jest-home-'));
  // 在 Jest 创建 VM 之前改真实进程环境；VM 内的 process.env 副本不会影响原生 os.homedir()。
  const env = {
    HOME: testHome,
    USERPROFILE: testHome,
    CODEX_HOME: path.join(testHome, '.codex'),
    CLAUDE_CONFIG_DIR: path.join(testHome, '.claude'),
    XDG_CONFIG_HOME: path.join(testHome, '.config'),
    APPDATA: path.join(testHome, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(testHome, 'AppData', 'Local'),
  };
  global.__specFirstTestHome = { root: testHome, env: {} };
  for (const [key, value] of Object.entries(env)) {
    global.__specFirstTestHome.env[key] = process.env[key];
    process.env[key] = value;
  }
};
