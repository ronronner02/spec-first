'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { bootstrapChangelog, buildInitialChangelog } = require('../../src/cli/changelog');

const repoRoot = path.resolve(__dirname, '../..');
const entryPattern = /^- v(?:\d+\.\d+\.\d+|X\.Y\.Z) \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [^:]+: .+$/;
const legacyEntryPattern = /^- v\d+\.\d+\.\d+ \d{4}-\d{2}-\d{2} [^:]+: .+$/;

function changelogEntries(content) {
  return content.split('\n').filter((line) => /^- v(?:\d|X)/.test(line));
}

describe('CHANGELOG format', () => {
  test('repository changelog keeps the documented entry shape', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    expect(content).toContain('- 记录格式：`- v版本号 YYYY-MM-DD HH:MM:SS 作者: 变更摘要 [(user-visible)]`');
    const entries = changelogEntries(content);
    expect(entries.length).toBeGreaterThan(0);
    expect(entryPattern.test(entries[0])).toBe(true);
    expect(entries.filter((line) => !entryPattern.test(line) && !legacyEntryPattern.test(line))).toEqual([]);
  });

  test('初始化模板不写入工具署名、工具版本或虚构的项目变更', () => {
    const content = buildInitialChangelog('2026-07-10 21:00:00', 'maintainer', '1.2.3');
    expect(content).toContain('# Changelog');
    expect(content).toContain('- 记录格式：');
    expect(changelogEntries(content)).toEqual([]);
    expect(content).not.toMatch(/spec-first|maintainer|1\.2\.3|2026-07-10/i);
  });

  test('初始化只创建中性模板，不改写已有用户日志', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-changelog-'));
    const file = path.join(root, 'CHANGELOG.md');
    try {
      expect(bootstrapChangelog(root, { name: 'maintainer', version: '1.2.3' })).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toBe(buildInitialChangelog());
      const existing = '# 我的项目\n\n- 手工保留的 spec-first 集成说明\n';
      fs.writeFileSync(file, existing);
      expect(bootstrapChangelog(root, { name: 'other', version: '9.9.9' })).toBe(false);
      expect(fs.readFileSync(file, 'utf8')).toBe(existing);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      fs.rmdirSync(root);
    }
  });
});
