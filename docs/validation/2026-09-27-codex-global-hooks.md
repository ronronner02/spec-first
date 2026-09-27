# Codex Windows hook 全局安装验证

- 日期：2026-09-27。
- 工作流：`spec-debug`。
- 范围：同日源码修复在维护者本机的全局安装与隔离新项目中的分发验收。
- 非目标：npm 发布、远端服务部署、批量改写旧项目或重启用户终端。

根因与源码修复见 [Windows hook 修复报告](2026-09-27-codex-windows-hooks.md)。仅修复单个项目的配置时，旧全局 CLI 和共享 provider 仍会让新项目生成错误命令，因此另外验证了安装产物。

## 安装产物与保护

- 从已修复 source 构建本地安装包，再离线更新全局 CLI；未直接将安装目录作为 source 修改。
- 用户级共享 provider 通过源生成器定向投射，没有重建整个用户 runtime。
- 安装后 1250 个文件逐一与本地包内容核对一致；与旧安装相比，运行代码仅两个修复文件变化。
- 五个已有 launcher 保持原样；10 个受保护配置、launcher 和项目 hook 文件的哈希与更新前一致。
- 未新建全局 SessionStart 注册，避免与项目级 hook 重复执行。
- 原始本地包、备份、清单及配置恢复细节保留在私有证据中，不上传 GitHub。

## 新项目验收

各项目目录包含空格和单引号，并隔离 `HOME`、`USERPROFILE`、`CODEX_HOME`。

| 全局入口 | 新项目初始化 | SessionStart 注册命令 |
| --- | --- | --- |
| npm `spec-first.ps1` | exit 0 | PowerShell exit 0，合法 JSON |
| npm `spec-first.cmd` | exit 0 | PowerShell exit 0，合法 JSON |
| npm `spec-first.exe` | exit 0 | PowerShell exit 0，合法 JSON |
| 用户级 `spec-first.exe` | exit 0 | PowerShell exit 0，合法 JSON |

另外两个新项目分别使用项目级和用户级 provider，实际完成 Graphify 原生安装、命令归一化及 PowerShell 执行，均为 exit 0；重复归一化字节不变，原 SessionStart 注册保持有效。

这一阶段的 7 项检查全部 passed，结构化验收为 `verified / all-claims-consistent`。该结论仅覆盖本机安装产物及上述新项目链路，不表示所有历史测试或所有既有项目已通过验收。

## 后续使用

- 新项目使用包含修复的全局 CLI 执行 `spec-first init --codex`；需要 Graphify 时，再在宿主中运行 `spec-runtime-setup --only graphify`。
- 本地修复包仍标记为 `1.15.3`，不是新发布的 npm 版本。重新安装不含本提交的同版本包仍可能覆盖修复。
- GitHub 推送、全局包安装、项目 runtime 更新是三个独立步骤；应分别检查，不能互相替代验收。
- 已打开的 Codex 会话未被强制重启。备份和原始日志继续保留在本地。
