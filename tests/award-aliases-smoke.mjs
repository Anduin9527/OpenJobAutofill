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
  globalThis.api = { getSemanticBucket, normalizeMokaSectionTitle, buildProfileItemAliases,
    plan(fields, entries) {
      getCurrentProfileEntries = () => entries;
      return buildAutofillPlan({ fields });
    }
  };
})();`), context);
const { api } = context;
assert.equal(api.normalizeMokaSectionTitle('获奖情况'), '奖惩情况');
for (const [label, bucket] of [['奖项', 'awardName'], ['获奖级别', 'awardLevel'], ['获奖时间', 'awardDate']]) {
  assert.equal(api.getSemanticBucket(label, '奖惩情况'), bucket);
}
const entries = [['奖惩名称', '示例竞赛奖'], ['奖惩层级', '国家级'], ['奖惩时间', '2026-06']]
  .map(([label, value], index) => ({ label, value, hasValue: true, category: '奖惩情况',
    subsection: '奖项 1', itemId: `entry-${index}`, valuePath: { sectionKey: 'awards', itemIndex: 0 } }));
const fields = ['奖项', '获奖级别', '获奖时间'].map((label, index) => ({
  fieldId: `field-${index}`, label, section: '获奖情况', type: index === 1 ? 'combobox' : 'text',
  canFill: true, currentValue: '', hasCurrentValue: false, options: []
}));
for (const entry of entries) entry.aliases = api.buildProfileItemAliases({ category: entry.category }, entry);
const plan = api.plan(fields, entries);
for (let index = 0; index < 3; index++) {
  assert.equal(plan.candidates.find(c => c.fieldId === `field-${index}`)?.sourceLabel, entries[index].label);
}
assert.equal(api.plan(fields, entries.filter(e => e.label !== '奖惩层级')).candidates.some(c => c.fieldId === 'field-1'), false,
  'missing award level must not consume the award name or date');
console.log('award-aliases-smoke: ok');
