import http from 'node:http';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const port=Number(args.port||4178);
const files=new Map([
  ['/feishu',new URL('./feishu-controls.html',import.meta.url)],
  ['/tests/feishu-controls.mjs',new URL('./feishu-controls.mjs',import.meta.url)],
  ['/dingtalk',new URL('./dingtalk-controls.html',import.meta.url)],
  ['/tests/dingtalk-controls.mjs',new URL('./dingtalk-controls.mjs',import.meta.url)],
  ['/citicbank',new URL('./citicbank-controls.html',import.meta.url)],
  ['/tests/citicbank-controls.mjs',new URL('./citicbank-controls.mjs',import.meta.url)],
  ['/src/citicbank.js',new URL('../src/citicbank.js',import.meta.url)],
  ['/',new URL('./browser-controls.html',import.meta.url)],
  ['/tests/browser-controls.mjs',new URL('./browser-controls.mjs',import.meta.url)],
  ['/tests/browser-performance.mjs',new URL('./browser-performance.mjs',import.meta.url)],
  ['/src/content.js',new URL('../src/content.js',import.meta.url)],
  ['/src/form-runtime.js',new URL('../src/form-runtime.js',import.meta.url)],
  ['/assets/fonts/Manrope-Variable.ttf',new URL('../assets/fonts/Manrope-Variable.ttf',import.meta.url)]
]);
if(args.baseline) files.set('/baseline-content.js',pathToFileURL(args.baseline));
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(req.method==='GET' && path==='/benchmark'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><title>OpenJobAutofill 性能对比</title><h1>OpenJobAutofill 性能对比</h1><p id="status">运行中…</p><pre id="results"></pre><script type="module" src="/tests/browser-performance.mjs"></script>');return;}
  if(req.method!=='GET'||!files.has(path)){res.writeHead(404);res.end();return;}
  try{const file=files.get(path);res.writeHead(200,{'Content-Type':file.pathname.endsWith('.html')?'text/html; charset=utf-8':file.pathname.endsWith('.ttf')?'font/ttf':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(await fs.readFile(file));}
  catch{res.writeHead(500);res.end('Fixture unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local fixtures: http://127.0.0.1:${port} (only fixture scripts and font are served)`));
