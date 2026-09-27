# Codex Windows hook 命令生成修复

- 日期：2026-09-27。
- 工作流：`spec-debug`。
- 目标：修复新项目初始化和 Graphify 集成中的 PowerShell 命令生成，保留其他宿主及用户自定义 hook。
- 非目标：关闭现有终端、批量覆盖项目配置、禁用 hook、发布 npm 或修改系统环境变量。
- 证据边界：源码、测试和实际命令执行为 confirmed；旧交互会话是否已重载配置不在本次验收范围内。

## 根因

核对 GitHub 默认分支 `master` 的 `74655dc` 时，两处旧实现均仍存在。

| 注册项 | 修复前 | 修复后 |
| --- | --- | --- |
| SessionStart `commandWindows` | `".codex\hooks\session-start.cmd"` | `node .codex/hooks/session-start` |
| Graphify Windows 命令 | `'C:\Local Tools\graphify.exe' hook-check` | `& 'C:\Local Tools\graphify.exe' hook-check` |

PowerShell 把独立的带引号路径当作字符串；SessionStart 即使退出码为 0，也可能根本没有执行脚本。带引号的 Graphify 路径后直接跟参数则会在解析阶段报错。两者都需要实际执行注册命令验证，`hooks/list` 的 enabled/trusted 状态不等于执行成功。

## 最小修复与边界

1. `src/cli/adapters/codex.js`：Windows SessionStart 复用现有显式 Node 命令，保持项目移动后的相对路径可用。
2. `skills/spec-runtime-setup/scripts/providers/graphify.cjs`：仅为 Codex 的 Windows launcher 生成带调用运算符的 `commandWindows`；按 PowerShell 规则转义单引号。保留非 Windows 命令和其他用户 hook，并支持重复归一化。
3. `tests/integration/init-six-host-lifecycle.integration.test.js`：在移动后、含空格的目录中执行真实 PowerShell 注册命令，检查 SessionStart JSON；同时隔离 `HOME`、`USERPROFILE`、`CODEX_HOME`。
4. `tests/unit/mcp-setup-providers.test.js`：覆盖路径空格、单引号、`hook-check` / `hook-guard`、用户 hook 保留及幂等。

修改归属于上述 source；既有项目和全局安装属于独立安装产物，不通过手写 runtime 副本来替代源码修复。

## 验证

聚焦回归命令：

```powershell
node node_modules/jest/bin/jest.js --runTestsByPath tests/unit/mcp-setup-providers.test.js tests/integration/init-six-host-lifecycle.integration.test.js --runInBand --testNamePattern "codex hook projection remains runnable|Codex Windows Graphify hook|normalizes Python Codex host surfaces|accepts graphifyy 0.9.12 Claude dual"
```

- 修复前：SessionStart 与 Graphify 的回归测试均按预期失败。
- 修复后聚焦回归：4 passed。
- `node scripts/typecheck-js.js`：256 个文件通过。
- `node scripts/lint-skill-entrypoints.js`：401 个文件通过。
- 完整相关测试文件：88 passed、2 failed、1 skipped。两项失败均发生在 Windows 文件符号链接创建阶段（`EPERM`），尚未进入本次修复逻辑；保留失败记录，不宣称全套通过。单独复跑远端原始测试文件中的这两个用例，仍在相同的符号链接创建位置报 `EPERM`，确认不是本次新增回归。
- 本轮工具会话曾注入 `PATHEXT=.CPL`，使首次 PowerShell 回归找不到 Node；使用机器级 `PATHEXT` 在测试子进程中重跑后，聚焦回归通过。未更改系统设置或测试断言。
- 现有项目的两个注册命令均实际执行成功，SessionStart 返回合法 JSON；安装包与新项目链路见 [全局安装验证](2026-09-27-codex-global-hooks.md)。
- 定向人工审查未发现本次修复的剩余代码问题；未执行独立 reviewer。
- 全量 `npm test` 和旧交互终端重载验收未执行。

## 更新与生效

1. 使用包含本修复的源码或安装包。只更新 GitHub 源码不会自动替换已有全局 npm 安装，也不会发布 npm 新版本。
2. 对既有项目，先预览并核对生成差异，再通过 `spec-first init --codex` 更新受管理的 runtime；不要整文件覆盖共享全局配置或其他用户 hook。
3. 使用 Graphify 时，在宿主中运行 `spec-runtime-setup --only graphify`，由 provider 完成原生安装后的命令归一化。单独调用外部 Graphify 安装器不等于执行了该步骤。
4. 已打开的 Codex 进程可能仍缓存旧配置；任务空闲后重启该会话即可，无需关闭其他项目终端。

原始运行日志、受保护配置哈希和回滚备份保留在本地证据目录，不随源码公开。
