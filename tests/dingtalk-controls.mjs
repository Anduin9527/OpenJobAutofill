const fixture=document.querySelector('#fixture'),results=document.querySelector('#results');
const eq=(a,b,message='')=>{if(a!==b)throw Error(`${message}: expected ${b}, got ${a}`);};
let passed=0,failed=0;
window.fixtureLocation={hostname:'app135149.dingtalkoxm.com',href:location.href};
window.fixtureChrome={runtime:{onMessage:{addListener(){},removeListener(){}},getURL:p=>'/'+p,sendMessage:(m,cb)=>cb({ok:true,data:{}})},storage:{onChanged:{addListener(){},removeListener(){}}}};
const source=await(await fetch('/src/content.js')).text();
const script=document.createElement('script');
script.textContent=source.replace('(() => {','(() => { const chrome=window.fixtureChrome; const location=window.fixtureLocation;').replace(/\}\)\(\);\s*$/,`window.api={applyAutofillPlan,fillElementSmart,buildFieldMeta,scanForm,inferFieldLabel,inferMatchSection,getProjectOverwriteGroups,assignProjectOverwrite,buildProfileItemAliases,reset:()=>{currentSiteAdapter=null;}, plan:(scan,entries)=>{getCurrentProfileEntries=()=>entries;return buildAutofillPlan(scan);}};})();`);
document.head.append(script);const api=window.api;
const test=async(name,run)=>{fixture.replaceChildren();api.reset();const li=document.createElement('li');results.append(li);
  try{await run();eq(window.__OJAF_FORM_RUNTIME__.stats().activeWaits,0);eq(window.__OJAF_FORM_RUNTIME__.stats().observers,0);passed++;li.className='pass';li.textContent='✓ '+name;}
  catch(e){failed++;li.className='fail';li.textContent='✗ '+name+' '+e.message;console.error(e);}
  document.querySelector('#summary').textContent=`${passed} 通过，${failed} 失败`;
};
const textField=label=>`<div class="apply-field-fixture string_info-fixture"><div class="title-fixture"><span>${label}</span></div><input placeholder="${label}"></div>`;
const dropdown=(placeholder='请选择')=>`<div class="sd-Dropdown-container-fixture"><label class="sd-Select-container-fixture"><span class="sd-Input-display-value-fixture"></span><input placeholder="${placeholder}"><span class="sd-Select-addon-fixture">⌄</span></label><span></span></div>`;
const dates=label=>`<div class="apply-field-fixture date_info-fixture"><div class="title-fixture"><span>${label}</span></div>${(['获奖时间','开始时间','结束时间','毕业时间'].includes(label)?['年','月']:['年','月','年','月']).map(dropdown).join('')}</div>`;
function block(title,count,fields){const node=document.createElement('section');node.className='apply-block-fixture';node.innerHTML=`<div class="blockTitle-fixture">${title}添加</div>`+Array.from({length:count},()=>`<div class="apply-fields-fixture multi-fixture">${fields}</div>`).join('');fixture.append(node);return node;}
const entry=(label,value,index,category)=>{const e={label,value,hasValue:true,category,subsection:`${category} ${index+1}`,itemId:`${category}-${index}-${label}`,valuePath:{sectionKey:category,itemIndex:index}};e.aliases=api.buildProfileItemAliases({category},e);return e;};
await test('钉钉招聘域名启用 Moka 栏目适配',async()=>{block('项目经验',1,textField('项目名称'));const scan=await api.scanForm();eq(scan.fields[0].siteAdapterId,'moka');eq(scan.fields[0].section,'项目经历');});
await test('四条项目有四个分组，年月与名称保持同一经历',async()=>{block('项目经验',4,dates('起止时间')+textField('项目名称')+textField('职责')+textField('项目描述')+textField('项目中职责'));const scan=await api.scanForm();const groups=api.getProjectOverwriteGroups(scan);eq(groups.length,4);groups.forEach((g,i)=>{eq(g.fields.length,8);eq(g.fields[0].repeatItemIndex,i+1);eq(g.fields[0].repeatItemTotal,4);eq(api.inferFieldLabel(g.fields[0]),'开始时间年');eq(api.inferFieldLabel(g.fields[3]),'结束时间月');});
  const entries=[0,1,2,7].flatMap(i=>[entry('项目名称',`虚构项目${i}`,i,'项目经历'),entry('本人职责',`职责${i}`,i,'项目经历'),entry('开始时间','2024-01',i,'项目经历'),entry('结束时间','2024-08',i,'项目经历'),entry('项目内容',`内容${i}`,i,'项目经历')]);
  groups.forEach((g,i)=>api.assignProjectOverwrite(g,entries.find(e=>e.label==='项目名称'&&e.valuePath.itemIndex===[0,1,2,7][i])));
  const plan=api.plan(scan,entries);const names=plan.candidates.filter(c=>c.fieldLabel==='项目名称');eq(names.length,4);eq(new Set(names.map(c=>c.value)).size,4);eq(names[3].value,'虚构项目7');
});
await test('Moka 四条项目后的五条所获荣誉不计入项目对应关系',async()=>{
  window.fixtureLocation.hostname='app.mokahr.com';
  try {
    block('项目经验',4,dates('起止时间')+textField('项目名称')+textField('职责')+textField('项目描述')+textField('项目中职责'));
    block('所获荣誉',5,textField('所获荣誉')+dates('获奖时间'));
    const scan=await api.scanForm();
    const groups=api.getProjectOverwriteGroups(scan);
    eq(groups.length,4,'项目对应关系只包含四条项目');
    groups.forEach((group,i)=>{eq(group.fields.length,8);eq(group.repeatIndex,i+1);});
    const awards=scan.fields.filter(field=>field.section==='奖惩情况');
    eq(awards.length,15,'五条荣誉各含名称、年份、月份');
    eq(awards.every(field=>api.inferMatchSection(field)==='奖惩情况'),true);
    const entries=Array.from({length:5},(_,i)=>[entry('奖惩名称',`虚构荣誉${i+1}`,i,'奖惩情况'),entry('奖惩时间','2024-05',i,'奖惩情况')]).flat();
    const plan=api.plan(scan,entries);
    const names=plan.candidates.filter(candidate=>candidate.fieldLabel==='所获荣誉');
    eq(names.length,5);eq(new Set(names.map(candidate=>candidate.value)).size,5);
    eq(names.every(candidate=>candidate.sourceLabel==='奖惩名称'&&candidate.shouldAutoFill),true);
  } finally { window.fixtureLocation.hostname='app135149.dingtalkoxm.com'; }
});
await test('Moka 自定义栏目只读取本栏标题，不借用前面的项目栏目',async()=>{
  block('项目经验',1,textField('项目名称')+textField('项目描述'));
  block('补充材料',1,textField('补充说明')+textField('说明链接'));
  const scan=await api.scanForm();
  const custom=scan.fields.filter(field=>field.label==='补充说明'||field.label==='说明链接');
  eq(custom.length,2);eq(custom.every(field=>field.section==='补充材料'),true);
  eq(api.getProjectOverwriteGroups(scan).length,1);
});
await test('自我描述之后的五条获奖经历保持独立栏目和顺序',async()=>{block('自我描述',1,textField('自我描述'));block('获奖经历',5,dates('获奖时间')+textField('奖项名称'));const scan=await api.scanForm();const awards=scan.fields.filter(f=>f.section==='奖惩情况');eq(awards.length,15);eq(awards[0].label,'奖惩时间年');eq(awards[1].label,'奖惩时间月');eq(awards[14].repeatItemIndex,5);
  const entries=Array.from({length:5},(_,i)=>[entry('奖惩名称',`虚构奖项${i+1}`,i,'奖惩情况'),entry('奖惩时间','2024-05',i,'奖惩情况')]).flat();const plan=api.plan(scan,entries);const names=plan.candidates.filter(c=>c.fieldLabel==='奖项名称');eq(names.length,5);eq(new Set(names.map(c=>c.value)).size,5);eq(names.every(c=>c.shouldAutoFill),true);
});
await test('string_info 的手机号区号和最近专业仍识别为下拉',async()=>{block('个人信息',1,`<div class="apply-field-fixture string_info-fixture"><div class="title-fixture"><span>手机号码</span></div>${dropdown()}<input placeholder="请输入手机号"></div><div class="apply-field-fixture string_info-fixture"><div class="title-fixture"><span>最近毕业专业</span></div>${dropdown()}</div>`);const scan=await api.scanForm();eq(scan.fields.length,3);eq(scan.fields[0].label,'手机区号');eq(scan.fields[0].controlAdapterId,'moka-sd-select');eq(scan.fields[2].controlAdapterId,'moka-sd-select');});
await test('下拉只响应子输入框点击，异步弹层仍能完成选择',async()=>{
  block('个人信息',1,`<div class="apply-field-fixture Select-fixture"><div class="title-fixture"><span>最高学历</span></div>${dropdown()}</div>`);
  const root=fixture.querySelector('[class*="sd-Dropdown-container-"]'),input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
  const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;popup.style.cssText='position:fixed;top:50px;left:20px;background:white;padding:12px';document.body.append(popup);
  let opened=0;input.onclick=()=>{opened++;setTimeout(()=>{popup.hidden=false;popup.innerHTML='<div class="sd-Select-menu-fixture"><div class="sd-Select-scrollable-fixture">'+['本科','硕士','博士'].map(label=>`<div class="sd-Select-common-item-fixture"><div class="sd-Menu-container-fixture"><div class="sd-Menu-content-item-fixture"><span>${label}</span></div></div></div>`).join('')+'</div></div>';popup.querySelectorAll('[class*="sd-Select-common-item-"]').forEach(row=>row.onclick=()=>{input.value='';display.textContent=row.textContent;popup.hidden=true;});},450);};
  input.onkeydown=e=>{if(e.key==='Escape')popup.hidden=true;};
  try{eq((await api.fillElementSmart(root,'本科',api.buildFieldMeta(root),{writeMode:'choice'})).ok,true);eq(display.textContent,'本科');eq(opened,1);}finally{popup.remove();}
});
await test('字段内嵌菜单点击实际内容，且不干扰已打开的相邻菜单',async()=>{
  block('个人信息',1,['最高学历','学历'].map(label=>`<div class="apply-field-fixture Select-fixture"><div class="title-fixture"><span>${label}</span></div>${dropdown()}</div>`).join(''));
  const roots=[...fixture.querySelectorAll('[class*="sd-Dropdown-container-"]')];
  const widgets=roots.map(root=>{
    const input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
    const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;
    popup.innerHTML='<div class="sd-Select-menu-fixture"><div class="sd-Select-scrollable-fixture">'+['本科','硕士','博士'].map(label=>`<div class="sd-Select-common-item-fixture"><div class="sd-Menu-container-fixture"><div class="sd-Menu-content-item-fixture">${label}</div></div></div>`).join('')+'</div></div>';
    root.lastElementChild.append(popup);input.onclick=()=>{popup.hidden=false;};
    for(const row of popup.querySelectorAll('[class*="sd-Select-common-item-"]'))row.onclick=e=>{if(!e.target.closest('[class*="sd-Menu-content-item-"]'))return;display.textContent=row.textContent;popup.hidden=true;};
    return {popup,display};
  });
  widgets[0].popup.hidden=false;
  eq((await api.fillElementSmart(roots[1],'硕士',api.buildFieldMeta(roots[1]),{writeMode:'choice'})).ok,true);
  eq(widgets[1].display.textContent,'硕士');eq(widgets[0].display.textContent,'');eq(widgets[0].popup.hidden,false);
});
await test('连续填写两个下拉后，第一个正式值仍保持；搜索字不算选中',async()=>{
  block('个人信息',1,['最高学历','学历'].map(label=>`<div class="apply-field-fixture Select-fixture"><div class="title-fixture"><span>${label}</span></div>${dropdown()}</div>`).join(''));
  const roots=[...fixture.querySelectorAll('[class*="sd-Dropdown-container-"]')];
  for(const root of roots){
    const input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
    let committed='';
    const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;
    popup.innerHTML='<div class="sd-Select-menu-fixture">'+['本科','硕士'].map(label=>`<div class="sd-Select-common-item-fixture"><div class="sd-Menu-container-fixture"><div class="sd-Menu-content-item-fixture">${label}</div></div></div>`).join('')+'</div>';
    root.lastElementChild.append(popup);input.onclick=()=>{popup.hidden=false;};
    input.onblur=()=>{input.value='';display.textContent=committed;popup.hidden=true;};
    for(const item of popup.querySelectorAll('[class*="sd-Menu-content-item-"]'))item.onclick=()=>{committed=item.textContent;display.textContent=committed;popup.hidden=true;};
    input.value='搜索文字';eq(api.buildFieldMeta(root).currentValue,'');input.value='';
  }
  eq((await api.fillElementSmart(roots[0],'本科',api.buildFieldMeta(roots[0]),{writeMode:'choice'})).ok,true);
  eq((await api.fillElementSmart(roots[1],'硕士',api.buildFieldMeta(roots[1]),{writeMode:'choice'})).ok,true);
  roots[1].querySelector('input').blur();
  eq(api.buildFieldMeta(roots[0]).currentValue,'本科');eq(api.buildFieldMeta(roots[1]).currentValue,'硕士');
});
await test('看似显示目标但失焦撤销的选择不得报成功',async()=>{
  block('个人信息',1,`<div class="apply-field-fixture Select-fixture"><div class="title-fixture"><span>最高学历</span></div>${dropdown()}</div>`);
  const root=fixture.querySelector('[class*="sd-Dropdown-container-"]'),input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
  const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;popup.innerHTML='<div class="sd-Select-menu-fixture"><div class="sd-Select-common-item-fixture"><div class="sd-Menu-container-fixture"><div class="sd-Menu-content-item-fixture">本科</div></div></div></div>';root.lastElementChild.append(popup);
  input.onclick=()=>{popup.hidden=false;};input.onblur=()=>{input.value='';display.textContent='';popup.hidden=true;};
  popup.querySelector('[class*="sd-Select-common-item-"]').onclick=()=>{display.textContent='本科';popup.hidden=true;};
  eq((await api.fillElementSmart(root,'本科',api.buildFieldMeta(root),{writeMode:'choice'})).ok,false);
});
for (const mode of ['search', 'async']) await test(`SD ${mode}：搜索不失焦，异步提交完成后才离开控件`,async()=>{
  block('个人信息',1,`<div class="apply-field-fixture Select-fixture"><div class="title-fixture"><span>最高学历</span></div>${dropdown()}</div>`);
  const root=fixture.querySelector('[class*="sd-Dropdown-container-"]'),input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
  const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;root.lastElementChild.append(popup);
  let committed='',pending,searchBlurs=0;
  const render=()=>{popup.innerHTML='<div class="sd-Select-menu-fixture"><div class="sd-Select-common-item-fixture"><div class="sd-Menu-content-item-fixture">本科</div></div></div>';popup.querySelector('[class*="sd-Menu-content-item-"]').onclick=()=>{pending=setTimeout(()=>{committed='本科';display.textContent=committed;popup.hidden=true;},60);};};
  input.onclick=()=>{popup.hidden=false;if(mode==='async')render();};
  input.oninput=render;
  input.onblur=()=>{if(!committed)searchBlurs++;clearTimeout(pending);input.value='';display.textContent=committed;popup.hidden=true;};
  eq((await api.fillElementSmart(root,'本科',api.buildFieldMeta(root),{writeMode:'choice'})).ok,true);
  eq(searchBlurs,0);eq(display.textContent,'本科');input.focus();input.blur();eq(display.textContent,'本科');
});
await test('后一个下拉引起前一个回退时，批量结果不能仍然报成功',async()=>{
  block('个人信息',1,['最高学历','学历'].map(label=>`<div class="apply-field-fixture Select-fixture"><div class="title-fixture"><span>${label}</span></div>${dropdown()}</div>`).join(''));
  const roots=[...fixture.querySelectorAll('[class*="sd-Dropdown-container-"]')];
  roots.forEach((root,index)=>{
    const input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
    const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;
    popup.innerHTML='<div class="sd-Select-menu-fixture"><div class="sd-Select-common-item-fixture"><div class="sd-Menu-content-item-fixture">本科</div></div></div>';root.lastElementChild.append(popup);
    input.onclick=()=>{popup.hidden=false;if(index)roots[0].querySelector('[class*="sd-Input-display-value-"]').textContent='';};
    popup.querySelector('[class*="sd-Menu-content-item-"]').onclick=()=>{display.textContent='本科';popup.hidden=true;};
  });
  const scan=await api.scanForm();
  const candidates=scan.fields.map((field,i)=>({id:`retention-${i}`,field,fieldLabel:field.label,value:'本科',writeMode:'choice'}));
  const result=await api.applyAutofillPlan({scan,candidates},candidates.map(c=>c.id));
  eq(result.results[0].ok,false);eq(result.results[1].ok,true);eq(result.filled,1);eq(result.failed,1);
  eq(result.results[1].controlTrace.at(-1).phase,'cleanup');
});
for(const [label,target,searchOnly] of [['开始时间年','2020',false],['开始时间月','1',false],['专业名称','计算机科学与技术',true],['学校名称','清华大学',true]]) await test(`SD ${searchOnly?'输入后加载菜单':'无 common-item 包装'}：${label}`,async()=>{
  block('教育背景',1,`<div class="apply-field-fixture Select-fixture"><div class="title-fixture"><span>${label}</span></div>${dropdown()}</div>`);
  const root=fixture.querySelector('[class*="sd-Dropdown-container-"]'),input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
  const show=()=>{if(root.querySelector('[class*="sd-Dropdown-dropdown-"]'))return;const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';
    popup.innerHTML='<div class="sd-Select-menu-fixture"><div class="sd-Select-scrollable-fixture"><div class="sd-Menu-container-fixture"><div class="sd-Menu-content-fixture"><div class="sd-Menu-content-item-fixture"><span data-key="sugar.select.label">'+target+'</span></div></div></div></div></div>';
    if(searchOnly){const row=popup.querySelector('[class*="sd-Menu-container-"]');const wrapper=document.createElement('div');wrapper.className='sd-Select-common-item-fixture';row.replaceWith(wrapper);wrapper.append(row);}
    root.lastElementChild.append(popup);popup.querySelector('[class*="sd-Menu-content-item-"]').onclick=()=>{display.textContent=target;input.value='';popup.remove();};};
  if(searchOnly) input.oninput=()=>{if(input.value===target)setTimeout(show,50);}; else input.onclick=show;
  const result=await api.fillElementSmart(root,target,api.buildFieldMeta(root),{writeMode:'choice'});
  eq(result.ok,true);eq(display.textContent,target);eq(result.controlTrace.some(t=>t.phase==='clicked'),true);
});
await test('吉利独立域名按自己的栏目与条目识别年月，校园经历不串到实习',async()=>{
  window.fixtureLocation.hostname='campus.geely.com';
  try {
    block('个人信息',1,textField('姓名'));
    block('教育背景',2,dates('就读时间')+textField('学校名称'));
    block('实习经历',3,dates('起止时间')+textField('公司名称')+textField('职位名称')+textField('工作职责'));
    block('校园经历',1,dates('开始时间')+dates('结束时间')+textField('校内任职职务'));
    block('技能证书',1,textField('证书名称'));
    block('语言能力',1,textField('语言类型'));
    block('获奖经历',5,dates('获奖时间')+textField('奖项名称'));
    const scan=await api.scanForm();
    eq(scan.siteAdapter.id,'moka');
    const education=scan.fields.filter(f=>api.inferMatchSection(f)==='教育经历');
    eq(education.length,10);eq(education[0].label,'开始时间年');eq(education[3].label,'结束时间月');eq(education[5].repeatItemIndex,2);
    const interns=scan.fields.filter(f=>api.inferMatchSection(f)==='实习经历');eq(interns.length,21);eq(interns[4].repeatItemIndex,1);eq(interns[11].repeatItemIndex,2);
    const campus=scan.fields.filter(f=>api.inferMatchSection(f)==='校园经历');eq(campus.length,5);eq(campus[0].label,'开始时间年');eq(campus[3].label,'结束时间月');
    eq(scan.fields.find(f=>f.label==='证书名称').section,'证书技能');
    const language=scan.fields.find(f=>f.section==='语言能力');eq(language.label,'语言类型');eq(api.inferMatchSection(language),'外语能力');
    const awards=scan.fields.filter(f=>api.inferMatchSection(f)==='奖惩情况');eq(awards.length,15);eq(awards[13].label,'奖惩时间月');eq(awards[13].repeatItemIndex,5);
  } finally { window.fixtureLocation.hostname='app135149.dingtalkoxm.com'; }
});
await test('SD 是否全日制从学习形式转换为本条的是/否',async()=>{
  block('教育背景',2,textField('学校名称')+`<div class="apply-field-fixture bool_info-fixture"><div class="title-fixture"><span>是否全日制</span></div>${dropdown()}</div>`);
  const roots=[...fixture.querySelectorAll('[class*="sd-Dropdown-container-"]')];
  for(const root of roots){const input=root.querySelector('input'),display=root.querySelector('[class*="sd-Input-display-value-"]');
    const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;
    popup.innerHTML='<div class="sd-Select-menu-fixture">'+['是','否'].map(value=>`<div class="sd-Menu-container-fixture"><div class="sd-Menu-content-item-fixture">${value}</div></div>`).join('')+'</div>';
    root.lastElementChild.append(popup);input.onclick=()=>{popup.hidden=false;};popup.querySelectorAll('[class*="sd-Menu-content-item-"]').forEach(item=>item.onclick=()=>{display.textContent=item.textContent;popup.hidden=true;});}
  const scan=await api.scanForm(),plan=api.plan(scan,[entry('培养方式','统招',0,'教育经历'),entry('学习形式','全日制',0,'教育经历'),entry('学习形式','非全日制',1,'教育经历')]);
  eq(plan.candidates.length,2);eq(plan.candidates[0].value,'是');eq(plan.candidates[1].value,'否');
  const result=await api.applyAutofillPlan(plan,plan.candidates.map(c=>c.id));eq(result.failed,0);eq(result.filled,2);
  eq(roots[0].querySelector('[class*="sd-Input-display-value-"]').textContent,'是');eq(roots[1].querySelector('[class*="sd-Input-display-value-"]').textContent,'否');
});
await test('证件号码的文本输入只读取自己的标题，忽略旁边的身份证下拉',async()=>{
  block('个人信息',1,`<div class="apply-field-fixture string_info-fixture"><div class="title-fixture"><span>证件号码</span></div>${dropdown()}<input placeholder="证件号码"><div>身份证 必填项未填写 请选择</div></div>`);
  const input=fixture.querySelector('input[placeholder="证件号码"]'),meta=api.buildFieldMeta(input);eq(meta.controlAdapterId,'moka-text');eq(meta.label,'证件号码');
  eq((await api.fillElementSmart(input,'TEST-ID-000',meta,{writeMode:'text'})).ok,true);eq(input.value,'TEST-ID-000');
});
function dayCalendar({revert=false,disabled=false}={}) {
  block('个人信息',1,'<div class="apply-field-fixture day_info-fixture"><div class="title-fixture"><span>出生日期 (年龄)</span></div><div class="sd-Dropdown-container-fixture"><label class="sd-Input-container-fixture day_info"><input readonly placeholder="出生日期 (年龄)"></label><span></span></div></div>');
  const input=fixture.querySelector('input'),root=input.closest('[class*="sd-Dropdown-container-"]');
  const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;root.lastElementChild.append(popup);
  let year=2026,month=10,mode='date',yearRange=2020,committed='';
  const months=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const render=()=>{
    popup.innerHTML=`<div class="sd-panal-menu-wrapper-fixture"><div class="sd-panal-select-container-fixture"><span class="sd-basic-selector-prev-tool-fixture"><span class="sd-basic-selector-icon-fixture">‹</span></span><span class="sd-basic-selector-year-fixture">${mode==='year'?yearRange+' - '+(yearRange+9):year+'年'}</span>${mode==='year'?'':`<span class="sd-basic-selector-month-fixture">${months[month-1]}</span>`}<span class="sd-basic-selector-next-tool-fixture"><span class="sd-basic-selector-icon-fixture">›</span></span></div><div class="sd-panal-table-container-fixture">${mode==='year'?Array.from({length:10},(_,i)=>`<span class="sd-basic-year-item-fixture">${yearRange+i}</span>`).join(''):mode==='month'?months.map((name,i)=>`<span class="sd-basic-date-item-fixture" data-month="${i+1}">${name}</span>`).join(''):'<span class="sd-basic-date-item-fixture sd-basic-fade-fixture">15</span>'+Array.from({length:31},(_,i)=>`<span class="sd-basic-date-item-fixture ${disabled&&i===14?'sd-basic-disabled-fixture':''}">${i+1}</span>`).join('')}</div></div>`;
    popup.querySelector('[class*="sd-basic-selector-year-"]').onclick=()=>{mode='year';yearRange=Math.floor(year/10)*10;render();};
    popup.querySelector('[class*="sd-basic-selector-month-"]')?.addEventListener('click',()=>{mode='month';render();});
    for(const direction of ['prev','next'])popup.querySelector(`[class*="sd-basic-selector-${direction}-tool-"]`).onclick=()=>{yearRange+=direction==='prev'?-10:10;render();};
    popup.querySelectorAll('[class*="sd-basic-year-item-"]').forEach(cell=>cell.onclick=()=>{year=Number(cell.textContent);mode='date';render();});
    popup.querySelectorAll('[class*="sd-basic-date-item-"]').forEach(cell=>cell.onclick=()=>{
      if(/fade|disabled/.test(cell.className))throw Error('不得点击相邻月或禁用日期');
      if(mode==='month'){month=Number(cell.dataset.month);mode='date';render();}
      else {committed=`${year}-${String(month).padStart(2,'0')}-${cell.textContent.padStart(2,'0')}`;input.value=committed;popup.hidden=true;}
    });
  };
  input.onclick=()=>{input.focus();popup.hidden=false;render();};input.onblur=()=>{input.value=revert?'':committed;};input.onkeydown=e=>{if(e.key==='Escape')popup.hidden=true;};
  return {input,popup};
}
await test('SD 只读日历通过年份、月份和日期提交，跳过相邻月份的同名日期',async()=>{
  const {input,popup}=dayCalendar();const meta=api.buildFieldMeta(input);eq(meta.controlAdapterId,'moka-sd-date');
  eq((await api.fillElementSmart(input,'2001-07-15',meta,{writeMode:'date'})).ok,true);eq(input.value,'2001-07-15');eq(input.readOnly,true);eq(popup.hidden,true);
});
await test('SD 日历日期失焦回退不能报成功',async()=>{
  const {input}=dayCalendar({revert:true});eq((await api.fillElementSmart(input,'2001-07-15',api.buildFieldMeta(input),{writeMode:'date'})).ok,false);eq(input.value,'');
});
await test('SD 日历不选择禁用日期，不用文本伪造日期',async()=>{
  const {input}=dayCalendar({disabled:true});eq((await api.fillElementSmart(input,'2001-07-15',api.buildFieldMeta(input),{writeMode:'date'})).ok,false);eq(input.value,'');
});
await test('SD 日历拒绝不完整或不存在的日期',async()=>{
  const {input,popup}=dayCalendar();for(const value of ['2001-07','2001-02-30']){eq((await api.fillElementSmart(input,value,api.buildFieldMeta(input),{writeMode:'date'})).ok,false);eq(input.value,'');eq(popup.hidden,true);}
});
for(const partial of [false,true]) await test(`SD 籍贯完整级联${partial?'部分回填不能报成功':'并读取正式标签'}`,async()=>{
  block('个人信息',1,'<div class="apply-field-fixture location_info-fixture"><div class="title-fixture"><span>籍贯</span></div><div class="sd-Dropdown-container-fixture"><label class="sd-Input-container-fixture"><span class="sd-Input-tag-container-fixture"><span class="location-value"></span><input readonly placeholder="请输入籍贯"></span></label><span></span></div></div>');
  const root=fixture.querySelector('[class*="sd-Dropdown-container-"]'),input=root.querySelector('input'),display=root.querySelector('.location-value');
  const popup=document.createElement('div');popup.className='sd-Dropdown-dropdown-fixture';popup.hidden=true;root.lastElementChild.append(popup);
  const render=city=>{popup.innerHTML='<div class="sd-Cascader-panel-fixture"><div class="sd-Cascader-menu-fixture">'+(city?['浙江省','杭州市']:['浙江省','江苏省']).map(label=>`<div class="sd-Menu-container-fixture"><div class="sd-Menu-content-item-fixture">${label}</div></div>`).join('')+'</div></div>';popup.querySelectorAll('[class*="sd-Menu-content-item-"]').forEach(item=>item.onclick=()=>{if(item.textContent==='浙江省')render(true);else if(item.textContent==='杭州市'){display.textContent=partial?'浙江省':'浙江省 / 杭州市';popup.hidden=true;}});};
  input.onclick=()=>{popup.hidden=false;render(false);};input.onkeydown=e=>{if(e.key==='Escape')popup.hidden=true;};
  const meta=api.buildFieldMeta(root);eq(meta.controlAdapterId,'moka-sd-location');eq((await api.fillElementSmart(root,'浙江省杭州市',meta,{writeMode:'choice'})).ok,!partial);
  eq(display.textContent,partial?'浙江省':'浙江省 / 杭州市');eq(input.value,'');eq(input.readOnly,true);
});
document.querySelector('#summary').textContent=`完成：${passed} 通过，${failed} 失败`;
