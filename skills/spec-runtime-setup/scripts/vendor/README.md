# 离线运行依赖

`js-yaml-3.15.2.min.js` 与 `js-yaml` 3.15.2 npm 包的浏览器分发文件逐字节一致。
它随运行资产分发，使宿主目录中的配置检查不依赖目标项目的 `node_modules`。

- 来源：https://github.com/nodeca/js-yaml
- 版本：3.15.2
- 许可证：MIT，保留 `js-yaml-LICENSE`。
- 安全修复：空映射合并同样计入 `maxTotalMergeKeys`，对应 GHSA-2883-xcg3-v3hh。
