import { localFetch as fetch } from './http-client.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,chmodSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultData,normalizeData } from '../shared/quotation.js';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
test('Docker: 非 root、网页资源、SQLite、文字 PDF、备份及重启持久化',{timeout:120000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'quote-docker-'));
  const storage=join(dir,'data');mkdirSync(storage);chmodSync(dir,0o755);chmodSync(storage,0o777);
  const name='quotation-smoke-'+Date.now();
  const image=process.env.DOCKER_TEST_IMAGE||'quotation-smoke:local';
  let origin,cookie='',started=false;
  const ready=async()=>{
    for(let i=0;i<100;i++){
      try{if((await fetch(origin+'/api/health',{headers:{Connection:'close'}})).ok)return;}catch{}
      await new Promise(r=>setTimeout(r,150));
    }
    assert.fail('Container not ready: '+docker('logs',name));
  };
  const call=async(path,body,auth=true)=>{
    const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Connection:'close',...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(auth&&cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
    const v=(r.headers.get('content-type')||'').includes('application/pdf')?Buffer.from(await r.arrayBuffer()):await r.json();return {r,v};
  };
  try {
    docker('run','-d','--name',name,'--memory','384m','--cap-drop=ALL','--security-opt=no-new-privileges:true','-p','127.0.0.1::8080','-v',storage+':/app/data','-e','COOKIE_SECURE=false',image);
    started=true;
    const mapped=docker('port',name,'8080/tcp');origin='http://'+mapped.split('\n')[0];await ready();
    assert.equal(docker('inspect','--format','{{.Config.User}}',name),'10001:10001');
    assert.equal((await call('/api/admin',undefined,false)).r.status,401);
    const html=await fetch(origin+'/');assert.equal(html.status,200);assert.match(await html.text(),/<html/);
    const stamp=await fetch(origin+'/stamps/hh.png');assert.match(stamp.headers.get('content-type'),/^image\/png/);
    const setup=await call('/api/auth',{action:'setup',username:'docker-tester',password:'Docker-Test-Passphrase-2026'});assert.equal(setup.r.status,200);cookie=setup.r.headers.get('set-cookie').split(';')[0];
    await call('/api/admin',{action:'settings',publicOrigin:origin});
    const data=normalizeData({...defaultData,dataSource:Array.from({length:30},(_,i)=>({id:'docker-'+i,no:String(i+1),name:'精密轴承',model:'SKF-6205',unit:'件',quantity:1,price:18.5}))});
    const saved=await call('/api/admin',{action:'save',data});assert.equal(saved.r.status,200);
    const published=await call('/api/admin',{action:'publish',id:saved.v.id});assert.equal(published.r.status,200);const version=published.v.versions[0];assert.equal(version.pdf_hash,'');
    const publicQuote=await call('/api/public/'+version.token,undefined,false);assert.equal(publicQuote.v.data.dataSource.length,30);
    const pdf=await call('/api/public/'+version.token+'?format=pdf',undefined,false);assert.equal(pdf.r.status,200);assert.match(pdf.r.headers.get('content-disposition'),/^attachment/);assert.match(pdf.v.toString('latin1'),/ToUnicode/);const pdfHash=createHash('sha256').update(pdf.v).digest('hex');assert.ok((await call('/api/public/'+version.token,undefined,false)).v.pdfHashes.includes(pdfHash));
    docker('exec',name,'bun','scripts/backup.mjs');
    const backupCheck=docker('exec',name,'bun','-e',`const fs=require('node:fs');const p='/app/data/backups/'+fs.readdirSync('/app/data/backups')[0];console.log(JSON.stringify([fs.existsSync(p+'/quotation.sqlite'),fs.existsSync('/app/data/pdf')]))`);assert.deepEqual(JSON.parse(backupCheck),[true,false]);
    docker('restart',name);await ready();assert.equal((await call('/api/auth')).v.setupRequired,false);assert.equal((await call('/api/admin')).v.count,1);
    assert.equal(createHash('sha256').update((await call('/api/public/'+version.token+'?format=pdf',undefined,false)).v).digest('hex'),pdfHash);
    console.log('Docker smoke passed: '+image);
    console.log('Image bytes: '+docker('image','inspect','--format','{{.Size}}',image));
    console.log('Container memory after PDF download: '+docker('stats','--no-stream','--format','{{.MemUsage}}',name));
  } finally {
    if(started){
      // The mount belongs only to this generated test directory. Clean private backup files as their application owner.
      try{docker('exec',name,'bun','-e',"const fs=require('node:fs');for(const f of fs.readdirSync('/app/data'))fs.rmSync('/app/data/'+f,{recursive:true,force:true})");}catch{}
      try{docker('rm','-f',name);}catch{}
    }
    // Only remove the temporary directory created by this test.
    assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});
  }
});
