import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Moka renders one repeated record as a single repeat item: the shared
// 起止时间 label expands into four year/month selectors that sit next to the
// record's 项目名称/职责/项目描述.  These tests pin the record boundary so the
// dates and the text fields of one card always resolve to the same profile
// record, and so explicit record labels keep their own meaning.
const source = fs.readFileSync(new URL('../src/form-runtime.js', import.meta.url), 'utf8') + '\n' + fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const context = {
  window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null }, location: { hostname: 'example.test' },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {}
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.api = { buildAutofillPlan, getProjectOverwriteGroups, assignProjectOverwrite,
    getFieldSemanticBucket, getSemanticBucket, getMokaExplicitCandidateScore, isProjectRoleLabel,
    buildChoiceMatchTargets, buildProfileItemAliases,
    plan(fields, entries) { getCurrentProfileEntries = () => entries; return buildAutofillPlan({ fields }); } };
})();`), context);
const { api } = context;

const entry = (label, value, index, category = '项目经历') => {
  const e = { label, value, hasValue: true, category, subsection: `${category} ${index + 1}`,
    itemId: `${category}-${index}-${label}`, valuePath: { sectionKey: category, itemIndex: index } };
  e.aliases = api.buildProfileItemAliases({ category }, e);
  return e;
};
const field = (label, index, extra = {}) => ({
  fieldId: `moka-${index}-${label}`, label, section: '项目经历', type: label === '项目描述' ? 'textarea' : 'text',
  siteAdapterId: 'moka', canFill: true, currentValue: '', hasCurrentValue: false, options: [],
  nearbyText: '', groupText: '', repeatItemIndex: index + 1, repeatItemTotal: 4, ...extra
});

// Records 1, 2, 3 and 8 carry values, mirroring a profile whose later records
// are still blank.
const records = [0, 1, 2, 7];
const entries = [entry('奖惩名称', '国家奖学金', 0, '奖惩情况'), entry('姓名', '张三', 0, '基本信息')];
for (const index of records) {
  for (const [label, value] of [['项目名称', `项目${index + 1}`], ['职位', '核心开发'], ['本人职责', '负责内核'],
    ['开始时间', '2024-01'], ['结束时间', '2024-08'], ['项目内容', '内容'], ['项目描述', '描述']]) {
    entries.push(entry(label, value, index));
  }
}

const labels = ['开始时间年', '开始时间月', '结束时间年', '结束时间月', '项目名称', '职责', '项目描述'];
const fields = [];
for (const index of records.map((_, position) => position)) fields.push(...labels.map((label) => field(label, index)));
// The fourth card must resolve against record 8, not record 4.
fields.forEach((f, position) => { if (position >= 21) f.repeatItemIndex = 4; });

const groups = api.getProjectOverwriteGroups({ fields });
assert.equal(groups.length, 4, 'one overwrite card per repeated record');
for (const [position, group] of groups.entries()) {
  assert.equal(group.fields.length, labels.length, `record ${position + 1} keeps its dates and text fields together`);
}
const identities = entries.filter((e) => e.label === '项目名称');
groups.forEach((group, position) => api.assignProjectOverwrite(group, identities[position]));

const plan = api.plan(fields, entries);
for (const [position, subsection] of ['项目经历 1', '项目经历 2', '项目经历 3', '项目经历 8'].entries()) {
  for (const label of labels) {
    const candidate = plan.candidates.find((c) => c.fieldId === `moka-${position}-${label}`);
    assert.ok(candidate, `${subsection} ${label} must produce a candidate`);
    assert.equal(candidate.sourceSubsection, subsection, `${subsection} ${label} must stay in its own record`);
    assert.equal(candidate.shouldAutoFill, true, `${subsection} ${label} must auto-fill`);
  }
}
// 职责 is the page's spelling; the profile stores it as 职位/本人职责.
assert.equal(plan.candidates.find((c) => c.fieldId === 'moka-0-职责').sourceLabel, '职位');
assert.equal(plan.candidates.find((c) => c.fieldId === 'moka-2-职责').sourceLabel, '职位');
console.log('moka-record-boundaries: ok');

// A skipped card keeps every field of that record unmatched instead of letting
// its dates borrow a neighbouring record.
const skipped = api.getProjectOverwriteGroups({ fields });
api.assignProjectOverwrite(skipped[3], null);
const skippedPlan = api.plan(fields, entries);
assert.equal(skippedPlan.candidates.some((c) => c.fieldId.startsWith('moka-3-')), false,
  'a skipped record must not fall back to another record');
console.log('moka-skipped-record: ok');

// Explicit record labels resolve from their own text.  Moka copies the whole
// record into nearbyText/groupText, including a sibling 工作地点 question, so a
// date selector must not inherit a location bucket.
const recordText = '起止时间 开始时间年 开始时间月 结束时间年 结束时间月 公司名称 职位名称 工作职责 工作地点 实习地点 城市';
for (const [label, bucket] of [['开始时间年', 'startDate'], ['开始时间月', 'startDate'],
  ['结束时间年', 'endDate'], ['结束时间月', 'endDate'], ['公司名称', 'employer'], ['职位名称', 'role'],
  ['工作职责', 'description'], ['项目名称', 'projectName'], ['开始时间', 'startDate'], ['结束时间', 'endDate']]) {
  const f = field(label, 0, { nearbyText: recordText, groupText: recordText, section: '实习经历' });
  const resolved = api.getFieldSemanticBucket(f, label, label.includes('项目') ? '项目经历' : '工作经历');
  assert.equal(resolved, bucket, `${label} must resolve to ${bucket || 'no explicit bucket'}`);
}
assert.equal(api.getFieldSemanticBucket(field('学校名称', 0), '学校名称', '教育经历'), 'school');
assert.equal(api.getFieldSemanticBucket(field('专业名称', 0), '专业名称', '教育经历'), 'major');
assert.equal(api.getFieldSemanticBucket(field('学历', 0), '学历', '教育经历'), 'educationLevel');
console.log('moka-explicit-label-buckets: ok');

// Employer-named summary fields must read the matching fact from the highest
// degree record, never the 最高学历 value that shares their prefix.
const education = [entry('学校', '示例大学', 0, '教育经历'), entry('专业', '计算机', 0, '教育经历'),
  entry('学历', '本科', 0, '教育经历'), entry('培养方式', '全日制', 0, '教育经历'),
  entry('最高学历', '本科', 0, '基本信息')];
for (const [label, sourceLabel] of [['最高学历毕业院校', '学校'], ['最高学历培养方式', '培养方式'],
  ['最高学历专业', '专业'], ['最高在读学历', '学历']]) {
  const f = field(label, 0, { section: '基本信息', repeatItemIndex: 0, repeatItemTotal: 0 });
  const candidate = api.plan([f], education).candidates.find((c) => c.fieldId === f.fieldId);
  assert.equal(candidate?.sourceLabel, sourceLabel, `${label} must read ${sourceLabel}`);
}
const misplaced = field('最高学历培养方式', 0, { section: '基本信息', repeatItemIndex: 0, repeatItemTotal: 0 });
assert.equal(api.plan([misplaced], education.filter((e) => e.label !== '培养方式')).candidates.length, 0,
  '最高学历培养方式 must not fill from 最高学历 when no 培养方式 exists');
console.log('moka-summary-field-contracts: ok');

// Moka dropdowns spell values differently from the profile: a graduation
// control stores 2026-06 where the option reads 2026年6月.
assert.deepStrictEqual([...api.buildChoiceMatchTargets('2026-06')],
  ['2026-06', '2026年6月', '2026年06月', '2026/06', '2026.06', '2026年', '2026']);
assert.deepStrictEqual([...api.buildChoiceMatchTargets('2026年6月')],
  ['2026年6月', '2026年06月', '2026-06', '2026/06', '2026.06', '2026年', '2026']);
assert.deepStrictEqual([...api.buildChoiceMatchTargets('2026')], ['2026', '2026年']);
assert.deepStrictEqual([...api.buildChoiceMatchTargets('')], []);
console.log('moka-choice-date-spellings: ok');

// Sites whose repeat cards carry no repeat index (Feishu/SF) still split on the
// 项目名称 label, so one card's name and description share a binding.
const legacyCards = [field('项目名称', 0, { siteAdapterId: 'feishu-jobs', repeatItemIndex: null }),
  field('项目描述', 0, { siteAdapterId: 'feishu-jobs', repeatItemIndex: null }),
  field('项目名称', 1, { siteAdapterId: 'feishu-jobs', repeatItemIndex: null }),
  field('项目描述', 1, { siteAdapterId: 'feishu-jobs', repeatItemIndex: null })];
const legacyGroups = api.getProjectOverwriteGroups({ fields: legacyCards });
assert.equal(legacyGroups.length, 2, 'legacy cards still split on 项目名称');
assert.deepStrictEqual(JSON.stringify(legacyGroups.map((group) => group.fields.map((f) => f.label))),
  JSON.stringify([['项目名称', '项目描述'], ['项目名称', '项目描述']]));
console.log('legacy-project-cards: ok');

// Unknown adapters report zero, not null. Four names must still be four cards;
// ambiguous date ranges are not assigned to the previous project's identity.
const zeroCards = Array.from({length:4},(_,i)=>[
  field('起止时间',i,{siteAdapterId:'',repeatItemIndex:0}),
  field('项目名称',i,{siteAdapterId:'',repeatItemIndex:0}),
  field('项目描述',i,{siteAdapterId:'',repeatItemIndex:0})
]).flat();
const zeroGroups=api.getProjectOverwriteGroups({fields:zeroCards});
assert.equal(zeroGroups.length,4);
assert.ok(zeroGroups.every(g=>g.fields.length===2));
console.log('zero-index project boundaries: ok');
