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
  sleep = async () => {}; clickActionElement = element => element.click();
  globalThis.api = { fillElementSmart, getFieldControlAdapter, assignProjectOverwrite, getProjectOverwriteGroups, getSemanticBucket, getPairedDateRangeLabel, getMokaGroupedDateLabel, buildProfileItemAliases,
    plan(fields, entries) {
      getCurrentProfileEntries = () => entries;
      return buildAutofillPlan({ fields });
    }
  };
})();`), context);
const { api } = context;

const entry = (label,value,index=0,category='项目经历') => {const e={label,value,hasValue:true,category,subsection:category+' '+(index+1),itemId:label+index,valuePath:{sectionKey:category,itemIndex:index}};e.aliases=api.buildProfileItemAliases({category},e);return e;};
const field = (label,value='',section='项目经历') => ({fieldId:label+Math.random(),label,section,type:'text',siteAdapterId:'feishu-jobs',canFill:true,currentValue:value,hasCurrentValue:!!value,options:[]});

const projects=[entry('项目名称','演示客服'),entry('项目内容','内容甲'),entry('本人职责','职责甲'),entry('项目链接','https://example.test/project'),entry('项目名称','演示工具',1),entry('项目内容','内容乙',1)];
const cards=[field('项目名称','解析错名'),field('项目描述','旧内容'),field('项目名称','解析错名二'),field('项目描述','旧内容二')];
const groups=api.getProjectOverwriteGroups({fields:cards});
assert.equal(groups.length,2);
api.assignProjectOverwrite(groups[0],projects[4]);
api.assignProjectOverwrite(groups[1],null);
let result=api.plan(cards,projects);
assert.equal(result.candidates.length,2);
assert.equal(result.candidates.find(c=>c.fieldLabel==='项目名称').value,'演示工具');
assert.equal(result.candidates.find(c=>c.fieldLabel==='项目描述').value,'【项目内容】\n内容乙');
assert.ok(result.candidates.every(c=>c.shouldAutoFill && !c.alreadyMatches));
api.assignProjectOverwrite(groups[0],projects[0]);
result=api.plan(cards,projects);
assert.ok(result.candidates.find(c=>c.fieldLabel==='项目描述').value.includes('【本人职责】\n职责甲'));
assert.ok(result.candidates.find(c=>c.fieldLabel==='项目描述').value.endsWith('https://example.test/project'));
const edu=[entry('学校','示例大学',0,'教育经历'),entry('学历','本科',0,'教育经历'),entry('学位','学士',0,'教育经历'),entry('学习形式','全日制',0,'教育经历'),entry('是否挂科','否',0,'教育经历'),entry('班级排名','前30%',0,'教育经历'),entry('专业排名','前30%',0,'教育经历'),entry('开始时间','2020-09',0,'教育经历')];
const eduFields=['学校名称','学历','学位','学历形式','是否挂科','班级排名','专业排名','成绩(GPA)'].map(label=>({...field(label,label==='学校名称'?'示例大学':'','教育经历'),siteAdapterId:'zhiye',repeatItemIndex:1,repeatItemTotal:1,groupText:'开始时间 结束时间 学校名称 成绩 GPA',nearbyText:'开始时间 结束时间 学历'}));
result=api.plan(eduFields,edu);
for (const [label,value] of [['学历','本科'],['学位','学士'],['学历形式','全日制'],['是否挂科','否'],['班级排名','前30%'],['专业排名','前30%']]) {
 const candidate=result.candidates.find(c=>c.fieldLabel===label);
 assert.equal(candidate?.value,value,label); assert.equal(candidate.shouldAutoFill,true,label);
}
assert.ok(!result.candidates.some(c=>c.fieldLabel==='成绩(GPA)'));
console.log('Education semantics, GPA isolation, explicit project overwrite and skip passed');

context.location.hostname='fixture.zhiye.com';
let selected='是', acceptClick=true;
const option = label => ({querySelector:()=>({innerText:label}),click(){if(acceptClick)selected=label;},classList:{contains:()=>selected===label}});
const radioOptions=[option('是'),option('否')];
const group=new context.Element();
group.closest=selector=>selector==='.phoenix-radio-group'?group:null;
group.querySelector=()=>null;
group.querySelectorAll=()=>radioOptions;
assert.equal(api.getFieldControlAdapter(group)?.id,'phoenix-radio');
assert.equal((await api.fillElementSmart(group,'否',{label:'是否挂科'},{})).ok,true);
assert.equal(selected,'否');
acceptClick=false;
assert.equal((await api.fillElementSmart(group,'是',{label:'是否挂科'},{})).ok,false);
context.location.hostname='unrelated.test';
assert.notEqual(api.getFieldControlAdapter(group)?.id,'phoenix-radio');
console.log('Phoenix custom radio: domain scope, selection and rejected selection passed');
const secondEducation=[entry('学校','示例研究院',1,'教育经历'),entry('学历','硕士研究生',1,'教育经历'),entry('学位','硕士',1,'教育经历')];
const reversedFields=['学校名称','学历','学位'].map(label=>({...field(label,label==='学校名称'?'示例研究院':'','教育经历'),siteAdapterId:'zhiye',repeatItemIndex:1,repeatItemTotal:2}));
result=api.plan(reversedFields,[...edu,...secondEducation]);
assert.equal(result.candidates.find(c=>c.fieldLabel==='学位')?.value,'硕士');
assert.equal(result.candidates.find(c=>c.fieldLabel==='学历')?.value,'硕士研究生');
console.log('Education record identity survives reordered cards');
