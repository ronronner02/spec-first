'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;
const MUTATION_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

function inspectPrdSessionScope(payload, projectDir) {
  if (payload.stop_hook_active === true) return { paths: [] };
  if (typeof payload.session_id !== 'string' || !payload.session_id
    || typeof payload.transcript_path !== 'string' || !path.isAbsolute(payload.transcript_path)) {
    return degraded('prd_scope_payload_missing');
  }
  let records;
  try {
    records = readTranscriptTail(payload.transcript_path);
  } catch (_error) {
    return degraded('prd_scope_transcript_unavailable');
  }
  const turn = currentTurn(records, payload.session_id);
  if (!turn) return degraded('prd_scope_turn_unavailable');

  const calls = new Map();
  const owned = new Map();
  let reasonCode;
  for (const record of turn) {
    const blocks = Array.isArray(record.message && record.message.content) ? record.message.content : [];
    if (record.type === 'assistant') {
      for (const block of blocks) {
        if (block.type === 'tool_use' && MUTATION_TOOLS.has(block.name)) {
          calls.set(block.id, { name: block.name, input: block.input || {}, cwd: record.cwd });
        }
      }
      continue;
    }
    if (record.type !== 'user') continue;
    for (const block of blocks) {
      if (block.type !== 'tool_result' || block.is_error === true) continue;
      const call = calls.get(block.tool_use_id);
      if (!call) continue;
      const result = record.toolUseResult || {};
      if (result.success === false || result.interrupted === true) continue;
      const target = prdTarget(call.input.file_path, call.cwd || projectDir, projectDir);
      if (!target) continue;
      if (typeof result.filePath === 'string'
        && path.resolve(call.cwd || projectDir, result.filePath) !== target.absolute) {
        owned.delete(target.relative);
        reasonCode = 'prd_scope_write_receipt_incomplete';
        continue;
      }
      const previous = owned.get(target.relative);
      const content = reconstructWrite(call, result, previous && previous.content);
      if (content === null) {
        owned.delete(target.relative);
        reasonCode = 'prd_scope_write_receipt_incomplete';
      } else {
        owned.set(target.relative, { ...target, content });
      }
    }
  }

  const paths = [];
  for (const entry of owned.values()) {
    try {
      const root = fs.realpathSync(projectDir);
      const real = fs.realpathSync(entry.absolute);
      if (!within(root, real) || !fs.lstatSync(entry.absolute).isFile()) {
        reasonCode = 'prd_scope_path_unavailable';
        continue;
      }
      const current = fs.readFileSync(entry.absolute);
      // 工具回执确认实际写入，内容一致性排除随后发生的并发修改；不以 Git dirty 代替归属。
      if (digest(current.toString('utf8')) !== digest(entry.content)) {
        reasonCode = 'prd_scope_content_changed';
        continue;
      }
      paths.push(entry.relative);
    } catch (_error) {
      reasonCode = 'prd_scope_path_unavailable';
    }
  }
  return { paths: paths.sort(), ...(reasonCode ? { reasonCode } : {}) };
}

function readTranscriptTail(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('transcript_not_regular_file');
    const size = Math.min(stat.size, MAX_TRANSCRIPT_BYTES);
    const buffer = Buffer.alloc(size);
    const start = stat.size - size;
    const read = fs.readSync(fd, buffer, 0, size, start);
    let text = buffer.subarray(0, read).toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  } finally {
    fs.closeSync(fd);
  }
}

function currentTurn(records, sessionId) {
  const matching = records.filter((record) => record && record.sessionId === sessionId && record.isSidechain !== true);
  const byId = new Map(matching.filter((record) => typeof record.uuid === 'string').map((record) => [record.uuid, record]));
  let current = [...matching].reverse().find((record) => ['user', 'assistant'].includes(record.type));
  const chain = [];
  const seen = new Set();
  // 沿宿主消息祖先链取当前回合，避免把重试前已放弃的分支和压缩摘要当作用户授权。
  while (current && typeof current.uuid === 'string' && !seen.has(current.uuid)) {
    seen.add(current.uuid);
    if (current.isCompactSummary === true || current.subtype === 'compact_boundary') return null;
    if (isUserPrompt(current)) return chain.reverse();
    chain.push(current);
    current = byId.get(current.parentUuid);
  }
  return null;
}

function isUserPrompt(record) {
  if (record.type !== 'user' || record.isMeta === true) return false;
  const content = record.message && record.message.content;
  if (typeof content === 'string') return true;
  return Array.isArray(content) && content.some((block) => block.type === 'text')
    && !content.some((block) => block.type === 'tool_result');
}

function reconstructWrite(call, result, previous) {
  if (call.name === 'Write') return typeof call.input.content === 'string' ? call.input.content : null;
  let content = typeof result.originalFile === 'string' ? result.originalFile : previous;
  if (typeof content !== 'string') return null;
  const edits = call.name === 'MultiEdit' ? call.input.edits : [call.input];
  if (!Array.isArray(edits) || edits.length === 0) return null;
  for (const edit of edits) {
    if (!edit || typeof edit.old_string !== 'string' || !edit.old_string
      || typeof edit.new_string !== 'string') return null;
    const parts = content.split(edit.old_string);
    if (parts.length < 2 || (parts.length > 2 && edit.replace_all !== true)) return null;
    content = parts.join(edit.new_string);
  }
  return content;
}

function prdTarget(filePath, cwd, projectDir) {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) return null;
  const root = path.resolve(projectDir);
  const absolute = path.resolve(cwd, filePath);
  if (!within(root, absolute)) return null;
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  return /^docs\/brainstorms\/.+-requirements\.md$/.test(relative) ? { relative, absolute } : null;
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function digest(content) {
  // 原生 Windows 写入工具的回执使用 LF，落盘时可能转换为 CRLF；只归一这一种差异。
  return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

function degraded(reasonCode) {
  return { paths: [], reasonCode };
}

module.exports = { inspectPrdSessionScope, MAX_TRANSCRIPT_BYTES };
