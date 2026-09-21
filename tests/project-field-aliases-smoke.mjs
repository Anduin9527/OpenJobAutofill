import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const context = {
  window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null }, location: { hostname: 'example.test' },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {}
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.api = { getSemanticBucket, getPairedDateRangeLabel, getMokaGroupedDateLabel, buildProfileItemAliases,
    plan(fields, entries) {
      getCurrentProfileEntries = () => entries;
      return buildAutofillPlan({ fields });
    }
  };
})();`), context);
const { api } = context;

const entries = [['项目名称', '示例项目'], ['职位', '核心开发者'], ['项目链接', 'https://example.test/project'], ['项目内容', '项目背景及实现内容'], ['开始时间', '2026-01'], ['结束时间', '2026-08']]
  .map(([label, value], index) => ({ label, value, hasValue: true, category: '项目经历', subsection: '项目经历 1', itemId: `entry-${index}`, valuePath: { sectionKey: 'project', itemIndex: 0 } }));
for (const entry of entries) entry.aliases = api.buildProfileItemAliases({ category: entry.category }, entry);
const labels = ['项目名称', '项目角色', '项目链接', '描述', api.getPairedDateRangeLabel('起止时间', 0, 2), api.getPairedDateRangeLabel('起止时间', 1, 2)];
const fields = labels.map((label, index) => ({fieldId: `field-${index}`, label, section: '项目经历', type: index === 3 ? 'textarea' : 'text', canFill: true, currentValue: '', hasCurrentValue: false, options: [], groupText: '项目名称 项目角色 起止时间 项目链接 描述', nearbyText: index === 3 ? '项目链接 https://example.test/project' : '项目名称 示例项目'}));
const plan = api.plan(fields, entries);
for (let i = 0; i < entries.length; i++) assert.equal(plan.candidates.find(c => c.fieldId === `field-${i}`)?.sourceLabel, entries[i].label, labels[i]);
for (const [index, missing] of [[1, '职位'], [3, '项目内容']]) {
 assert.equal(api.plan(fields, entries.filter(e => e.label !== missing)).candidates.some(c => c.fieldId === `field-${index}`), false, `missing ${missing} must not fill from neighbouring fields`);
}
assert.equal(api.getPairedDateRangeLabel('起止时间', 0, 4), '');
assert.equal(api.getPairedDateRangeLabel('未知字段', 0, 2), '');
assert.equal(api.getMokaGroupedDateLabel('起止时间', 1, 2), '开始时间月');
assert.equal(api.getSemanticBucket('描述', '基本信息'), '');
console.log('project-field-aliases-smoke: ok');

// A custom aggregate description must win over the standard content alias,
// independently of profile order, while legacy profiles retain fallback.
const description = { ...entries[3], label: '项目描述', value: '背景 + 职责 + 成果', itemId: 'aggregate' };
description.aliases = api.buildProfileItemAliases({ category: description.category }, description);
for (const ordered of [[...entries, description], [description, ...entries]]) {
  for (const label of ['项目描述', '项目内容']) {
    const field = { ...fields[3], label };
    const candidate = api.plan([field], ordered).candidates[0];
    assert.equal(candidate?.sourceLabel, label, `exact ${label} wins over alias`);
    assert.equal(candidate?.shouldAutoFill, true);
  }
}
assert.equal(api.plan([{ ...fields[3], label: '项目描述' }], entries).candidates[0]?.sourceLabel, '项目内容');
assert.equal(api.plan([{ ...fields[3], label: '项目内容' }], [description]).candidates[0]?.sourceLabel, '项目描述');
console.log('project-description-exact-match: ok');

// SF project cards: internship values must never win, even when surrounding
// text mentions internships and dates. Each repeated card keeps its own data.
const scopedEntries = [];
for (let i = 0; i < 4; i++) {
  for (const category of ['实习经历', '项目经历']) {
    for (const label of ['职位', '本人职责', '项目内容', '项目描述', '开始时间', '结束时间']) {
      const entry = { label, value: `${category}-${i}-${label}`, hasValue: true,
        category, subsection: `${category} ${i + 1}`, itemId: `${category}-${i}-${label}`,
        valuePath: { sectionKey: category === '项目经历' ? 'project' : 'internship', itemIndex: i } };
      entry.aliases = api.buildProfileItemAliases({ category }, entry);
      scopedEntries.push(entry);
    }
  }
}
const sfLabels = ['职务', '项目职责', '项目简述', '开始时间', '结束时间'];
const sfFields = Array.from({ length: 4 }, (_, i) => sfLabels.map((label, j) => ({
  ...fields[3], fieldId: `sf-${i}-${j}`, label, section: '项目经历',
  nearbyText: '实习经历 1 开始时间 结束时间 项目名称 职务 项目职责 项目简述',
  groupText: '', type: j < 3 ? 'textarea' : 'text'
}))).flat();
const expected = ['职位', '本人职责', '项目内容', '开始时间', '结束时间'];
for (const ordered of [scopedEntries, [...scopedEntries].reverse()]) {
  const sfPlan = api.plan(sfFields, ordered);
  for (let i = 0; i < 4; i++) for (let j = 0; j < sfLabels.length; j++) {
    const candidate = sfPlan.candidates.find(c => c.fieldId === `sf-${i}-${j}`);
    assert.equal(candidate?.sourceCategory, '项目经历', `${i}: ${sfLabels[j]} category`);
    assert.equal(candidate?.sourceLabel, expected[j], `${i}: ${sfLabels[j]} label`);
    assert.equal(candidate?.sourceSubsection, `项目经历 ${i + 1}`, `${i}: ${sfLabels[j]} record`);
  }
}
assert.equal(api.plan(sfFields, scopedEntries.filter(e => e.category === '实习经历')).candidates.length, 0,
  'missing project data must not borrow internships');
assert.equal(api.plan([sfFields[0]], scopedEntries.filter(e => e.label !== '职位')).candidates.length, 0,
  'project 职务 must not fall back to 本人职责 or dates');
assert.equal(api.plan([{ ...fields[1], label: '职务', section: '实习经历', nearbyText: '', groupText: '' }],
  scopedEntries.filter(e => e.category === '实习经历')).candidates[0]?.sourceLabel, '职位',
  'internship 职务 retains role meaning');
console.log('sf-project-scope: ok');
for (const [label, sourceLabel, category, nearbyText] of [
 ['姓名', '姓名', '基本信息', '证件号码'],
 ['学校名称', '学校', '教育经历', '专业名称 学历'],
 ['公司名称', '公司', '工作经历', '职位名称 开始时间'],
 ['职位名称', '职位', '工作经历', '开始时间'],
 ['项目绩效', '项目成果', '项目经历', '开始时间 结束时间']
]) {
 const e = {label:sourceLabel, value:'示例', hasValue:true, category,
   subsection:category, itemId:label};
 e.aliases=api.buildProfileItemAliases({category},e);
 const f={...fields[0],label,section:category,nearbyText,groupText:'',siteAdapterId:'zhiye'};
 assert.equal(api.plan([f],[e]).candidates[0]?.sourceLabel,sourceLabel,label);
}
console.log('zhiye-explicit-labels: ok');
