---
name: spec-diagnose
description: Read-only, evidence-grounded session and workflow diagnostics. Use when a spec-first or agent session went wrong — repeated work, ignored plans, stumbles, missed skills, high token cost, or unexpected delays — and the user wants a forensic report citing path:line evidence from session transcripts and run artifacts. Not for active bug fixing (use spec-debug) or code review (use spec-code-review).
---

# Spec Diagnose

Investigate what actually happened in a coding-agent session or `spec-*` workflow run by reading transcripts and run artifacts on disk, and produce an evidence-grounded forensic report.

**Core principle:** Every finding cites `path:line` (or `artifact:line`). No citation, no finding. Every count or timing number comes from the transcript or a command you ran, never from memory.

## Scenario Capability

Follows `docs/contracts/workflows/scenario-capability-matrix.md` (default).
Overrides: none

## Workflow Contract Summary

- **Input:** A scoped problem statement (session id/path or current session, expected behavior, observed behavior, and the metric/event of concern).
- **Output:** A read-only forensic report covering timeline, plan adherence, repeated work, stumbles, quality evidence, request conflicts, and cost/time with `path:line` citations.
- **Hard exits:** Never modify, move, or delete session transcripts, project source files, or generated runtime mirrors; never fabricate counts/prices; never export or share transcripts without explicit user approval and redaction audit.
- **Authority:** Session transcripts and repo/run artifacts are evidence; the LLM judges causal patterns and reports findings without mutating project state.
- **Consumers:** User, maintainers, and downstream `spec-debug` / `spec-compound` workflows.

## Anti-Rationalization Red Flags

| 红旗念头 | 停下来做什么 |
| --- | --- |
| 「问题很明显，跳过问题界定直接扫日志」 | 先确认具体 session、预期行为、实际现象与关注指标（耗时/token/重复动作/跳步），再开始检索。 |
| 「大概读过相关对话，凭记忆写结论」 | 每条 finding 必须带 `path:line` 引用与原始命令输出；无引用不进报告。 |
| 「顺手把发现的 skill 或代码问题改掉」 | `spec-diagnose` 是只读取证流程；修复源码交由 `spec-debug` 或 `spec-work`，改 skill 交由 `spec-write-skill`。 |

这是注意力提醒,不是 gate,也不替代 LLM 判断;最终是否停下、如何处理仍由你按当前证据决定。

## Workflow

1. **Problem intake.** Clarify (one question at a time if missing) the target session(s), turn range if known, what was expected, what happened instead, and the observable of concern (wall-clock, tokens, repeated work, ignored plan, or missed skill). A vague complaint ("it took too long") is not a scoped problem statement.
2. **Locate artifacts (read-only) & redact before context.** Resolve exact filesystem paths for the main session transcript, any subagent transcripts, and relevant `.spec-first/workflows/` run artifacts. Confirm session identity using session metadata (id, timestamp, cwd) or a **redacted** summary of the opening prompt; list any rejected candidates and why.
3. **Context safety & pre-read minimization.** Session transcript lines can exceed megabytes. Never load an entire raw transcript into context at once; inspect line counts/sizes first and use bounded slices, streaming filters, or targeted line ranges. **Mask or omit secrets, tokens, auth headers, and PII (e.g., `Bearer ***`, `sk-***`, `ghp_***`) before any transcript excerpt enters model context or the forensic report**, while retaining the exact `path:line` citation.
4. **Seven-dimension forensic triage.** Analyze (in parallel if authorized and callable, otherwise sequentially) across all seven lenses, discarding any claim without `path:line` evidence:
   - `skill-timeline`: which skills/workflows fired, in what order, and where expected entrypoints were skipped.
   - `plan-adherence`: where execution drifted from the active plan, KTDs, or task-pack constraints, especially after compaction.
   - `repeated-work`: redundant file reads, re-runs, or duplicate subagent dispatches.
   - `stumbles`: failed tool calls, wrong paths, environment/sandbox errors, and retry loops.
   - `quality-evidence`: whether completion/test claims had matching command output or skipped verification.
   - `request-conflicts`: contradictions between user prompts, `AGENTS.md`/`CLAUDE.md`, and skill contracts.
   - `cost-and-time`: token/turn concentration and idle/retry bottlenecks derived strictly from recorded usage/timestamps.
5. **Report.** Deliver a structured forensic summary with `path:line` citations, coverage limitations (e.g., missing subagent logs or unrecorded token fields), and a clear routing recommendation (`spec-debug`, `spec-write-skill`, or `spec-compound`) without mutating any project file.
6. **Optional export (only on explicit request).** Never bundle or archive transcripts unprompted. If the user explicitly asks to export a shareable bundle, redact secrets/tokens/PII first, audit the scrubbed output until clean, present the redaction log, and wait for explicit approval before archiving.
