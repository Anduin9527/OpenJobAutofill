import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/form-runtime.js', import.meta.url), 'utf8') + '\n' +
  fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const context = { window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null }, location: { hostname: 'example.test' },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {} };
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `globalThis.api = {
  buildProfileItemAliases, assignProjectOverwrite, getProjectOverwriteGroups, createAiAutofillCandidate,
  plan(fields, entries) { getCurrentProfileEntries = () => entries; return buildAutofillPlan({ fields }); }
};})();`), context);
const { api } = context;
const entry = (label, value, index = 0, category = '教育经历') => {
  const e = { label, value, hasValue: true, category, subsection: `${category} ${index + 1}`,
    itemId: `${category}-${index}-${label}`, valuePath: { sectionKey: category, itemIndex: index } };
  e.aliases = api.buildProfileItemAliases({ category }, e); return e;
};
let next = 0;
const field = (label, section = '教育经历', index = 1, total = 1, value = '', scope = 'education-records') => ({
  fieldId: `blank-record-${++next}`, label, section, siteAdapterId: 'zhiye', type: 'text',
  canFill: true, currentValue: value, hasCurrentValue: !!value, options: [],
  repeatItemIndex: index, repeatItemTotal: total, repeatItemScopeKey: scope,
  nearbyText: '学校名称 开始时间 结束时间 职位名称 工作职责', groupText: ''
});
const education = [0, 1].flatMap(index => [entry('学校', `虚构大学${index}`, index),
  entry('学历', index ? '本科' : '硕士', index), entry('专业', `虚构专业${index}`, index),
  entry('开始时间', index ? '2020-09' : '2024-09', index), entry('结束时间', index ? '2024-06' : '2027-06', index)]);
const blankEducation = ['开始时间', '结束时间', '学校名称', '专业名称', '学历'].map(label => field(label));
let plan = api.plan(blankEducation, education);
const candidate = f => plan.candidates.find(c => c.fieldId === f.fieldId);
assert.equal(candidate(blankEducation[2])?.value, '虚构大学0', '单个空白学历条目可以使用本机教育资料前缀');
assert.equal(candidate(blankEducation[4])?.value, '硕士');
assert.equal(candidate(blankEducation[0])?.value, '2024-09');
const questionnaire = field('成绩(GPA)', '教育经历', 1, 1, '', 'education-questionnaire');
plan = api.plan([...blankEducation, questionnaire], [...education, entry('成绩', '3.8')]);
assert.equal(candidate(blankEducation[4])?.value, '硕士');
assert.equal(candidate(questionnaire), undefined, '独立的教育问卷不能借用学历条目绑定');
const unrelated = ['开始时间', '学校名称', '学历'].map(label => field(label, '教育经历', 1, 1, label === '学校名称' ? '完全不同的机构' : ''));
plan = api.plan(unrelated, education);
assert.equal(plan.candidates.length, 0, '已有不匹配身份时不能按空白前缀覆盖');
const reversed = [field('学校名称', '教育经历', 1, 2, '虚构大学1'), field('学历', '教育经历', 1, 2),
  field('学校名称', '教育经历', 2, 2, '虚构大学0'), field('学历', '教育经历', 2, 2)];
plan = api.plan(reversed, education);
assert.equal(candidate(reversed[1])?.value, '本科');
assert.equal(candidate(reversed[3])?.value, '硕士');
const internships = [0, 1].flatMap(index => [entry('公司', `虚构公司${index}`, index, '实习经历'),
  entry('职位', `实习岗位${index}`, index, '实习经历'), entry('工作内容', `真实工作说明${index}`, index, '实习经历'),
  entry('开始时间', index ? '2025-07' : '2026-07', index, '实习经历'),
  ...(index ? [entry('结束时间', '2025-09', index, '实习经历')] : [])]);
const blankWork = ['公司名称（如没有则填写“无”）', '开始时间', '结束时间', '职位名称', '工作职责']
  .map(label => field(label, '工作经历', 1, 1, '', 'work-records'));
plan = api.plan(blankWork, internships);
assert.equal(candidate(blankWork[0])?.value, '虚构公司0');
assert.equal(candidate(blankWork[3])?.value, '实习岗位0');
assert.equal(candidate(blankWork[4])?.value, '真实工作说明0');
assert.equal(candidate(blankWork[4])?.sourceCategory, '实习经历');
assert.equal(candidate(blankWork[2]), undefined, '缺失结束时间不能借另一条实习');
const populatedWork = blankWork.map(f => ({ ...f, fieldId: `${f.fieldId}-populated`,
  currentValue: f.label.startsWith('公司名称') ? '虚构公司1' : '', hasCurrentValue: f.label.startsWith('公司名称') }));
plan = api.plan(populatedWork, internships);
assert.equal(candidate(populatedWork[4])?.value, '真实工作说明1');
const formal = [entry('公司', '虚构正式单位', 0, '工作经历'), entry('职位', '正式岗位', 0, '工作经历'),
  entry('工作内容', '正式工作说明', 0, '工作经历')];
plan = api.plan(blankWork, [...internships, ...formal]);
assert.equal(candidate(blankWork[0])?.value, '虚构正式单位', '存在正式工作资料时空白工作栏优先使用正式工作');
plan = api.plan(populatedWork, [...internships, ...formal]);
assert.equal(candidate(populatedWork[4])?.value, '真实工作说明1', '非空公司身份仍可准确匹配实习资料');
const projects = [0, 7].flatMap(index => [entry('项目名称', `虚构项目${index}`, index, '项目经历'),
  entry('本人职责', `具体职责长文${index}`, index, '项目经历'), entry('职位', `职位短名称${index}`, index, '项目经历'),
  entry('项目描述', `项目全文${index}`, index, '项目经历')]);
const projectFields = [field('项目名称', '项目经历', 1, 1, '旧解析名称', 'project-records'),
  field('职务', '项目经历', 1, 1, '旧职责长文', 'project-records'), field('本人职责', '项目经历', 1, 1, '', 'project-records')];
const group = api.getProjectOverwriteGroups({ fields: projectFields })[0];
api.assignProjectOverwrite(group, projects[4]);
plan = api.plan(projectFields, projects);
assert.equal(candidate(projectFields[1])?.sourceLabel, '职位');
assert.equal(candidate(projectFields[1])?.value, '职位短名称7');
assert.equal(candidate(projectFields[2])?.value, '具体职责长文7');
assert.equal(candidate(projectFields[1])?.shouldAutoFill, true);
const badAi = api.createAiAutofillCandidate({ fieldId: projectFields[1].fieldId, sourcePath: projects[5].itemId, confidence:1 }, { fields: projectFields }, [projects[5]]);
assert.equal(badAi, null, 'AI 不能把本人职责写进职务');
const goodAi = api.createAiAutofillCandidate({ fieldId: projectFields[1].fieldId, sourcePath: projects[6].itemId, confidence:1 }, { fields: projectFields }, [projects[6]]);
assert.equal(goodAi?.value, '职位短名称7');
plan = api.plan(projectFields, projects.filter(e => e.label !== '职位'));
assert.equal(candidate(projectFields[1]), undefined, '没有职位资料时不回退到本人职责');
api.assignProjectOverwrite(group, null);
plan = api.plan(projectFields, projects);
assert.equal(plan.candidates.length, 0, '跳过项目仍跳过全部字段');
console.log('zhiye-empty-records-smoke: ok');
