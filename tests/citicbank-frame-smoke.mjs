import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/popup.js',import.meta.url),'utf8');
const calls=[];
let frames=[{frameId:0,result:false},{frameId:7,result:true}], url='https://job.citicbank.com/#';
const context={URL,chrome:{runtime:{},tabs:{query:(q,cb)=>cb([{id:12,url}]),
  sendMessage:(id,msg,options,cb)=>{calls.push({id,msg,options});cb({ok:true});}},
  scripting:{executeScript:(config,cb)=>{calls.push(config);cb(config.func?frames:[]);}}}};
vm.runInNewContext(source.slice(source.indexOf('async function sendToActiveTab')),context);
await context.sendToActiveTab({type:'OJAF_START_AUTOFILL'});
assert.equal(calls[0].target.allFrames,true);
assert.deepEqual([...calls[1].target.frameIds],[7]);
assert.ok(calls[1].files.includes('src/citicbank.js'));
assert.equal(calls[2].options.frameId,7);
frames=[{frameId:0,result:false}];calls.length=0;
await assert.rejects(context.sendToActiveTab({}),/简历编辑页/);
assert.equal(calls.length,1,'home page never injected');
frames=[{frameId:7,result:true},{frameId:9,result:true}];
await assert.rejects(context.sendToActiveTab({}),/简历编辑页/);
frames=[{frameId:9,result:true}];calls.length=0;
await context.sendToActiveTab({});assert.equal(calls[2].options.frameId,9,'resolve fresh frame after navigation');
url='https://example.mokahr.com/';calls.length=0;
await context.sendToActiveTab({});assert.deepEqual([...calls[0].target.frameIds],[0]);
context.chrome.tabs.sendMessage=()=>{throw new Error('response lost');};calls.length=0;
await assert.rejects(context.sendToActiveTab({type:'OJAF_START_AUTOFILL'}),/response lost/);
assert.equal(calls.length,1,'ambiguous fill failure not replayed');
console.log('CITIC frame routing: passed');
