import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let observer;
class Observer {
  constructor(callback) { this.callback = callback; observer = this; }
  observe() { this.active = true; }
  disconnect() { this.active = false; }
}
const context = {window:{}, document:{documentElement:{}}, setTimeout, clearTimeout, MutationObserver:Observer, Date};
vm.runInNewContext(fs.readFileSync(new URL('../src/form-runtime.js',import.meta.url),'utf8'), context);
const runtime = context.window.__OJAF_FORM_RUNTIME__;
const clean = () => {assert.equal(runtime.stats().activeWaits,0);assert.equal(runtime.stats().observers,0);};
assert.equal(await runtime.waitFor(()=>42),42);clean();
assert.equal(await runtime.waitFor(()=>false,{timeout:20}),null);clean();
await assert.rejects(runtime.waitFor(()=>{throw new Error('read failed');}), /read failed/);clean();
const signal = new AbortController();
const aborted = runtime.waitFor(()=>false,{signal:signal.signal});signal.abort();
assert.equal(await aborted,null);clean();
const disposed = runtime.waitFor(()=>false);runtime.dispose();assert.equal(await disposed,null);clean();
let ready = false;
const delayed = runtime.waitFor(()=>ready,{timeout:400,interval:20,stableFor:30});
setTimeout(()=>{ready=true;observer.callback();},20);
assert.equal(await delayed,true);clean();
// Frequent mutations must not indefinitely defer a ready read.
const storm = runtime.waitFor(()=>ready,{stableFor:25,interval:15,timeout:300});
const timer = setInterval(()=>observer.callback(),3);assert.equal(await storm,true);clearInterval(timer);clean();
const same = [{text:'本科'},{text:'本科'}], match=(a,b)=>a===b, text=n=>n.text;
assert.equal(runtime.uniqueOption(same,['本科'],match,text),null);
assert.equal(runtime.uniqueOption([{text:'硕士研究生'},{text:'本科'}],['硕士研究生'],match,text).text,'硕士研究生');
console.log('Runtime: immediate/timeout/error/abort/dispose/stability/mutation storm and exact ambiguity passed');
