'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  writeFileAtomic,
  writeFileAtomicIfAbsent,
} = require('../../src/cli/atomic-write');

const tempRoots = [];

afterEach(() => {
  jest.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('atomic write failure evidence', () => {
  test('替换配置文件前保留原有访问权限', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-first-atomic-mode-'));
    tempRoots.push(root);
    const targetPath = path.join(root, 'settings.json');
    fs.writeFileSync(targetPath, '{}');
    const originalStat = fs.statSync(targetPath);
    jest.spyOn(fs, 'statSync').mockImplementation((filePath) => {
      if (filePath === targetPath) return { ...originalStat, mode: 0o100600 };
      return originalStat;
    });
    const chmod = jest.spyOn(fs, 'chmodSync');
    writeFileAtomic(targetPath, '{"changed":true}');
    expect(chmod).toHaveBeenCalledWith(expect.stringContaining('.settings.json.'), 0o600);
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('{"changed":true}');
  });

  test.each([
    ['writeFileAtomic', writeFileAtomic],
    ['writeFileAtomicIfAbsent', writeFileAtomicIfAbsent],
  ])('%s preserves the primary error when temp cleanup also fails', (_name, writer) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-first-atomic-failure-'));
    tempRoots.push(root);
    const targetPath = path.join(root, 'target.txt');
    const primaryError = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    const cleanupError = Object.assign(new Error('cleanup denied'), { code: 'EACCES' });
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw primaryError;
    });
    const cleanupSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw cleanupError;
    });

    let thrown;
    try {
      writer(targetPath, 'contents\n', 'utf8');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(primaryError);
    expect(thrown).toMatchObject({
      code: 'ENOSPC',
      message: 'disk full',
      atomicTempCleanupError: cleanupError,
    });
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(cleanupSpy).toHaveBeenCalledWith(expect.stringContaining('.target.txt.'), {
      force: true,
    });
  });
});
