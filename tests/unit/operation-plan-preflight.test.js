'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyOperationPlan } = require('../../src/cli/state');

test.each(['traversal', 'junction'])('%s 越界操作应在计划中任何删除发生前被发现', (kind) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-first-preflight-'));
  const root = path.join(fixture, 'project');
  const outside = path.join(fixture, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'keep.txt'), '保持原样');
  fs.writeFileSync(path.join(outside, 'keep.txt'), '外部内容');
  try {
    if (kind === 'junction') fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
    expect(() => applyOperationPlan(root, { operations: [
      { kind: 'remove_file', path: 'keep.txt' },
      { kind: 'remove_file', path: kind === 'junction' ? 'linked/keep.txt' : '../outside/keep.txt' },
    ] })).toThrow(/Unsafe operation path/);
    expect(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8')).toBe('保持原样');
    expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('外部内容');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
