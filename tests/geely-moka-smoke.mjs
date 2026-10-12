import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/form-runtime.js', import.meta.url), 'utf8') + '\n' +
  fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const context = { window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null }, location: { hostname: 'campus.geely.com' },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {} };
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `globalThis.api = {
  detectSiteAdapter, inferMatchSection, buildProfileItemAliases, getMokaGroupedDateLabel,
  plan(fields, entries) { getCurrentProfileEntries = () => entries; return buildAutofillPlan({ fields }); }
};})();`), context);
const { api } = context;
assert.equal(api.detectSiteAdapter()?.id, 'moka');
for (const hostname of ['app.mokahr.com', 'app135149.dingtalkoxm.com']) {
  context.location.hostname = hostname;
  assert.equal(api.detectSiteAdapter()?.id, 'moka');
}
context.location.hostname = 'unrelated.geely.com';
assert.equal(api.detectSiteAdapter(), null, '不将整个企业域名识别为 Moka');
const entry = (label, value, index = 0, category = '教育经历') => {
  const e = { label, value, hasValue: true, category, subsection: `${category} ${index + 1}`,
    itemId: `${category}-${index}-${label}`, valuePath: { sectionKey: category, itemIndex: index } };
  e.aliases = api.buildProfileItemAliases({ category }, e); return e;
};
let next = 0;
const field = (label, section = '教育经历', index = 1, type = 'combobox') => ({
  fieldId: `geely-${++next}`, label, section, siteAdapterId: 'moka', type,
  canFill: true, currentValue: '', hasCurrentValue: false, options: [],
  repeatItemIndex: index, repeatItemTotal: 2, nearbyText: '个人信息 教育背景 实习经历 开始时间 结束时间',
  groupText: '学校名称 学历 公司名称 职位名称 工作职责'
});
const profiles = [0, 1].flatMap(index => [entry('学校', `虚构大学${index}`, index),
  entry('学历', index ? '本科' : '硕士', index), entry('学习形式', index ? '非全日制' : '全日制', index),
  entry('培养方式', '统招', index), entry('开始时间', index ? '2020-09' : '2024-09', index),
  entry('结束时间', index ? '2024-06' : '2027-03', index)]);
const education = [1, 2].flatMap(index => ['开始时间年', '开始时间月', '结束时间年', '结束时间月',
  '学校名称', '学历', '是否全日制', '学历类型'].map(label => field(label, '教育经历', index)));
let plan = api.plan(education, profiles);
const candidate = f => plan.candidates.find(c => c.fieldId === f.fieldId);
assert.equal(candidate(education[0])?.value, '2024');
assert.equal(candidate(education[3])?.value, '3');
assert.equal(candidate(education[6])?.value, '是');
assert.equal(candidate(education[6])?.sourceLabel, '学习形式');
assert.equal(candidate(education[14])?.value, '否');
assert.equal(candidate(education[15])?.value, '统招');
assert.equal(api.getMokaGroupedDateLabel('开始时间', 1, 2), '开始时间月');
assert.equal(api.getMokaGroupedDateLabel('毕业时间', 0, 2), '毕业时间年');
const graduation = [field('毕业时间年', '基本信息'), field('毕业时间月', '基本信息')];
plan = api.plan(graduation, profiles);
assert.equal(candidate(graduation[0])?.value, '2027');
assert.equal(candidate(graduation[1])?.value, '3');
plan = api.plan([education[6]], [entry('培养方式', '统招')]);
assert.equal(plan.candidates.length, 0, '不从统招猜测全日制');
const internships = [0, 1].flatMap(index => [entry('公司', `虚构公司${index}`, index, '实习经历'),
  entry('职位', `岗位${index}`, index, '实习经历'), entry('工作内容', `本条职责${index}`, index, '实习经历'),
  entry('开始时间', index ? '2025-07' : '2026-07', index, '实习经历')]);
const work = [1, 2, 3].flatMap(index => ['开始时间年', '开始时间月', '公司名称', '职位名称', '工作职责']
  .map(label => ({ ...field(label, '实习经历', index, 'text'), repeatItemTotal: 3 })));
plan = api.plan(work, [...profiles, ...internships]);
assert.equal(candidate(work[0])?.value, '2026');
assert.equal(candidate(work[4])?.value, '本条职责0');
assert.equal(candidate(work[9])?.value, '本条职责1');
assert.equal(candidate(work[14]), undefined, '多出来的第三条实习没有资料时保留待处理');
const campus = [field('开始时间年', '校园经历'), field('校内任职职务', '校园经历', 1, 'text')];
plan = api.plan(campus, internships);
assert.equal(api.inferMatchSection(campus[0]), '校园经历');
assert.equal(plan.candidates.length, 0, '校园经历不借用实习资料');
const language = [field('掌握程度', '语言能力'), field('语言资格类证书', '语言能力', 1, 'text')];
plan = api.plan(language, [entry('掌握程度', '熟练', 0, '计算机技能'),
  entry('证书名称（技能名称）', 'CET-6', 0, '外语能力')]);
assert.equal(candidate(language[0]), undefined);
assert.equal(candidate(language[1])?.value, 'CET-6');
const certificates = [field('证书名称', '证书技能', 1, 'text'), field('证书编号', '证书技能', 1, 'text')];
plan = api.plan(certificates, [entry('证书名称（技能名称）', '虚构技能证书', 0, '证书技能'),
  entry('证书名称（技能名称）', '虚构计算机证书', 0, '计算机技能')]);
assert.equal(candidate(certificates[0])?.value, '虚构技能证书');
assert.equal(candidate(certificates[1]), undefined);
const award = field('奖项级别', '奖惩情况');
plan = api.plan([award], [entry('奖励等级', '省级', 0, '奖惩情况')]);
assert.equal(candidate(award)?.value, '省级');
const country = field('国家/地区', '基本信息');
plan = api.plan([country], [entry('国籍（国家或地区）', '中国', 0, '基本信息')]);
assert.equal(candidate(country)?.value, '中国');
console.log('geely-moka-smoke: ok');
