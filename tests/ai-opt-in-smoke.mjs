import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
let stored={},requests=0;
const bg={URL,chrome:{runtime:{onInstalled:{addListener(){}},onMessage:{addListener(){}}},storage:{local:{get:async()=>stored,set:async values=>Object.assign(stored,values)}}},fetch:async()=>{requests++;return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'{"mappings":[],"fieldHints":[]}'}}]})};}};
vm.runInNewContext(read('background.js')+'\nthis.api={getSettings,mapFields,analyzePageStructure,saveSettings};',bg);
const payload={scan:{fields:[]},profileCatalog:{fields:[{path:'basic.name',label:'姓名'}]},apiConfig:{enabled:true}};
for(const config of [undefined,{model:'configured',apiKey:'fake-test-key'},{enabled:false},{enabled:'true'}]){
  stored={apiConfig:config};
  for(const action of ['mapFields','analyzePageStructure'])await assert.rejects(bg.api[action](payload),/AI 未启用/);
}
assert.equal(requests,0,'disabled/missing opt-in blocks fetch, even with message override');
await bg.api.saveSettings({apiConfig:{enabled:true,model:'test-model'}});
assert.equal((await bg.api.getSettings()).apiConfig.enabled,true);
await bg.api.analyzePageStructure(payload);
await bg.api.mapFields(payload);
assert.equal(requests,2,'explicit opt-in reaches both AI request paths');
await bg.api.saveSettings({apiConfig:{enabled:false}});
await assert.rejects(bg.api.analyzePageStructure(payload),/AI 未启用/);
assert.equal(requests,2,'turning off blocks later requests');

const cx={window:{},chrome:{runtime:{onMessage:{addListener(){}}}},document:{querySelector:()=>null},location:{hostname:'example.test'},Element:class{},HTMLInputElement:class{},HTMLSelectElement:class{}};
const hooks=`
  let testConfig={},calls=[];
  sendRuntimeMessage=async message=>{calls.push(message.type);return {profileV2:{sections:{}},apiConfig:testConfig};};
  startAutofillRun=()=>{resetAutofillAiState();return 1;};
  setAutofillProgress=()=>{};setProfilePanelStatus=()=>{};clearAutofillProgress=()=>{};
  scanForm=async()=>({fields:[]});buildAutofillPlan=()=>({entries:[],candidates:[],autoFillIds:new Set(),mappingSource:'本地规则'});
  enhanceScanWithAi=async scan=>{calls.push('AI_SCAN');return {scan};};
  enhancePlanWithAi=async(scan,plan)=>{calls.push('AI_MAP');return {plan};};
  updateAutofillDebugPlan=()=>{};collectMissingProfileFields=()=>[];
  this.api={async run(config){testConfig=config;calls=[];const result=await generateAutofillPlan();return {result,calls};}};
`;
vm.runInNewContext(read('form-runtime.js')+'\n'+read('content.js').replace(/\}\)\(\);\s*$/,hooks+'\n})();'),cx);
for(const config of [{},{enabled:false},{enabled:'true'},{apiKey:'fake',model:'configured'}]){
  const {result,calls}=await cx.api.run(config);
  assert.equal(result.ok,true);assert.deepEqual([...calls],['OJAF_GET_SETTINGS']);
  assert.equal(result.aiUsage.attempted,false);assert.equal(result.aiUsage.fallback,false);
  assert.match(result.aiStatus,/未调用 AI/);
}
const enabled=await cx.api.run({enabled:true});
assert.equal(enabled.result.ok,true);assert.deepEqual([...enabled.calls],['OJAF_GET_SETTINGS','AI_SCAN','AI_MAP']);
const disabledAgain=await cx.api.run({enabled:false});
assert.deepEqual([...disabledAgain.calls],['OJAF_GET_SETTINGS']);
assert.equal(disabledAgain.result.aiUsage.attempted,false);
console.log('AI opt-in: default/legacy/disabled zero requests, explicit enable, disable again, content flow passed');

// Loading the settings UI must not discover models on a disabled API.
const optionsSource=read('options.js');
const autoRefresh=optionsSource.slice(optionsSource.indexOf('async function maybeAutoRefreshModelList('),optionsSource.indexOf('function shouldAttemptModelList('));
const ui={fields:{aiEnabled:{checked:false}},collectApiConfig(){throw Error('disabled UI should stop before API handling');}};
vm.runInNewContext(autoRefresh,ui);
await ui.maybeAutoRefreshModelList();
assert.match(optionsSource,/if \(apiConfig.enabled\) apiPermissionGranted = await ensureApiHostPermissions/);
console.log('Disabled settings UI: no automatic model discovery or host permission request');
