'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const skillPath = path.join(repoRoot, 'skills/spec-diagnose/SKILL.md');
const governancePath = path.join(
  repoRoot,
  'src/cli/contracts/dual-host-governance/skills-governance.json',
);
const routeMapPath = path.join(
  repoRoot,
  'skills/using-spec-first/references/public-route-map.md',
);
const langPolicyPath = path.join(repoRoot, 'src/cli/lang-policy.js');
const catalogPath = path.join(repoRoot, 'docs/catalog/runtime-capabilities.md');
const { buildRuntimeCapabilityCatalog, readSkillDescription } = require('../../scripts/generate-runtime-capability-catalog.js');

describe('spec-diagnose contracts', () => {
  test('enforces read-only forensic citation and pre-context redaction boundaries', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toMatch(/^name:\s*spec-diagnose$/m);
    expect(skill).toContain('path:line');
    expect(skill).toContain('skill-timeline');
    expect(skill).toContain('plan-adherence');
    expect(skill).toContain('repeated-work');
    expect(skill).toContain('stumbles');
    expect(skill).toContain('quality-evidence');
    expect(skill).toContain('request-conflicts');
    expect(skill).toContain('cost-and-time');
    expect(skill).toContain('Never modify, move, or delete session transcripts');
    expect(skill).toContain('before any transcript excerpt enters model context or the forensic report');
    expect(skill).toContain('redact secrets/tokens/PII first');
  });

  test('is registered in skills-governance.json, public-route-map.md, and lang-policy.js routing precedence', () => {
    const governance = JSON.parse(fs.readFileSync(governancePath, 'utf8'));
    const records = Array.isArray(governance) ? governance : governance.skills;
    const entry = records.find((item) => item.skill_name === 'spec-diagnose');
    const routeMap = fs.readFileSync(routeMapPath, 'utf8');
    const langPolicy = fs.readFileSync(langPolicyPath, 'utf8');

    expect(entry).toBeDefined();
    expect(entry.entry_surface).toBe('standalone_skill');
    expect(routeMap).toContain('`spec-diagnose`');
    expect(routeMap).toContain('active defect diagnosis or fix intent still goes to `spec-debug`');
    expect(langPolicy).toContain('spec-diagnose');

    const { LANG_START, LANG_END, buildManagedBlock } = require('../../src/cli/lang-policy.js');
    const expectedBlock = buildManagedBlock('zh');
    for (const hostDoc of ['AGENTS.md', 'CLAUDE.md']) {
      const content = fs.readFileSync(path.join(repoRoot, hostDoc), 'utf8').replace(/\r\n/g, '\n');
      const actualBlock = content.slice(content.indexOf(LANG_START), content.indexOf(LANG_END) + LANG_END.length);
      expect(actualBlock).toBe(expectedBlock);
      expect(actualBlock).toContain('spec-diagnose');
      expect(actualBlock).toContain('spec-debug');
    }
  });

  test('catalog generator normalizes frontmatter newlines and POSIX paths', () => {
    const desc = readSkillDescription('spec-diagnose');
    const catalog = fs.readFileSync(catalogPath, 'utf8');

    expect(desc).toContain('Read-only, evidence-grounded session and workflow diagnostics');
    expect(catalog).toContain('| spec-diagnose |');
    expect(catalog).toContain(desc);
    expect(buildRuntimeCapabilityCatalog()).toBe(catalog);
    expect(catalog).not.toContain('docs\\contracts\\workflows\\');
  });
});
