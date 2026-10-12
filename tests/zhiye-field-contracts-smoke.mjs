import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/form-runtime.js', import.meta.url), 'utf8') + '\n' +
  fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const context = { window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null }, location: { hostname: 'example.test' },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {} };
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `globalThis.api = {
  buildProfileItemAliases, getProjectOverwriteGroups, assignProjectOverwrite, buildChoiceMatchTargets,
  plan(fields, entries) { getCurrentProfileEntries = () => entries; return buildAutofillPlan({ fields }); }
};})();`), context);
const { api } = context;
const entry = (label, value, index = 0, category = '实习经历') => {
  const e = { label, value, hasValue: true, category, subsection: `${category} ${index + 1}`,
    itemId: `${category}-${index}-${label}`, valuePath: { sectionKey: category, itemIndex: index } };
  e.aliases = api.buildProfileItemAliases({ category }, e); return e;
};
let next = 0;
const field = (label, category = '实习经历', index = 1, value = '', extra = {}) => ({
  fieldId: `zhiye-${++next}`, label, section: category, siteAdapterId: 'zhiye', type: 'text',
  canFill: true, currentValue: value, hasCurrentValue: !!value, options: [], repeatItemIndex: index,
  repeatItemTotal: 2, nearbyText: '请选择 开始时间 结束时间 学历 行业',
  groupText: '是否有工作/实习经历 公司名称 工作职位 开始时间 结束时间 工作描述 所在部门', ...extra
});
const internships = [entry('公司', '虚构机构甲'), entry('职位', '岗位甲'), entry('工作内容', '真正描述甲'),
  entry('开始时间', '2026-07'), entry('行业', '虚构行业'), entry('公司', '虚构机构乙', 1),
  entry('职位', '岗位乙', 1), entry('工作内容', '真正描述乙', 1), entry('开始时间', '2024-09', 1),
  entry('结束时间', '2025-03', 1), entry('行业', '行业乙', 1)];
const cards = [1, 2].flatMap((index) => [field('是否有工作/实习经历', '实习经历', index, '', { type: 'combobox' }),
  field('公司名称', '实习经历', index, index === 1 ? '虚构机构乙' : '虚构机构甲'),
  field('工作职位', '实习经历', index), field('所在部门', '实习经历', index),
  field('开始时间', '实习经历', index), field('结束时间', '实习经历', index),
  field('工作描述', '实习经历', index, '错误日期', { type: 'textarea' })]);
let plan = api.plan(cards, internships);
const candidate = (f) => plan.candidates.find(c => c.fieldId === f.fieldId);
assert.equal(candidate(cards[6])?.value, '真正描述乙');
assert.equal(candidate(cards[13])?.value, '真正描述甲');
assert.equal(candidate(cards[2])?.value, '岗位乙');
assert.equal(candidate(cards[0])?.value, '是');
assert.equal(candidate(cards[0])?.sourceLabel, '公司');
assert.equal(candidate(cards[3]), undefined, '部门不能匹配行业');
assert.equal(candidate(cards[12]), undefined, '缺失结束时间不能借用另一段经历');
assert.ok(plan.candidates.every(c => c.sourceCategory === '实习经历' && c.shouldAutoFill));

const edu = [entry('学校', '虚构大学', 0, '教育经历'), entry('学历', '硕士', 0, '教育经历'),
  entry('学院（院系）', '虚构学院', 0, '教育经历'), entry('开始时间', '2024-09', 0, '教育经历')];
const education = [field('学校名称', '教育经历', 1, '虚构大学'), field('实验室名称', '教育经历'), field('学院名称', '教育经历', 1, '旧错误学院')];
plan = api.plan(education, edu);
assert.equal(candidate(education[1]), undefined, '实验室名称不能借用学历');
assert.equal(candidate(education[2])?.value, '虚构学院');
assert.equal(candidate(education[2])?.shouldAutoFill, true);
plan = api.plan(education, [...edu, entry('实验室名称', '明确实验室', 0, '教育经历')]);
assert.equal(candidate(education[1])?.value, '明确实验室');

plan = api.plan([field('婚否', '', 0)], [entry('婚姻状况', '未婚', 0, '基本信息')]);
assert.equal(plan.candidates[0]?.value, '未婚');
const language = [field('语言考试', '外语能力', 1), field('考试分数', '外语能力', 1), field('语言水平', '外语能力', 1)];
plan = api.plan(language, [entry('证书名称（技能名称）', 'CET-6', 0, '外语能力'), entry('成绩', '555', 0, '外语能力')]);
assert.equal(candidate(language[0])?.value, 'CET-6');
assert.equal(candidate(language[1])?.value, '555');
assert.equal(candidate(language[2]), undefined, '不根据考试分数猜测语言熟练程度');

// A disabled end-date still belongs to the record. It must not split a manual
// selection away from that record's description or "has experience" question.
const projects = [0, 7].flatMap(index => [entry('项目名称', `项目${index}`, index, '项目经历'),
  entry('开始时间', '2026-03', index, '项目经历'), entry('项目描述', `正确全文${index}`, index, '项目经历')]);
const projectFields = [1, 2].flatMap(index => [field('是否有项目经历', '项目经历', index),
  field('项目名称', '项目经历', index, '导入名称'), field('开始时间', '项目经历', index),
  field('结束时间', '项目经历', index, '', { canFill: false }), field('项目描述', '项目经历', index, '旧描述')]);
const groups = api.getProjectOverwriteGroups({ fields: projectFields });
assert.equal(groups.length, 2);
assert.ok(groups.every(g => g.fields.includes(projectFields[g.repeatIndex === 1 ? 4 : 9])));
api.assignProjectOverwrite(groups[0], projects[0]); api.assignProjectOverwrite(groups[1], projects[3]);
plan = api.plan(projectFields, projects);
assert.equal(candidate(projectFields[9])?.value, '正确全文7');
assert.equal(candidate(projectFields[5])?.value, '是');
assert.ok(!plan.candidates.some(c => c.fieldId === projectFields[8].fieldId));
api.assignProjectOverwrite(groups[1], null);
plan = api.plan(projectFields, projects);
assert.ok(!plan.candidates.some(c => projectFields.slice(5).some(f => f.fieldId === c.fieldId)), '跳过项目必须包括描述和是否有经历');
assert.ok(api.buildChoiceMatchTargets('是', '是否有工作/实习经历').includes('有'));
console.log('zhiye-field-contracts-smoke: ok');
