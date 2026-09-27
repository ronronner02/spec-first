const fs = require('node:fs');
const path = require('node:path');

/**
 * 仅在文件不存在时创建通用日志格式；已有日志归用户所有，不做改写。
 * @param {string} projectRoot
 * @returns {boolean} 是否创建了文件
 */
function bootstrapChangelog(projectRoot) {
  const filePath = path.join(projectRoot, 'CHANGELOG.md');

  if (fs.existsSync(filePath)) {
    return false;
  }

  fs.writeFileSync(filePath, buildInitialChangelog(), 'utf8');
  return true;
}

// 初始化工具不是业务项目的一次发布，不写入工具版本、作者或安装事件。
function buildInitialChangelog() {
  return `# Changelog

- 记录格式：\`- v版本号 YYYY-MM-DD HH:MM:SS 作者: 变更摘要 [(user-visible)]\`
- 说明：
  - \`v版本号\` 使用本次变更对应的发布版本
  - 日期时间必须使用 \`YYYY-MM-DD HH:MM:SS\`
  - \`作者\` 填写提交人或变更责任人
  - \`变更摘要\` 使用中文，简明说明本次改动
  - 用户可感知的变更在末尾追加 \`(user-visible)\`
`;
}

// 保留既有导出兼容调用方，初始化模板不再使用工具安装时间。
function formatChangelogTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  bootstrapChangelog,
  buildInitialChangelog,
  formatChangelogTimestamp,
};
