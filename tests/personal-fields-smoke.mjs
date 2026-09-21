import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const context = {
  window: {}, chrome: { runtime: { onMessage: { addListener() {} } } },
  document: { querySelector: () => null }, location: { hostname: 'luxshare-tech.zhiye.com' },
  Element: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {}
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
  globalThis.api = { buildProfileItemAliases, inferMatchSection, resolveEntryValueForField,
    getPersonalFieldKind, collectMissingProfileFields, bindHotjobRecords, projectNameSimilarity,
    plan(fields, entries) {
      getCurrentProfileEntries = () => entries;
      return buildAutofillPlan({ fields });
    }
  };
})();`), context);
const { api } = context;
assert.equal(api.inferMatchSection({ label: '姓名', nearbyText: '家庭情况 与本人关系 工作单位 职务 联系电话' }), '家庭信息');

const rawEntries = [
  ['姓名', '测试用户', '基本信息'],
  ['出生日期', '1990-01-02', '基本信息'],
  ['移动电话', '13800000000', '基本信息'],
  ['邮箱', 'test.user@example.com', '基本信息'],
  ['国籍（国家或地区）', '中国', '基本信息'],
  ['籍贯', '示例省示例市', '基本信息'],
  ['民族', '示例民族', '基本信息'],
  ['政治面貌', '示例政治面貌', '基本信息'],
  ['现居住城市', '示例省示例市', '基本信息'],
  ['现居住详细地址', '示例街道1号', '基本信息'],
  ['最高学历', '硕士', '基本信息'],
  ['身高', '180', '基本信息'],
  ['体重', '75', '基本信息'],
  ['专业', '人工智能', '教育经历'],
  ['学校类别', '普通本科', '教育经历'],
  ['证书名称（技能名称）', '英语六级证书（CET-6）', '证书技能'],
  ['爱好及专长', '独立游戏、开源项目', '其他信息'],
  ['自我评价', '喜欢把复杂问题拆成可验证的小步骤。', '自我描述'],
  ['开始时间', '2026-07', '实习经历'],
  ['职位', '软件开发实习生', '实习经历'],
  ['工作内容', '负责开源基础设施维护。', '实习经历'],
  ['开始时间', '2026-05', '项目经历'],
  ['职位', '个人项目开发者', '项目经历'],
  ['工作内容', '项目实现内容。', '项目经历'],
  ['结束时间', '2026-08', '项目经历'],
  ['项目名称', 'Libra', '项目经历']
];
const entries = rawEntries.map(([label, value, category], index) => {
  const entry = {
    label, value, category, hasValue: true, subsection: category,
    itemId: `entry-${index}`,
    valuePath: { sectionKey: category, itemIndex: category === '基本信息' ? null : 0 }
  };
  entry.aliases = api.buildProfileItemAliases({ category }, entry);
  return entry;
});

const labels = [
  '第几届应届生', '姓名', '出生日期', '手机号码', '邮箱', '国籍', '籍贯', '现居住地',
  '身高(厘米)', '体重(公斤)', '最高学历', '招聘信息来源', '面试站点',
  '院校资质（最高学历）', '最高英语证书', '英语等级', '特长爱好', '自我评价',
  '实习周期', '实习开始时间'
];
const fields = labels.map((label, index) => ({
  fieldId: `field-${index}`, label, section: '自我描述', type: label === '自我评价' ? 'textarea' : 'text',
  canFill: true, hasCurrentValue: false, currentValue: '', placeholder: '', nearbyText: '', groupText: '', options: []
}));
const plan = api.plan(fields, entries);
const candidate = (label) => plan.candidates.find((item) => item.fieldLabel === label);

assert.equal(candidate('姓名')?.sourceLabel, '姓名');
assert.equal(candidate('手机号码')?.sourceLabel, '移动电话');
assert.equal(candidate('国籍')?.sourceLabel, '国籍（国家或地区）');
assert.equal(candidate('籍贯')?.sourceLabel, '籍贯');
assert.equal(candidate('身高(厘米)')?.value, '180');
assert.equal(candidate('体重(公斤)')?.value, '75');
assert.equal(candidate('身高(厘米)')?.sourceLabel, '身高');
assert.equal(candidate('体重(公斤)')?.sourceLabel, '体重');
assert.equal(candidate('现居住地')?.value, '示例省示例市，示例街道1号');
assert.equal(api.inferMatchSection({ label: '最高学历' }), '基本信息');
assert.equal(candidate('最高学历')?.sourceLabel, '最高学历');
assert.equal(candidate('最高学历')?.sourceCategory, '基本信息');
assert.equal(candidate('院校资质（最高学历）')?.sourceLabel, '学校类别');
assert.equal(candidate('最高英语证书')?.sourceLabel, '证书名称（技能名称）');
assert.equal(candidate('英语等级')?.value, 'CET-6');
assert.equal(candidate('特长爱好')?.sourceLabel, '爱好及专长');
assert.equal(candidate('自我评价')?.sourceLabel, '自我评价');
assert.equal(candidate('实习开始时间')?.sourceLabel, '开始时间');
assert.equal(candidate('实习开始时间')?.sourceCategory, '实习经历');
for (const label of ['院校资质（最高学历）', '最高英语证书', '英语等级', '特长爱好', '自我评价', '实习开始时间']) {
  assert.equal(candidate(label)?.shouldAutoFill, true, `${label} should be auto-filled`);
}
assert.equal(plan.missingProfileFields.includes('第几届应届生'), true);
assert.equal(plan.missingProfileFields.includes('实习周期'), true);
assert.equal(plan.missingProfileFields.includes('身高(厘米)'), false);
assert.equal(plan.missingProfileFields.includes('体重(公斤)'), false);
assert.equal(plan.missingProfileFields.includes('招聘信息来源'), true);
assert.equal(api.inferMatchSection({ label: '面试站点' }), '求职意向');
assert.equal(plan.missingProfileFields.includes('面试站点'), true);
assert.equal(plan.missingProfileFields.includes('最高学历'), false);
assert.equal(plan.missingProfileFields.includes('姓名'), false);

const internshipFields = ['职位名称', '实习内容', '结束时间'].map((label, index) => ({
  fieldId: `internship-field-${index}`, label, inferredLabel: label,
  inferredCategory: '实习经历', section: '实习经历', siteAdapterId: 'zhiye', canFill: true,
  hasCurrentValue: false, currentValue: '', type: index === 1 ? 'textarea' : 'text', options: []
}));
const internshipPlan = api.plan(internshipFields, entries);
assert.equal(internshipPlan.candidates.find((item) => item.fieldLabel === '职位名称')?.sourceCategory, '实习经历');
assert.equal(internshipPlan.candidates.find((item) => item.fieldLabel === '实习内容')?.sourceCategory, '实习经历');
assert.equal(internshipPlan.candidates.some((item) => item.fieldLabel === '结束时间'), false,
  'an internship end date must not borrow a project end date');
assert.equal(api.plan([{
  fieldId: 'education-ranking', label: '专业排名', section: '教育经历', siteAdapterId: 'zhiye',
  repeatItemIndex: 1, repeatItemTotal: 1, canFill: true, hasCurrentValue: false, currentValue: '', options: []
}], entries).candidates.length, 0, '专业排名 must not borrow the 专业 value');

const zhiyeProjectFields = [
  ['项目名称', true], ['开始时间', true], ['项目描述', false]
].map(([label, hasCurrentValue], index) => ({
  fieldId: `zhiye-project-${index}`, label, inferredLabel: label,
  inferredCategory: '项目经历', siteAdapterId: 'zhiye', repeatItemIndex: 1,
  repeatItemTotal: 1, hasCurrentValue, currentValue: label === '项目名称' ? 'Libra（中科院开源之夏项目）' : '',
  canFill: true, type: 'text', options: []
}));
const zhiyeEntries = [
  { label: '项目名称', value: 'Libra', category: '项目经历', hasValue: true,
    itemId: 'project-name', valuePath: { sectionKey: 'project', itemIndex: 1 } },
  { label: '开始时间', value: '2026-03', category: '项目经历', hasValue: true,
    itemId: 'project-start', valuePath: { sectionKey: 'project', itemIndex: 1 } },
  { label: '项目描述', value: '项目内容', category: '项目经历', hasValue: true,
    itemId: 'project-description', valuePath: { sectionKey: 'project', itemIndex: 1 } }
];
for (const entry of zhiyeEntries) entry.aliases = api.buildProfileItemAliases({ category: entry.category }, entry);
api.bindHotjobRecords(zhiyeProjectFields, zhiyeEntries);
assert.equal(zhiyeProjectFields[0].hotjobProfileIndex, 1);
assert.equal(api.projectNameSimilarity('Libra（中科院开源之夏项目）', 'Libra') >= 0.9, true);
console.log('personal-fields-smoke: ok');

const phone = fields.find(f => f.label === '手机号码');
const extraDigit = api.plan([{...phone, currentValue: '113800000000', hasCurrentValue: true}], entries);
assert.equal(extraDigit.candidates[0].alreadyMatches, false, 'extra digit must not match');
const formattedPhone = api.plan([{...phone, currentValue: '138 0000 0000', hasCurrentValue: true}], entries);
assert.equal(formattedPhone.candidates[0].alreadyMatches, true);
