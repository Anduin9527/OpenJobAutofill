const fixture=document.querySelector('#fixture'),results=document.querySelector('#results');
const eq=(a,b,message='')=>{if(a!==b)throw Error(`${message}: expected ${b}, got ${a}`);};
let passed=0,failed=0;
window.fixtureLocation={hostname:'job.citicbank.com',href:location.href};
window.fixtureChrome={runtime:{onMessage:{addListener(){},removeListener(){}},getURL:p=>'/'+p,
  sendMessage:(m,cb)=>cb({ok:true,data:{}})},storage:{onChanged:{addListener(){},removeListener(){}}}};
const source=await(await fetch('/src/content.js')).text();
const script=document.createElement('script');
script.textContent=source.replace('(() => {','(() => { const chrome=window.fixtureChrome; const location=window.fixtureLocation;').replace(/\}\)\(\);\s*$/,`window.api={fillElementSmart,buildFieldMeta,scanForm,inferFieldLabel,inferMatchSection,collectVisibleControls, isRepeatOccurrenceCompatible, citic};})();`);
document.head.append(script);const api=window.api;
const test=async(name,run)=>{fixture.replaceChildren();const li=document.createElement('li');results.append(li);
  try{await run();eq(window.__OJAF_FORM_RUNTIME__.stats().activeWaits,0,'wait cleanup');eq(window.__OJAF_FORM_RUNTIME__.stats().observers,0,'observer cleanup');passed++;li.className='pass';li.textContent='✓ '+name;}
  catch(e){failed++;li.className='fail';li.textContent='✗ '+name+' '+e.message;console.error(e);}
  document.querySelector('#summary').textContent=`${passed} 通过，${failed} 失败`;
};
function form(id='jbxxform'){fixture.innerHTML=`<div class="leftDiv"><div class="divTitle">模块标题和说明</div><form id="${id}"><table><tbody><tr></tr></tbody></table></form></div>`;return fixture.querySelector('tr');}
function cell(row,label,html){const td=document.createElement('td');td.innerHTML=`<div><span>*</span>${label}</div>${html}`;row.append(td);return td;}
function select(parent,{name='nationality',values=['中国','美国'],multiple=false,search=false,reject=false,delay=0}={}){
  const root=document.createElement('div');root.className='dropdown bootstrap-select bs3';root.innerHTML=`<select id="${name}" name="${name}" ${multiple?'multiple':''}></select><button type="button"><div class="filter-option-inner-inner">请选择</div></button><div class="dropdown-menu" role="combobox">${search?'<div class="bs-searchbox"><input role="textbox" aria-label="Search"></div>':''}<div class="inner" role="listbox"><ul></ul></div></div>`;parent.append(root);
  const native=root.querySelector('select'),button=root.querySelector('button'),display=root.querySelector('.filter-option-inner-inner'),ul=root.querySelector('ul');
  native.add(new Option('请选择',''));values.forEach((v,i)=>{const o=new Option(typeof v==='string'?v:v.label,String(i+1));o.disabled=!!v.disabled;native.add(o);});
  const render=()=>{ul.replaceChildren();for(const o of native.options){if(search&&!o.textContent.includes(root.querySelector('input').value))continue;
    const li=document.createElement('li'),a=document.createElement('a');a.setAttribute('role','option');a.setAttribute('aria-disabled',String(o.disabled));a.innerHTML=`<span class="check-mark"></span><span class="text">${o.textContent}</span>`;
    a.onclick=()=>{if(reject||o.disabled)return;if(multiple)o.selected=!o.selected;else native.value=o.value;
      display.textContent=Array.from(native.selectedOptions).filter(o=>o.value).map(o=>o.textContent).join(', ')||'请选择';
      native.dispatchEvent(new Event('change',{bubbles:true}));if(!multiple)root.classList.remove('open');};li.append(a);ul.append(li);}};
  button.onclick=()=>{root.classList.toggle('open');setTimeout(render,delay);};
  root.querySelector('input')?.addEventListener('input',()=>setTimeout(render,delay));
  root.addEventListener('keydown',e=>{if(e.key==='Escape')root.classList.remove('open');});
  return {native,root,display,render};
}
const fill=(e,v)=>api.fillElementSmart(e,v,api.buildFieldMeta(e),{writeMode:'choice',fieldLabel:'测试'});
await test('表格同一单元格内区分电话类别、电话、证件号',async()=>{
  const row=form();const td=cell(row,'证件类型','<input id="a5015" name="a5015" way-data="grjbxx.a5015">');const s=select(td,{name:'yxsfzjlx'});
  eq(api.buildFieldMeta(td.querySelector('input')).label,'证件号码');eq(api.buildFieldMeta(s.native).label,'证件类型');
  const phone=cell(row,'移动电话','<input name="a0118" way-data="grjbxx.a0118">');const category=select(phone,{name:'a0188cate'});
  eq(api.buildFieldMeta(category.native).label,'移动电话类别');eq(api.buildFieldMeta(phone.querySelector('input')).label,'移动电话');
});
await test('隐藏 native select 与搜索框仅扫描成一个字段',async()=>{const td=cell(form(),'国籍','');const {native}=select(td,{search:true});const controls=api.collectVisibleControls();eq(controls.length,1);eq(controls[0],native);eq(api.buildFieldMeta(native).siteAdapterId,'citicbank');});
await test('下拉正式选择同步代码、显示文本及 change 事件',async()=>{const s=select(cell(form(),'国籍',''),{search:true,delay:50});let changes=0;s.native.onchange=()=>changes++;eq((await fill(s.native,'美国')).ok,true);eq(s.native.value,'2');eq(s.display.textContent,'美国');eq(changes,1);eq(s.root.classList.contains('open'),false);});
await test('重复文本与禁用选项均拒绝选择',async()=>{const s=select(cell(form(),'学历',''),{values:['本科','本科',{label:'硕士',disabled:true}]});eq((await fill(s.native,'本科')).ok,false);eq((await fill(s.native,'硕士')).ok,false);eq(s.native.value,'');});
await test('页面拒绝选项时不误报成功',async()=>{const s=select(cell(form(),'国籍',''),{reject:true});eq((await fill(s.native,'美国')).ok,false);eq(s.native.value,'');eq(s.root.classList.contains('open'),false);});
await test('多选精确同步集合，重新填写移除旧选项',async()=>{const s=select(cell(form(),'多选测试',''),{multiple:true,values:['选项甲','选项乙','选项丙']});eq((await fill(s.native,'选项甲、选项乙')).ok,true);eq((await fill(s.native,'选项丙')).ok,true);eq(Array.from(s.native.selectedOptions).filter(o=>o.value).map(o=>o.textContent).join(','),'选项丙');});
function region(){const td=cell(form(),'籍贯','<div class="dis-flex"><input class="storage" way-data="grjbxx.originplace"></div>');const group=td.querySelector('.dis-flex');
  const a=select(group,{name:'province',values:['示例省']}),b=select(group,{name:'city',values:[]}),c=select(group,{name:'district',values:[]});
  for(const s of[a,b,c])s.native.classList.add('dwArea');
  a.native.onchange=()=>setTimeout(()=>{b.native.replaceChildren(new Option('请选择',''),new Option('示例市','city-code'));b.render();},50);
  b.native.onchange=()=>setTimeout(()=>{c.native.replaceChildren(new Option('请选择',''),new Option('示例区','district-code'));c.render();},50);
  return {group,a,b,c};}
await test('省市区联动合并为一个字段，等待子选项',async()=>{const {group,c}=region();eq(api.collectVisibleControls().length,1);eq(api.buildFieldMeta(group).label,'籍贯');eq((await fill(group,'示例省 / 示例市 / 示例区')).ok,true);eq(c.native.value,'district-code');});
await test('不完整地区路径不改变任何选择',async()=>{const {group,a}=region();eq((await fill(group,'示例市')).ok,false);eq(a.native.value,'');});
await test('完整日期格式化，不推测缺失日或无效日期',async()=>{const td=cell(form(),'出生日期','<div class="input-group date bs-datetime"><input id="a0103" way-data="grjbxx.a0103"></div>');const e=td.querySelector('input');eq((await fill(e,'2000-02')).ok,false);eq(e.value,'');eq((await fill(e,'2001-02-29')).ok,false);eq((await fill(e,'2000年2月29日')).ok,true);eq(e.value,'2000-02-29');});
await test('Way.js 经历分组、家庭姓名归属与隐藏元数据',async()=>{fixture.innerHTML='<form id="jtgxform"><div way-repeat-wrapper="1" way-scope="jtgx"><div way-scope="0"><table><tr><td><div>姓名</div><input name="familyName"><input class="storage" way-data="jtgx.id"></td></tr></table></div><div way-scope="1"><table><tr><td><div>姓名</div><input name="familyName"></td></tr></table></div></div></form>';const fields=(await api.scanForm()).fields;eq(fields.length,2);eq(fields[1].repeatItemIndex,2);eq(fields[1].repeatItemTotal,2);eq(api.inferMatchSection(fields[0]),'家庭信息');});
await test('高中限定行不绑定本科资料；学校乱序按身份匹配',async()=>{const fields=[{siteAdapterId:'citicbank',inferredCategory:'教育经历',inferredLabel:'学校名称',repeatItemIndex:1,repeatItemTotal:1},{siteAdapterId:'citicbank',inferredCategory:'教育经历',inferredLabel:'学历',repeatItemIndex:1,repeatItemTotal:1,options:[{label:'高中及以下',value:'high'}]}];
  const entries=[{category:'教育经历',label:'学校名称',value:'示例大学',hasValue:true,valuePath:{sectionKey:'education',itemIndex:0}},{category:'教育经历',label:'学历',value:'本科',hasValue:true,valuePath:{sectionKey:'education',itemIndex:0}}];api.citic.bindRecords(fields,entries);eq(fields[0].hotjobProfileIndex,-1);eq(api.isRepeatOccurrenceCompatible(fields[0],entries[0]),false);
  fields[0].hasCurrentValue=true;fields[0].currentValue='示例大学';fields[0].repeatItemIndex=2;fields[1].repeatItemIndex=2;fields[1].options=[{label:'本科',value:'college'}];api.citic.bindRecords(fields,entries);eq(fields[0].hotjobProfileIndex,0);});
await test('空白高中和本科两行仅把本科资料绑定到本科行',async()=>{
  const row=(index,degree)=>['学校名称','学历'].map(label=>({siteAdapterId:'citicbank',inferredCategory:'教育经历',inferredLabel:label,repeatItemIndex:index,repeatItemTotal:2,options:label==='学历'?[{label:degree,value:degree}]:[]}));
  const high=row(1,'高中及以下'),college=row(2,'本科');const entries=['学校名称','学历'].map((label,i)=>({category:'教育经历',label,value:i?'本科':'示例大学',hasValue:true,valuePath:{sectionKey:'education',itemIndex:0}}));
  api.citic.bindRecords([...high,...college],entries);eq(high[0].hotjobProfileIndex,-1);eq(college[0].hotjobProfileIndex,0);
  const ambiguous=row(1,'本科');api.citic.bindRecords([...ambiguous,...college],entries);eq(ambiguous[0].hotjobProfileIndex,-1);eq(college[0].hotjobProfileIndex,-1);
});
await test('薪酬单位不明确时不把月薪写入年薪字段',async()=>{const td=cell(form('qwxzform'),'期望薪酬（万元，请填写税前年薪）','<input id="a0205">');const e=td.querySelector('input');eq((await fill(e,'15000')).ok,false);eq(e.value,'');eq((await api.fillElementSmart(e,'18',api.buildFieldMeta(e),{sourceLabel:'期望税前年薪（万元）'})).ok,true);eq(e.value,'18');});
await test('适配仅在指定域名启用',async()=>{window.fixtureLocation.hostname='other.example';eq(api.citic.active(),false);window.fixtureLocation.hostname='job.citicbank.com';});
document.querySelector('#summary').textContent=`完成：${passed} 通过，${failed} 失败`;
