'use strict';

const fs = require('node:fs');
const path = require('node:path');

const vendorDir = path.resolve(__dirname, '../../skills/spec-runtime-setup/scripts/vendor');
const vendorFiles = fs.readdirSync(vendorDir).filter((name) => /^js-yaml-.*\.min\.js$/.test(name));

test('离线 YAML 副本与锁文件保持同一个已修复版本', () => {
  const lock = require('../../package-lock.json');
  const version = lock.packages['node_modules/js-yaml'].version;
  expect(version).toBe('3.15.2');
  expect(vendorFiles).toEqual([`js-yaml-${version}.min.js`]);
  const installed = fs.readFileSync(path.resolve(__dirname, '../../node_modules/js-yaml/dist/js-yaml.min.js'));
  expect(fs.readFileSync(path.join(vendorDir, vendorFiles[0])).equals(installed)).toBe(true);
});

test.each([
  ['dependency', () => require('js-yaml')],
  ['vendored', () => require(path.join(vendorDir, vendorFiles[0]))],
])('%s 的空映射合并同样消耗预算', (_name, load) => {
  const input = 'empty: &e {}\nresult:\n  <<: [*e, *e, *e]\n';
  expect(() => load().safeLoad(input, { maxTotalMergeKeys: 1 })).toThrow(/maxTotalMergeKeys/);
});
