import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn,spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,cpSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve,join,sep } from 'node:path';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { defaultData, normalizeData } from '../shared/quotation.js';
mkdirSync(resolve('tmp'),{recursive:true});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function freePort() {const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function fixture(n) {
  return normalizeData({...defaultData,quotationDate:'2026-10-10',stampSeed:2468,dataSource:Array.from({length:n},(_,i)=>({id:'row-'+i,no:String(i+1),name:'精密轴承 '+(i+1),model:'SKF-6205-'+i,unit:'件',quantity:i+1,price:18.5,noManual:false}))});
}
async function runScenario(binary, release=false) {
  const dir=mkdtempSync(join(tmpdir(),'quote-integration-'));
  const runtimeDir=join(dir,'runtime');
  mkdirSync(runtimeDir);
  const command=binary;
  if(release){
    const manifest=JSON.parse(readFileSync(resolve('output/runtime-build.json'),'utf8'));
    cpSync(resolve(manifest.directory),runtimeDir,{recursive:true,dereference:true});
  } else for(const source of ['.output','assets','public/stamps','scripts'])cpSync(resolve(source),join(runtimeDir,source),{recursive:true,dereference:true});
  let storageDir=join(dir,'storage');
  if(release){
    mkdirSync(storageDir);
    const legacy=spawnSync(command,['-e',"const {Database}=require('bun:sqlite');const db=new Database(process.env.DATA_DIR+'/quotation.sqlite');db.exec('CREATE TABLE versions(token TEXT PRIMARY KEY,quote_id TEXT NOT NULL REFERENCES quotes(id),version INTEGER NOT NULL,data TEXT NOT NULL,content_hash TEXT NOT NULL,pdf_hash TEXT NOT NULL,url TEXT NOT NULL,created TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,UNIQUE(quote_id,version))');db.close()"],{env:{...process.env,DATA_DIR:storageDir}});
    assert.equal(legacy.status,0,'seed previous database schema for migration test');
  }
  const port=await freePort(), origin='http://localhost:'+port;
  writeFileSync(join(runtimeDir,'.env'),'PUBLIC_ORIGIN='+origin+'\nCOOKIE_SECURE=false\n');
  let server;
  const start=async()=>{
    server=spawn(command,['.output/index.js'],{cwd:runtimeDir,env:{...process.env,DATA_DIR:storageDir,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
    let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
    let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,'server ready: '+log);
  };
  const stop=async()=>{if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}};
  let cookie='';
  const call=async(path,body,auth=true,extra={})=>{
    const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Connection:'close',...(body?{'Content-Type':'application/json','Origin':origin}:{}),...(auth&&cookie?{Cookie:cookie}:{}),...extra},body:body?JSON.stringify(body):undefined});
    const type=response.headers.get('content-type')||'';
    const value=type.includes('application/pdf')?Buffer.from(await response.arrayBuffer()):await response.json();
    return {response,value};
  };
  try {
    await start();
    const unauthorized=await call('/api/admin',undefined,false);
    assert.equal(unauthorized.response.status,401);
    assert.equal(unauthorized.response.headers.get('x-content-type-options'),'nosniff');
    assert.equal((await call('/api/admin',{action:'save',padding:'x'.repeat(1100000)},false)).response.status,413);
    assert.equal((await call('/api/auth')).value.setupRequired,true);
    const homepage=await fetch(origin+'/');assert.equal(homepage.status,200);assert.match(await homepage.text(),/<html/);
    const stamp=await fetch(origin+'/stamps/hh.png');assert.equal(stamp.status,200);assert.match(stamp.headers.get('content-type'),/image/);
    let r=await call('/api/auth',{action:'setup',username:'tester',password:'Test-Passphrase-2026'});
    assert.equal(r.response.status,200);cookie=r.response.headers.get('set-cookie').split(';')[0];assert.match(r.response.headers.get('set-cookie'),/HttpOnly/);
    assert.equal((await call('/api/admin?action=settings')).value.publicOrigin,origin,'Bun .env loaded');
    assert.equal((await call('/api/auth',{action:'setup',username:'tester2',password:'Test-Passphrase-2026'})).response.status,409);
    assert.equal((await call('/api/admin',{action:'settings',publicOrigin:origin},{}, {Origin:'https://malicious.example'})).response.status,403);
    await call('/api/admin',{action:'settings',publicOrigin:origin,watermark:'扫码核验 · 以在线报价为准'});
    const data=fixture(30);
    r=await call('/api/admin',{action:'save',data});assert.equal(r.response.status,200);let q=r.value;assert.equal(q.revision,1);
    assert.equal((await call('/api/admin',{action:'save',id:q.id,revision:0,data})).response.status,409);
    assert.equal((await call('/api/admin',{action:'save',data:{...data,dataSource:[{...data.dataSource[0],price:-1}]}})).response.status,400);
    r=await call('/api/admin',{action:'publish',id:q.id});assert.equal(r.response.status,200,JSON.stringify(r.value));q=r.value;const v=q.versions[0];assert.equal(v.pdf_hash,'','publication does not generate a PDF');assert.equal(existsSync(join(storageDir,'pdf')),false);
    const pub=await call('/api/public/'+v.token,undefined,false);assert.equal(pub.response.status,200);assert.equal(pub.value.data.dataSource.length,30);assert.equal(pub.value.isLatest,true);
    const pdf=await call('/api/public/'+v.token+'?format=pdf',undefined,false);assert.equal(pdf.response.status,200);assert.match(pdf.response.headers.get('content-disposition'),/^attachment/);assert.match(pdf.value.subarray(0,8).toString(),/%PDF/);assert.ok((await call('/api/public/'+v.token,undefined,false)).value.pdfHashes.includes(digest(pdf.value)));assert.match(pdf.value.toString('latin1'),/ToUnicode/);
    assert.equal(existsSync(join(storageDir,'pdf')),false,'download does not store PDF files');
    await call('/api/admin',{action:'settings',publicOrigin:origin,watermark:'changed watermark'});
    assert.deepEqual((await call('/api/public/'+v.token+'?format=pdf',undefined,false)).value,pdf.value,'published watermark and PDF metadata remain fixed');
    const edited={...data,quotationAccepter:'改版客户'};
    q=(await call('/api/admin',{action:'save',id:q.id,revision:q.revision,data:edited})).value;
    assert.equal((await call('/api/public/'+v.token,undefined,false)).value.data.quotationAccepter,data.quotationAccepter);
    q=(await call('/api/admin',{action:'publish',id:q.id})).value;assert.equal(q.versions.length,2);assert.equal((await call('/api/public/'+v.token,undefined,false)).value.isLatest,false);
    await call('/api/admin',{action:'revoke',token:v.token});assert.equal((await call('/api/public/'+v.token,undefined,false)).response.status,410);assert.equal((await call('/api/public/'+v.token+'?format=pdf',undefined,false)).response.status,410);
    const long=fixture(75);
    const preview=await call('/api/preview',{data:long});assert.equal(preview.response.status,200,JSON.stringify(preview.value));
    assert.match(preview.value.subarray(0,8).toString(),/%PDF/);assert.equal(existsSync(join(storageDir,'pdf')),false,'draft download is not stored');
    assert.equal((await call('/api/preview',{data:long},false)).response.status,401);
    assert.equal((await call('/api/public/'+'0'.repeat(48),undefined,false)).response.status,404);
    assert.equal((await call('/api/admin?action=backup',undefined,false)).response.status,401);
    assert.equal((await call('/api/admin')).value.count,1);
    const backupDir=join(dir,'backup');
    const backup=spawn(command,['scripts/backup.mjs',backupDir],{cwd:runtimeDir,env:{...process.env,DATA_DIR:storageDir},stdio:'pipe'});
    const backupExit=await new Promise(r=>backup.on('exit',r));
    assert.equal(backupExit,0,'consistent full backup');
    assert.ok(existsSync(join(backupDir,'quotation.sqlite')));
    assert.equal(existsSync(join(backupDir,'pdf')),false,'backup contains database only');
    await stop();storageDir=backupDir;await start();
    assert.equal((await call('/api/auth')).value.setupRequired,false);
    assert.equal((await call('/api/admin')).value.count,1);
    const active=q.versions.find(v=>v.version===2);
    const restoredPdf=(await call('/api/public/'+active.token+'?format=pdf',undefined,false)).value;
    assert.ok((await call('/api/public/'+active.token,undefined,false)).value.pdfHashes.includes(digest(restoredPdf)));
    assert.equal(existsSync(join(backupDir,'pdf')),false,'PDF regenerated after database-only restore');
    await call('/api/auth',{action:'logout'});assert.equal((await call('/api/admin')).response.status,401);
  } finally {await stop();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});}
}
const localBun=resolve('node_modules/bun/bin/bun.exe');
const bun=process.env.BUN_BINARY||(process.platform==='win32'&&existsSync(localBun)?localBun:'bun');
test('Bun: BFF权限、SQLite持久化、固定版本、撤销和文字PDF',()=>runScenario(bun),{timeout:120000});
test('Bun 发布目录：脱离源码和开发依赖，发布、PDF、备份恢复',{timeout:120000},()=>runScenario(bun,true));
