import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/form-runtime.js', import.meta.url), 'utf8') + '\n' +
  fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const context = { window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null }, location: { hostname: 'example.test' },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {} };
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.api = { buildProfileItemAliases, plan(fields, entries) {
    getCurrentProfileEntries = () => entries;
    return buildAutofillPlan({ fields });
  }};
})();`), context);
const { api } = context;
const entry = (label, value, index = 0, category = '实习经历') => {
  const e = { label, value, hasValue: true, category, subsection: category + ' ' + (index + 1),
    itemId: category + index + label, valuePath: { sectionKey: category, itemIndex: index } };
  e.aliases = api.buildProfileItemAliases({ category }, e);
  return e;
};
let counter = 0;
const field = (label, value = '', section = '实习经历') => ({ fieldId: `field-${++counter}`,
  label, section, groupText: '学校名称 公司名称 职位名称 开始时间 结束时间 描述',
  nearbyText: `${label} | 开始时间`, type: label === '描述' ? 'textarea' : 'text',
  siteAdapterId: 'feishu-jobs', canFill: true, currentValue: value, hasCurrentValue: !!value, options: [] });
const card = (company = '', description = '') => [field('公司名称', company), field('职位名称'),
  field('开始时间'), field('结束时间'), field('描述', description)];
const entries = [
  entry('公司', '虚构研究院甲'), entry('职位', '工程实习生甲'), entry('开始时间', '2026-07'),
  entry('工作内容', '实现本地检索模块'), entry('公司', '虚构研究院乙', 1),
  entry('职位', '工程实习生乙', 1), entry('开始时间', '2024-09', 1),
  entry('工作内容', '开发图像分析模块', 1), entry('结束时间', '2025-03', 1),
  entry('开始时间', '2023-01', 0, '教育经历'), entry('结束时间', '2027-06', 0, '项目经历')
];
const getCandidate = (plan, f) => plan.candidates.find(c => c.fieldId === f.fieldId);

// Reordered imported cards must use their company identity for every sibling.
const fields = [...card('虚构研究院乙', '2024-09'), ...card('虚构研究院甲', '2026-07')];
let plan = api.plan(fields, entries);
assert.equal(getCandidate(plan, fields[4])?.value, '开发图像分析模块');
assert.equal(getCandidate(plan, fields[9])?.value, '实现本地检索模块');
assert.equal(getCandidate(plan, fields[1])?.value, '工程实习生乙');
assert.equal(getCandidate(plan, fields[7])?.value, '2026-07');
assert.equal(getCandidate(plan, fields[3])?.value, '2025-03');
assert.equal(getCandidate(plan, fields[8]), undefined, '缺失结束时间不能借用其他记录');
assert.ok(plan.candidates.every(c => c.sourceCategory === '实习经历' && c.shouldAutoFill));

const blank = [...card(), ...card()];
plan = api.plan(blank, entries);
assert.equal(getCandidate(plan, blank[4])?.value, '实现本地检索模块');
assert.equal(getCandidate(plan, blank[9])?.value, '开发图像分析模块');
assert.equal(api.plan(card('', '已有导入内容'), entries).candidates.length, 0);
assert.equal(api.plan(card('未知公司'), entries).candidates.length, 0);
const ambiguous = [...entries, entry('公司', '虚构研究院甲', 2), entry('工作内容', '其他内容', 2)];
assert.equal(api.plan(card('虚构研究院甲'), ambiguous).candidates.length, 0);
assert.equal(api.plan([...card(), ...card(), ...card()], entries).candidates.length, 9);

// Section headings win over neighbouring education labels. Existing school
// identity also keeps the qualification, major and dates in the same record.
const eduEntries = [entry('学校', '虚构大学甲', 0, '教育经历'), entry('专业', '计算机', 0, '教育经历'),
  entry('学校', '虚构大学乙', 1, '教育经历'), entry('专业', '通信工程', 1, '教育经历'),
  entry('开始时间', '2020-09', 1, '教育经历'), entry('结束时间', '2024-06', 1, '教育经历')];
const edu = [field('学校名称', '虚构大学乙', '教育经历'), field('专业', '', '教育经历'),
  field('开始时间', '', '教育经历'), field('结束时间', '', '教育经历')];
plan = api.plan(edu, eduEntries);
assert.equal(getCandidate(plan, edu[1])?.value, '通信工程');
assert.equal(getCandidate(plan, edu[2])?.value, '2020-09');
assert.equal(getCandidate(plan, edu[3])?.value, '2024-06');
console.log('feishu-personal-internship-smoke: ok');
