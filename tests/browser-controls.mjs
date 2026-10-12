const fixture = document.getElementById('fixture');
const results = document.getElementById('results');
const runtime = window.__OJAF_FORM_RUNTIME__;
const profile = {schemaVersion:2,sections:{basic:{key:'basic',title:'基本信息',kind:'simple',values:{'姓名':'演示用户','邮箱':'demo@example.test','自我介绍':'用于本地回归的虚构资料'}}}};
window.fixtureLocation = {hostname:'fixture.zhiye.com',href:location.href};
const listeners = new Set();
window.fixtureChrome = {runtime:{
  onMessage:{addListener(){},removeListener(){}},getURL:p=>'/'+p,
  sendMessage(message,callback){queueMicrotask(()=>callback({ok:true,data:message.type==='OJAF_GET_SETTINGS'?{profileV2:profile}:{}}));}
},storage:{onChanged:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)}}};
const source = await (await fetch('/src/content.js')).text();
const hooks = `
window.fixtureApi = {fillElementSmart, buildFieldMeta, scanForm, getCurrentProfileSections,
 getAutofillRuntimeState, renderProfilePanel, setAutofillProgress, clearAutofillProgress,
 fillFocusedProfileItem, beginProfileItemEdit, getFieldControlAdapter,
 show: async () => { injectStyle(); await refreshCurrentProfile(); showProfilePanel(); activeProfileCategory='基本信息'; renderProfilePanel(); },
 dispose: window.__OJAF_AUTOFILL_DISPOSE__
};`;
const script=document.createElement('script');
script.textContent=source.replace('(() => {','(() => { const chrome=window.fixtureChrome; const location=window.fixtureLocation;').replace(/\}\)\(\);\s*$/,hooks+'\n})();');
document.head.append(script);
const api=window.fixtureApi;
let passed=0,failed=0;
const assert=(condition,message='assertion failed')=>{if(!condition)throw new Error(message);};
const eq=(actual,expected,message='')=>assert(actual===expected,`${message} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const test=async(name,run)=>{
  fixture.replaceChildren();document.querySelectorAll('.fixture-popover').forEach(n=>n.remove());window.fixtureLocation.hostname='fixture.zhiye.com';
  const li=document.createElement('li');li.textContent=name+'…';results.append(li);
  try{await run();passed++;li.className='pass';li.textContent='✓ '+name;}
  catch(error){failed++;li.className='fail';li.textContent='✗ '+name+': '+error.message;console.error(error);}
  eq(runtime.stats().activeWaits,0,'wait leak');eq(runtime.stats().observers,0,'observer leak');
  document.getElementById('summary').textContent=`${passed} 通过，${failed} 失败（运行中）`;
};
const fill=(element,value,mode='text')=>api.fillElementSmart(element,value,{label:'测试字段',siteAdapterId:window.fixtureLocation.hostname.includes('zhiye')?'zhiye':''},{writeMode:mode,fieldLabel:'测试字段'});
const input=(html='<input id="test-input">')=>{fixture.innerHTML=html;return fixture.querySelector('input,select,textarea');};
function choice({kind='ant',labels=['本科','硕士'],readonly=false,delay=0,reject=false,replace=false,disabled=false,search=false}={}){
  if(kind==='phoenix') fixture.innerHTML='<div class="form-item--phoenix"><div class="form-item__title"><span class="form-item__text">学历</span></div><div id="choice" class="phoenix-auto-complete-container"><input id="choice-input"></div></div>';
  else if(kind==='moka') fixture.innerHTML='<div class="apply-field-fixture select_info"><div class="title-fixture">学历</div><div id="choice" class="sd-Dropdown-container-fixture"><label id="surface" class="sd-Select-container-fixture"><span class="sd-Input-display-value-fixture"></span><input id="choice-input"><span class="sd-Select-addon-fixture">⌄</span></label></div></div>';
  else fixture.innerHTML='<div class="ant-form-item"><label>学历</label><div id="choice" class="ant-select"><span class="ant-select-selection-item"></span><input id="choice-input" role="combobox"></div></div>';
  let field=fixture.querySelector('input');field.readOnly=readonly;field.disabled=disabled;
  const popup=document.createElement('div');popup.id='owned-options';popup.className='fixture-popover '+(kind==='phoenix'?'common-unmodeled-layer':kind==='moka'?'sd-Menu-container-fixture':'ant-select-dropdown');popup.hidden=true;
  const list=document.createElement('div');list.className=kind==='phoenix'?'phoenix-selectList':'';list.setAttribute('role','listbox');popup.append(list);document.body.append(popup);
  field.setAttribute('aria-controls',popup.id);
  const renderOptions=()=>{
    list.replaceChildren();
    for(const item of labels){const option=document.createElement('div');const label=typeof item==='string'?item:item.label;option.textContent=label;option.setAttribute('role','option');
      option.className=kind==='phoenix'?'phoenix-selectList__listItem':kind==='moka'?'sd-Select-common-item-fixture':'ant-select-item-option';
      if(item.disabled)option.setAttribute('aria-disabled','true');
      option.addEventListener('click',()=>{if(reject)return;field.value=label;const display=fixture.querySelector('.ant-select-selection-item,.sd-Input-display-value-fixture');if(display)display.textContent=label;popup.hidden=true;
        if(replace){const old=fixture.querySelector('#choice');old.replaceWith(old.cloneNode(true));field=fixture.querySelector('input');}
      });list.append(option);
    }
  };
  fixture.querySelector('#choice').addEventListener('click',()=>{if(disabled)return;popup.hidden=false;if(!search)setTimeout(renderOptions,delay);});
  field.addEventListener('input',()=>{if(search)setTimeout(renderOptions,delay);});
  field.addEventListener('keydown',e=>{if(e.key==='Escape')popup.hidden=true;});
  return {field,popup,list,root:fixture.querySelector('#choice')};
}
await test('文本写入完整长内容与换行',async()=>{const el=input('<textarea id="test-input"></textarea>');const value='完整内容\n'+'测试文字'.repeat(100);eq((await fill(el,value)).ok,true);eq(el.value,value);});
await test('只读输入框拒绝文本兜底',async()=>{const el=input('<input id="test-input" readonly value="原值">');eq((await fill(el,'新值')).ok,false);eq(el.value,'原值');});
await test('输入节点重建并回退时不误报成功',async()=>{const el=input();el.addEventListener('input',()=>{const next=el.cloneNode();next.value='';el.replaceWith(next);},{once:true});eq((await fill(el,'演示')).ok,false);});
await test('原生 select 精确选择与禁用选项',async()=>{const el=input('<select><option>本科</option><option>本科及以上</option><option disabled>硕士</option></select>');eq((await fill(el,'本科及以上')).ok,true);eq(el.value,'本科及以上');eq((await fill(el,'硕士')).ok,false);eq(el.value,'本科及以上');});
await test('原生 select 重复选项保持原值',async()=>{const el=input('<select><option>原值</option><option value="a">本科</option><option value="b">本科</option></select>');eq((await fill(el,'本科')).ok,false);eq(el.value,'原值');});
await test('Phoenix 字段标题优先于同一条经历中的日期',async()=>{fixture.innerHTML='<section><h2>教育经历</h2><div>开始时间 结束时间<div class="form-item--phoenix"><div class="form-item__title"><span class="form-item__text">学历</span></div><div class="phoenix-auto-complete-container"><input id="label-field"></div></div></div></section>';const field=api.buildFieldMeta(fixture.querySelector('input'));eq(field.label,'学历');});
await test('Phoenix portal 下拉正式选择',async()=>{const {field}=choice({kind:'phoenix'});eq((await fill(field,'硕士','choice')).ok,true);eq(field.value,'硕士');});
await test('Phoenix 禁用控件不展开',async()=>{const {field,popup}=choice({kind:'phoenix',disabled:true});eq((await fill(field,'硕士','choice')).ok,false);eq(popup.hidden,true);});
await test('Moka SD 下拉选择并读取显示值',async()=>{const {field}=choice({kind:'moka'});eq(api.getFieldControlAdapter(field).id,'moka-sd-select');eq((await fill(field,'硕士','choice')).ok,true);eq(fixture.querySelector('.sd-Input-display-value-fixture').textContent,'硕士');});
await test('Moka 保留带学位注释的学历等价匹配',async()=>{const {field}=choice({kind:'moka'});eq((await fill(field,'本科（学士）','choice')).ok,true);eq(fixture.querySelector('.sd-Input-display-value-fixture').textContent,'本科');});
await test('关联弹层隔离另一弹层中的同名选项',async()=>{const {field}=choice();let stolen=false;const other=document.createElement('div');other.className='fixture-popover';other.setAttribute('role','listbox');other.innerHTML='<div role="option">硕士</div>';other.onclick=()=>stolen=true;document.body.append(other);eq((await fill(field,'硕士','choice')).ok,true);eq(stolen,false);});
await test('等待远程搜索结果后提交选项',async()=>{const {field}=choice({search:true,delay:450});eq((await fill(field,'硕士','choice')).ok,true);eq(fixture.querySelector('.ant-select-selection-item').textContent,'硕士');});
await test('只有搜索文字没有提交时返回失败并还原',async()=>{const {field}=choice({reject:true});field.value='原值';eq((await fill(field,'硕士','choice')).ok,false);eq(field.value,'原值');});
await test('重复文本选项不猜测',async()=>{const {field}=choice({labels:['硕士','硕士'],readonly:true});eq((await fill(field,'硕士','choice')).ok,false);eq(field.value,'');});
await test('自定义禁用选项不点击',async()=>{const {field}=choice({labels:[{label:'硕士',disabled:true}],readonly:true});eq((await fill(field,'硕士','choice')).ok,false);eq(field.value,'');});
await test('框架替换整个选择器后重取节点验证',async()=>{const {field}=choice({replace:true});eq((await fill(field,'硕士','choice')).ok,true);eq(field.isConnected,false);eq(fixture.querySelector('input').value,'硕士');});
await test('级联路径缺少末级时不提交部分结果',async()=>{const {field,list}=choice({readonly:true,labels:['示例省']});eq((await fill(field,'示例省测试市','choice')).ok,false);assert(!fixture.querySelector('.ant-select-selection-item').textContent.includes('测试市'));});
await test('级联完整路径支持斜线分隔并验证回填',async()=>{
  fixture.innerHTML='<div id="cascade" class="ant-cascader-picker"><input id="cascade-input" role="combobox" aria-controls="cascade-popup" readonly></div>';
  const el=fixture.querySelector('input'),root=fixture.firstElementChild,popup=document.createElement('div');popup.id='cascade-popup';popup.className='fixture-popover ant-cascader-menus';popup.hidden=true;document.body.append(popup);
  const option=label=>{popup.innerHTML='<div role="option"></div>';const n=popup.firstElementChild;n.textContent=label;n.onclick=()=>{if(label==='示例省')option('测试市');else{el.value='示例省 / 测试市';popup.hidden=true;}};};
  root.onclick=()=>{popup.hidden=false;option('示例省');};eq((await fill(el,'示例省 / 测试市','choice')).ok,true);eq(el.value,'示例省 / 测试市');
});
await test('禁用的选择器容器拒绝操作',async()=>{const {field,root,popup}=choice();root.classList.add('ant-select-disabled');eq((await fill(field,'硕士','choice')).ok,false);eq(popup.hidden,true);});
await test('未知自定义下拉不退回直接写搜索框',async()=>{const el=input('<input id="unknown-choice" placeholder="请选择">');eq((await fill(el,'硕士','choice')).ok,false);eq(el.value,'');});
await test('虚拟列表滚动后重取可见选项',async()=>{const {field,list}=choice({readonly:true,labels:['本科']});list.style.cssText='height:60px;overflow:auto';list.addEventListener('scroll',()=>{list.firstElementChild.textContent='硕士';list.firstElementChild.onclick=()=>{field.value='硕士';fixture.querySelector('.ant-select-selection-item').textContent='硕士';list.parentElement.hidden=true;};});field.addEventListener('click',()=>setTimeout(()=>{const spacer=document.createElement('div');spacer.style.height='600px';list.append(spacer);},10));eq((await fill(field,'硕士','choice')).ok,true);});
await test('非关联旧弹层和新弹层歧义均不接管',async()=>{const el=input('<input id="owner">');let visible=[];const visiblePopup=id=>{const p=document.createElement('div');p.className='fixture-popover';p.setAttribute('role','listbox');p.id=id;document.body.append(p);return p;};const old=visiblePopup('old');const session=runtime.createChoiceSession(el,{isVisible:n=>!n.hidden});eq(session.resolvePopup(),null);const a=visiblePopup('new-a'),b=visiblePopup('new-b');eq(session.resolvePopup(),null);b.hidden=true;eq(session.resolvePopup(),a);});
await test('资料列表缓存、进度更新和编辑取消',async()=>{await api.show();const panel=document.getElementById('ojaf-profile-panel');const list=panel.querySelector('[data-role="quick-copy-list"]');const first=list.firstElementChild;const row=list.querySelector('.arf-row');const item=api.getCurrentProfileSections()[0].items.find(i=>i.label==='姓名');const sections=api.getCurrentProfileSections();eq(api.getCurrentProfileSections(),sections);
  api.beginProfileItemEdit(row,item);const editor=row.querySelector('.arf-row-editor');assert(editor,'inline editor');editor.value='未保存的编辑';
  for(let i=0;i<30;i++)api.setAutofillProgress('填写匹配项',i,'进度');api.clearAutofillProgress();eq(list.firstElementChild,first,'list identity');eq(row.querySelector('.arf-row-editor'),editor,'editor identity');eq(editor.value,'未保存的编辑');
  [...row.querySelectorAll('button')].find(b=>b.textContent==='取消').click();eq(list.querySelector('.arf-row-editor'),null,'cancel editor');
  const body=panel.querySelector('.arf-body');assert(body.scrollWidth<=body.clientWidth+1,'panel horizontal overflow');assert(panel.getBoundingClientRect().bottom<=window.innerHeight+1,'panel bottom clipped');
});
await test('定点填入只改变用户聚焦的字段',async()=>{const el=input('<label>指定姓名<input id="focused"></label><label>另一个字段<input id="untouched"></label>');el.focus();const item=api.getCurrentProfileSections()[0].items.find(i=>i.label==='姓名');await api.fillFocusedProfileItem(item);eq(el.value,'演示用户');eq(fixture.querySelector('#untouched').value,'');});
await test('180 个字段扫描缓存与主线程分片',async()=>{fixture.innerHTML=Array.from({length:30},(_,i)=>`<fieldset><legend>项目经历 ${i+1}</legend>${['项目名称','开始时间','结束时间','项目内容','本人职责','项目链接'].map((label,j)=>`<div class="form-item"><label for="scan-${i}-${j}">${label}</label><input id="scan-${i}-${j}"></div>`).join('')}</fieldset>`).join('');let heartbeat=0;const timer=setInterval(()=>heartbeat++,1);const before=runtime.stats().yields;let result;try{result=await api.scanForm();}finally{clearInterval(timer);}eq(result.fields.length,180);assert(api.getAutofillRuntimeState().performance.scan.cacheHits>0,'cache hits');assert(runtime.stats().yields>before,'yield');assert(heartbeat>0,'main-thread heartbeat');document.getElementById('metrics').textContent=JSON.stringify({scan:api.getAutofillRuntimeState().performance.scan,runtime:runtime.stats(),heartbeat},null,2);});
fixture.innerHTML='<h2>面板交互预览</h2><label>姓名<input id="preview-name" placeholder="先点击这里，再点资料的填入"></label><p>测试资料是虚构内容，可以查看编辑、搜索和轻量动画。</p>';
api.renderProfilePanel();document.getElementById('summary').textContent=`完成：${passed} 通过，${failed} 失败`;
window.scrollTo(0,0);
window.fixtureResults={passed,failed};
