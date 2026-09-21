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

const entry = (label,value,index=0,category='项目经历') => {const e={label,value,hasValue:true,category,subsection:category+' '+(index+1),itemId:label+index,valuePath:{sectionKey:category,itemIndex:index}};e.aliases=api.buildProfileItemAliases({category},e);return e;};
const field = (label,value='',section='项目经历') => ({fieldId:label+Math.random(),label,section,type:'text',siteAdapterId:'feishu-jobs',canFill:true,currentValue:value,hasCurrentValue:!!value,options:[]});
const entries=[entry('项目名称','Libra：Git 原生 Agent'),entry('项目内容','Libra正确描述'),entry('项目名称','FairyHelp 智能客服',1),entry('项目链接','https://example.com/fairy',1),entry('项目内容','客服正确描述',1)];
let fields=[field('项目名称','FairyHelp智能客服（项目）'),field('项目链接','错误链接'),field('描述','解析有误的描述')];
let result=api.plan(fields,entries);
assert.equal(result.candidates.find(c=>c.fieldLabel==='项目链接')?.value,'https://example.com/fairy');
assert.equal(result.candidates.find(c=>c.fieldLabel==='描述')?.value,'【项目内容】\n客服正确描述\n\n【项目链接】\nhttps://example.com/fairy');
assert.ok(result.candidates.every(c=>c.shouldAutoFill));
fields=[field('项目名称','Libra Git 原生 Agent'),field('项目链接')];
assert.ok(!api.plan(fields,entries).candidates.some(c=>c.fieldLabel==='项目链接'));
assert.equal(api.plan([field('项目名称','未知项目'),field('描述')],entries).candidates.length,0);
const duplicates=[...entries,entry('项目名称','FairyHelp智能客服',2),entry('项目内容','重复项',2)];
assert.equal(api.plan([field('项目名称','FairyHelp智能客服'),field('描述')],duplicates).candidates.length,0);
const awards=[entry('奖惩名称','测试奖',0,'奖惩情况'),entry('奖惩时间','2026-06',0,'奖惩情况'),entry('奖惩描述','获奖说明',0,'奖惩情况')];
result=api.plan([field('获奖名称','','奖惩情况'),field('YYYY','','奖惩情况'),field('描述','','奖惩情况')],awards);
assert.deepEqual(Array.from(result.candidates,c=>c.value),['测试奖','2026','获奖说明']);
const social=[{...field('','',''),type:'combobox'},field('URL / ID','','自我描述')];
result=api.plan(social,[entry('GitHub','https://github.com/example-user',0,'其他信息')]);
assert.equal(result.candidates.find(c=>c.fieldId===social[0].fieldId)?.value,'GitHub');
assert.equal(result.candidates.find(c=>c.fieldId===social[1].fieldId)?.value,'https://github.com/example-user');
console.log('feishu-records-smoke: ok');

// Empty Feishu cards use profile order, including a prefix of a longer profile.
const fullEntries = Array.from({length: 5}, (_, i) => [
  entry('项目名称', `项目${i}`, i), entry('职位', `职位${i}`, i),
  entry('项目内容', `描述${i}`, i),
  ...(i === 0 ? [] : [entry('项目链接', `https://example.com/${i}`, i)])
]).flat();
const blankCards = Array.from({length: 4}, () => ['项目名称','项目角色','项目链接','描述'].map(l=>field(l))).flat();
result = api.plan(blankCards, fullEntries);
assert.equal(result.candidates.length, 15);
for (const c of result.candidates) {
  const index = Math.floor(blankCards.findIndex(f=>f.fieldId === c.fieldId) / 4);
  assert.equal(c.sourceSubsection, `项目经历 ${index + 1}`);
  assert.equal(c.shouldAutoFill, true);
}
assert.ok(!result.candidates.some(c=>c.fieldId===blankCards[2].fieldId));
// A partial import must not use the blank-form positional fallback.
const partial = [field('项目名称'),field('描述','导入的描述')];
assert.equal(api.plan(partial, fullEntries).candidates.length,0);
// Extra page cards must not recycle another record.
assert.equal(api.plan(blankCards, fullEntries.filter(e=>e.valuePath.itemIndex===0)).candidates.length,3);
console.log('feishu-empty-projects: ok');
const narrativeEntries = [...entries,entry('本人职责','负责检索'),entry('项目成果','完成验证'),entry('项目描述','汇总全文')];
const oneBox = [field('项目名称','Libra Git 原生 Agent'),field('描述')];
assert.equal(api.plan(oneBox,narrativeEntries).candidates.find(c=>c.fieldLabel==='描述')?.value,'汇总全文');
assert.equal(api.plan(oneBox,narrativeEntries.filter(e=>e.label!=='项目描述')).candidates.find(c=>c.fieldLabel==='描述')?.value,'【项目内容】\nLibra正确描述\n\n【本人职责】\n负责检索\n\n【项目成果】\n完成验证');
const splitBoxes = [field('项目名称','Libra Git 原生 Agent'),field('项目内容'),field('本人职责'),field('项目成果')];
result=api.plan(splitBoxes,narrativeEntries);
for(const [label,value] of [['项目内容','Libra正确描述'],['本人职责','负责检索'],['项目成果','完成验证']]) assert.equal(result.candidates.find(c=>c.fieldLabel===label)?.value,value);
console.log('feishu-description-layout: ok');
const workPlan=api.plan([field('工作职责','','工作经历')],[entry('工作内容','实际工作内容',0,'工作经历'),entry('本人职责','不能误选',0,'项目经历')]);
assert.equal(workPlan.candidates[0]?.value,'实际工作内容');
assert.equal(workPlan.candidates[0]?.shouldAutoFill,true);
const formatted=api.plan(oneBox,[...narrativeEntries.filter(e=>e.label!=='项目描述'),entry('项目描述','【项目内容】内容【本人职责】职责'),entry('项目链接','https://example.com/libra')]).candidates.find(c=>c.fieldLabel==='描述')?.value;
assert.equal(formatted,'【项目内容】\n内容\n\n【本人职责】\n职责\n\n【项目链接】\nhttps://example.com/libra');
console.log('work-duties-and-project-format: ok');
