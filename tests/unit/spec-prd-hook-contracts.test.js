'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HOSTS = {
  claude: {
    prewrite: path.join(REPO_ROOT, 'templates/claude/hooks/prd-prewrite-guard'),
    readiness: path.join(REPO_ROOT, 'templates/claude/hooks/prd-readiness-guard'),
    envKey: 'CLAUDE_PROJECT_DIR',
    finalizeRelative: '.claude/spec-first/workflows/spec-prd/scripts/finalize-prd-artifact.js',
  },
  qoder: {
    prewrite: path.join(REPO_ROOT, 'templates/qoder/hooks/prd-prewrite-guard'),
    readiness: path.join(REPO_ROOT, 'templates/qoder/hooks/prd-readiness-guard'),
    envKey: 'QODER_PROJECT_DIR',
    finalizeRelative: '.qoder/skills/spec-prd/scripts/finalize-prd-artifact.js',
  },
};

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function checkpointPrd() {
  return [
    '---',
    'artifact_kind: prd-requirements',
    'status: draft',
    'write_mode: checkpoint-prd',
    'can_enter_spec_plan: no',
    '---',
    '# Hook Fixture',
    '',
  ].join('\n');
}

function readyPrd() {
  return [
    '---',
    'artifact_kind: prd-requirements',
    'status: ready-for-planning',
    'write_mode: final-prd',
    'can_enter_spec_plan: yes',
    'readiness_verified_by: check-prd-artifact.js',
    'readiness_verified_at: 2026-07-11T00:00:00.000Z',
    'readiness_checker_schema: spec-prd-artifact-report.v1',
    'readiness_finding_count: 0',
    'readiness_blocking_count: 0',
    'readiness_prd_hash: sha256:prd',
    'readiness_inputs_hash: sha256:inputs',
    '---',
    '# Hook Fixture',
    '',
    'Body v1',
    '',
  ].join('\n');
}

function withoutReadyReceipt(text) {
  return text
    .replace('status: ready-for-planning', 'status: draft')
    .replace(/^readiness_.*\n/gm, '');
}

function mutationPayload(toolName, target, currentText, nextText) {
  if (toolName === 'Write') {
    return { file_path: target, content: nextText };
  }
  if (toolName === 'Edit') {
    return { file_path: target, old_string: currentText, new_string: nextText };
  }
  return {
    file_path: target,
    edits: [{ old_string: currentText, new_string: nextText }],
  };
}

function runGit(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: path.join(projectRoot, 'home') },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
}

function initGit(projectRoot) {
  runGit(projectRoot, ['init', '-q']);
  runGit(projectRoot, ['config', 'user.name', 'Spec First Test']);
  runGit(projectRoot, ['config', 'user.email', 'spec-first@example.test']);
}

function runPrewrite(host, projectRoot, payload) {
  const config = HOSTS[host];
  return spawnSync(process.execPath, [config.prewrite], {
    cwd: projectRoot,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, [config.envKey]: projectRoot },
  });
}

function runReadiness(host, projectRoot, payload = {}) {
  const config = HOSTS[host];
  const scopeSource = path.join(REPO_ROOT, 'skills/spec-prd/scripts/lib/hook-session-scope.cjs');
  if (fs.existsSync(scopeSource)) {
    write(path.join(path.dirname(path.join(projectRoot, config.finalizeRelative)), 'lib/hook-session-scope.cjs'),
      fs.readFileSync(scopeSource, 'utf8'));
  }
  return spawnSync(process.execPath, [config.readiness], {
    cwd: projectRoot,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, [config.envKey]: projectRoot },
  });
}

function transcriptPayload(projectRoot, turns, overrides = {}) {
  const sessionId = 'session-a';
  const records = [];
  let parentUuid = null;
  const add = (record) => {
    const uuid = `event-${records.length}`;
    records.push({ sessionId, cwd: projectRoot, uuid, parentUuid, ...record });
    parentUuid = uuid;
  };
  for (const turn of turns) {
    add({ type: 'user', message: { role: 'user', content: turn.prompt || '审阅项目，仅提供建议。' } });
    for (const mutation of turn.writes || []) {
      const toolId = `tool-${records.length}`;
      add({ type: 'assistant', message: { role: 'assistant', content: [{
        type: 'tool_use', id: toolId, name: mutation.tool || 'Write',
        input: mutation.input || { file_path: mutation.path, content: mutation.content },
      }] } });
      add({ type: 'user', toolUseResult: mutation.result || {}, message: { role: 'user', content: [{
        type: 'tool_result', tool_use_id: toolId, is_error: mutation.failed === true, content: '完成',
      }] } });
    }
    if (turn.meta) add({ type: 'user', isMeta: true, message: { role: 'user', content: turn.meta } });
    add({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '审阅完成，等待你的选择。' }] } });
  }
  const transcriptPath = path.join(projectRoot, 'session.jsonl');
  write(transcriptPath, records.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return { session_id: sessionId, transcript_path: transcriptPath, ...overrides };
}

function failingFinalize(host, projectRoot) {
  write(path.join(projectRoot, HOSTS[host].finalizeRelative), [
    "process.stdout.write(JSON.stringify({ blocking_reason_codes: ['ready_receipt_stale'] }));",
    'process.exit(1);',
    '',
  ].join('\n'));
}

function readinessDecision(host, result) {
  if (host === 'claude') {
    const payload = result.stdout ? JSON.parse(result.stdout) : {};
    return {
      blocked: payload.decision === 'block',
      message: payload.reason || '',
    };
  }
  return {
    blocked: result.status === 2,
    message: result.stderr || '',
  };
}

describe('spec-prd Claude and Qoder hook parity', () => {
  test.each(Object.keys(HOSTS))('%s allows LLM-owned final intent while keeping receipt fields machine-owned', (host) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-final-intent-`));
    const target = path.join(projectRoot, 'docs', 'brainstorms', 'sample-requirements.md');
    try {
      write(target, checkpointPrd());
      const result = runPrewrite(host, projectRoot, {
        tool_name: 'Edit',
        cwd: projectRoot,
        tool_input: {
          file_path: target,
          old_string: 'write_mode: checkpoint-prd\ncan_enter_spec_plan: no',
          new_string: 'write_mode: final-prd\ncan_enter_spec_plan: yes',
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS))('%s blocks degraded Edit reconstruction that touches a receipt field', (host) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-edit-receipt-`));
    const target = path.join(projectRoot, 'docs', 'brainstorms', 'sample-requirements.md');
    try {
      write(target, checkpointPrd());
      const result = runPrewrite(host, projectRoot, {
        tool_name: 'Edit',
        cwd: projectRoot,
        tool_input: {
          file_path: target,
          old_string: 'not present',
          new_string: 'readiness_prd_hash: forged',
        },
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('readiness_');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS))('%s blocks degraded MultiEdit reconstruction that touches ready status', (host) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-multi-receipt-`));
    const target = path.join(projectRoot, 'docs', 'brainstorms', 'sample-requirements.md');
    try {
      write(target, checkpointPrd());
      const result = runPrewrite(host, projectRoot, {
        tool_name: 'MultiEdit',
        cwd: projectRoot,
        tool_input: {
          file_path: target,
          edits: [{ old_string: 'not present', new_string: 'status: ready-for-planning' }],
        },
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('ready');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS).flatMap((host) => (
    ['Write', 'Edit', 'MultiEdit'].map((toolName) => [host, toolName])
  )))('%s %s blocks machine ready/receipt field addition', (host, toolName) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-${toolName}-add-receipt-`));
    const target = path.join(projectRoot, 'docs', 'brainstorms', 'sample-requirements.md');
    const currentText = checkpointPrd();
    const nextText = currentText
      .replace('status: draft', 'status: ready-for-planning')
      .replace('write_mode: checkpoint-prd', 'write_mode: final-prd')
      .replace('can_enter_spec_plan: no', 'can_enter_spec_plan: yes')
      .replace('---\n# Hook Fixture', 'readiness_verified_by: check-prd-artifact.js\n---\n# Hook Fixture');
    try {
      write(target, currentText);
      const result = runPrewrite(host, projectRoot, {
        tool_name: toolName,
        cwd: projectRoot,
        tool_input: mutationPayload(toolName, target, currentText, nextText),
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/ready|readiness_/i);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS).flatMap((host) => (
    ['Write', 'Edit', 'MultiEdit'].map((toolName) => [host, toolName])
  )))('%s %s blocks machine receipt field modification', (host, toolName) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-${toolName}-modify-receipt-`));
    const target = path.join(projectRoot, 'docs', 'brainstorms', 'sample-requirements.md');
    const currentText = readyPrd();
    const nextText = currentText.replace('readiness_finding_count: 0', 'readiness_finding_count: 1');
    try {
      write(target, currentText);
      const result = runPrewrite(host, projectRoot, {
        tool_name: toolName,
        cwd: projectRoot,
        tool_input: mutationPayload(toolName, target, currentText, nextText),
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('readiness_');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS).flatMap((host) => (
    ['Write', 'Edit', 'MultiEdit'].map((toolName) => [host, toolName])
  )))('%s %s blocks machine ready/receipt field deletion', (host, toolName) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-${toolName}-delete-receipt-`));
    const target = path.join(projectRoot, 'docs', 'brainstorms', 'sample-requirements.md');
    const currentText = readyPrd();
    const nextText = withoutReadyReceipt(currentText);
    try {
      write(target, currentText);
      const result = runPrewrite(host, projectRoot, {
        tool_name: toolName,
        cwd: projectRoot,
        tool_input: mutationPayload(toolName, target, currentText, nextText),
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/ready|readiness_/i);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS).flatMap((host) => (
    ['Write', 'Edit', 'MultiEdit'].map((toolName) => [host, toolName])
  )))('%s %s allows body refinement when machine fields stay unchanged', (host, toolName) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-${toolName}-body-refine-`));
    const target = path.join(projectRoot, 'docs', 'brainstorms', 'sample-requirements.md');
    const currentText = readyPrd();
    const nextText = currentText.replace('Body v1', 'Body v2');
    try {
      write(target, currentText);
      const result = runPrewrite(host, projectRoot, {
        tool_name: toolName,
        cwd: projectRoot,
        tool_input: mutationPayload(toolName, target, currentText, nextText),
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS))('%s 没有当前回合写入证据时不因 Git 状态缺失而阻止结束', (host) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-git-failure-`));
    try {
      const decision = readinessDecision(host, runReadiness(host, projectRoot));

      expect(decision.blocked).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS))('%s readiness hook allows a non-Git parent that contains a child Git repo', (host) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-workspace-parent-`));
    try {
      const child = path.join(projectRoot, 'api');
      fs.mkdirSync(child, { recursive: true });
      initGit(child);
      const decision = readinessDecision(host, runReadiness(host, projectRoot));
      expect(decision.blocked).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test.each(Object.keys(HOSTS))('%s readiness hook checks the destination of a renamed ready PRD', (host) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `spec-prd-${host}-rename-`));
    const oldPath = 'docs/brainstorms/old-requirements.md';
    const newPath = 'docs/brainstorms/new-requirements.md';
    try {
      initGit(projectRoot);
      write(path.join(projectRoot, oldPath), checkpointPrd()
        .replace('write_mode: checkpoint-prd', 'write_mode: final-prd')
        .replace('can_enter_spec_plan: no', 'can_enter_spec_plan: yes'));
      runGit(projectRoot, ['add', oldPath]);
      runGit(projectRoot, ['commit', '-m', 'test: add ready prd']);
      runGit(projectRoot, ['mv', oldPath, newPath]);
      write(path.join(projectRoot, HOSTS[host].finalizeRelative), [
        "process.stdout.write(JSON.stringify({ blocking_reason_codes: ['ready_receipt_absent'] }));",
        'process.exit(1);',
        '',
      ].join('\n'));

      const payload = transcriptPayload(projectRoot, [{ writes: [{
        path: newPath, content: fs.readFileSync(path.join(projectRoot, newPath), 'utf8'),
      }] }]);
      const decision = readinessDecision(host, runReadiness(host, projectRoot, payload));

      expect(decision.blocked).toBe(true);
      expect(decision.message).toContain(newPath);
      expect(decision.message).not.toContain(oldPath);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('hosts without confirmed hard enforcement are described as degraded', () => {
    const skill = fs.readFileSync('skills/spec-prd/SKILL.md', 'utf8');

    expect(skill).toContain('Claude is the only host with confirmed managed hard enforcement');
    expect(skill).toContain('Qoder hook projection is present but activation remains unverified');
    expect(skill).toContain('Codex, Cursor, and Kiro remain loud degraded');
  });
});

describe.each(Object.keys(HOSTS))('%s 当前回合 PRD 归属与结束边界', (host) => {
  let root;
  const relative = 'docs/brainstorms/sample-requirements.md';
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-prd-turn-scope-'));
    initGit(root);
    write(path.join(root, relative), readyPrd());
    failingFinalize(host, root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test.each(['untracked', 'dirty', 'staged'])('只读审阅不接管既有 %s PRD', (state) => {
    if (state !== 'untracked') {
      runGit(root, ['add', relative]);
      runGit(root, ['commit', '-qm', 'test: baseline']);
      write(path.join(root, relative), readyPrd().replace('Body v1', '历史修改'));
      if (state === 'staged') runGit(root, ['add', relative]);
    }
    const payload = transcriptPayload(root, [{}]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test('同一会话上一回合写过 PRD，不阻止新的只读任务', () => {
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd() }] }, {}]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test('当前回合成功写入的 final PRD 仍校验真实凭据', () => {
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd() }] }]);
    const decision = readinessDecision(host, runReadiness(host, root, payload));
    expect(decision.blocked).toBe(true);
    expect(decision.message).toContain('ready_receipt_stale');
    expect(decision.message).not.toContain('return to `spec-prd`');
    expect(decision.message).toContain('不是新的任务授权');
  });

  test('Stop 再次触发时允许如实报告未完成项并等待用户', () => {
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd() }] }], { stop_hook_active: true });
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test('其他会话或 CLI 改写后的内容不归入本回合', () => {
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd() }] }]);
    write(path.join(root, relative), readyPrd().replace('Body v1', '另一个会话的修改'));
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test('失败的写入不算已完成的当前任务变更', () => {
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd(), failed: true }] }]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test('元消息既不是新用户授权，也不清除本回合的写入归属', () => {
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd() }], meta: 'Stop hook feedback' }]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(true);
  });

  test('会话标识不匹配时不接管 transcript', () => {
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd() }] }], { session_id: 'session-b' });
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test.each(['{broken', '{}\n', ''])('损坏或未知记录格式只降级提醒，不扩大任务', (text) => {
    const payload = transcriptPayload(root, [{}]);
    write(payload.transcript_path, text);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test.each(['Edit', 'MultiEdit'])('%s 用成功工具回执重建实际写入内容', (tool) => {
    const before = readyPrd().replace('Body v1', '修改前');
    const payload = transcriptPayload(root, [{ writes: [{
      tool,
      input: tool === 'Edit'
        ? { file_path: relative, old_string: '修改前', new_string: 'Body v1' }
        : { file_path: relative, edits: [{ old_string: '修改前', new_string: 'Body v1' }] },
      result: { originalFile: before },
    }] }]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(true);
  });

  test.each(['Write', 'Edit'])('%s 回执为 LF 而 Windows 实际写入 CRLF 时仍保留归属', (tool) => {
    const payload = transcriptPayload(root, [{ writes: [{
      tool,
      ...(tool === 'Write' ? { path: relative, content: readyPrd() } : {
        input: { file_path: relative, old_string: '修改前', new_string: 'Body v1' },
        result: { originalFile: readyPrd().replace('Body v1', '修改前') },
      }),
    }] }]);
    write(path.join(root, relative), readyPrd().replace(/\n/g, '\r\n'));
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(true);
  });

  test('Edit 缺少原始内容回执时不猜测整个文件的归属', () => {
    const payload = transcriptPayload(root, [{ writes: [{ tool: 'Edit', input: {
      file_path: relative, old_string: '旧内容', new_string: 'Body v1',
    } }] }]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test('不向无关正文或检查点文件追加 finalize 要求', () => {
    const content = checkpointPrd();
    write(path.join(root, relative), content);
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content }] }]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });

  test('当前写入的 ready PRD 通过 finalize 后正常结束', () => {
    write(path.join(root, HOSTS[host].finalizeRelative), 'process.exit(0);\n');
    const payload = transcriptPayload(root, [{ writes: [{ path: relative, content: readyPrd() }] }]);
    expect(readinessDecision(host, runReadiness(host, root, payload)).blocked).toBe(false);
  });
});
