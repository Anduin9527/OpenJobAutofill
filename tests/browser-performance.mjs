// Optional before/after benchmark; the server must be passed --baseline=/path/to/content.js.
const out=document.getElementById('results');
const report={};
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const markup=Array.from({length:30},(_,i)=>`<fieldset><legend>项目经历 ${i+1}</legend>${['项目名称','开始时间','结束时间','项目内容','本人职责','项目链接'].map((label,j)=>`<div class="form-item"><label for="f-${i}-${j}">${label}</label><input id="f-${i}-${j}"></div>`).join('')}</fieldset>`).join('');
for(const [name,path] of [['before','/baseline-content.js'],['after','/src/content.js']]){
  const response=await fetch(path);
  if(!response.ok){out.textContent='对比需要用 --baseline=/修改前/content.js 启动测试服务器。';throw new Error('Missing baseline');}
  const source=await response.text();
  const frame=document.createElement('iframe');frame.style.cssText='width:850px;height:600px;position:absolute;left:-10000px';document.body.append(frame);
  const doc=frame.contentDocument,win=frame.contentWindow;
  doc.body.innerHTML=markup;
  const runtimeScript=doc.createElement('script');runtimeScript.textContent=await (await fetch('/src/form-runtime.js')).text();doc.head.append(runtimeScript);
  const contentScript=doc.createElement('script');
  contentScript.textContent=source.replace('(() => {',`(() => { const location={hostname:'fixture.zhiye.com',href:'https://fixture.zhiye.com/'}; const chrome={runtime:{onMessage:{addListener(){},removeListener(){}},sendMessage(m,cb){queueMicrotask(()=>cb({ok:true,data:{}}));}}};`).replace(/\}\)\(\);\s*$/,`window.benchApi={scanForm,setAutofillProgress,clearAutofillProgress,renderProfilePanel,show:()=>{currentProfileV2={schemaVersion:2,sections:{basic:{title:'基本信息',kind:'simple',values:{'姓名':'演示用户','邮箱':'demo@example.test'}}}};profilePanelVisible=true;activeProfileCategory='基本信息';renderProfilePanel();}};})();`);
  doc.head.append(contentScript);const api=win.benchApi;
  let reads=0,clones=0;
  for(const proto of [win.Element.prototype,win.Document.prototype]){const original=proto.querySelectorAll;proto.querySelectorAll=function(...args){reads++;return original.apply(this,args);};}
  const clone=win.Node.prototype.cloneNode;win.Node.prototype.cloneNode=function(...args){clones++;return clone.apply(this,args);};
  // Warm once, then compare medians of 3 scans under the same fixture.
  await api.scanForm();
  const timings=[],queries=[],copies=[];
  for(let run=0;run<3;run++){reads=0;clones=0;const start=performance.now();const scan=await api.scanForm();if(scan.fields.length!==180)throw new Error('Unexpected field count');timings.push(Math.round(performance.now()-start));queries.push(reads);copies.push(clones);}
  api.show();const list=doc.querySelector('[data-role="quick-copy-list"]');const original=list.firstElementChild;
  let listMutations=0;const observer=new win.MutationObserver(records=>{listMutations+=records.length;});observer.observe(list,{childList:true,subtree:true});
  const start=performance.now();for(let i=0;i<30;i++)api.setAutofillProgress('填写匹配项',i,'测试进度');api.clearAutofillProgress();const progressMs=Math.round(performance.now()-start);await new Promise(r=>setTimeout(r,0));observer.disconnect();
  report[name]={fields:180,medianScanMs:median(timings),samplesMs:timings,medianQuerySelectorAll:median(queries),medianCloneNode:median(copies),progress30UpdatesMs:progressMs,listMutations,listNodePreserved:list.firstElementChild===original};
  out.textContent=JSON.stringify(report,null,2);frame.remove();
}
document.getElementById('status').textContent='前后对比完成（同一浏览器、本机合成样例；数值随设备和页面变化）';
