import { existsSync,mkdirSync,mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { dirname,resolve,join,sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { backup } from './backup-lib.mjs';
export async function launch(payload,version) {
  const cwd=process.cwd();
  if(existsSync(resolve(cwd,'.env')))process.loadEnvFile(resolve(cwd,'.env'));
  const dataDir=resolve(cwd,process.env.DATA_DIR||'data');
  process.env.DATA_DIR=dataDir;
  process.env.PORT ||= '8080';
  process.env.NODE_ENV ||= 'production';
  const args=process.argv.slice(2);
  if(args[0]==='--version'){console.log('srt-quotation '+version+' / Bun '+Bun.version);return;}
  if(args[0]==='--healthcheck'){
    try{const r=await fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{signal:AbortSignal.timeout(4000)});process.exit(r.ok?0:1);}catch{process.exit(1);}
  }
  if(args[0]==='--backup'){backup(dataDir,args[1]?resolve(cwd,args[1]):undefined);return;}
  const scratchBase=resolve(process.env.RUNTIME_TMP_DIR||tmpdir());
  mkdirSync(scratchBase,{recursive:true});
  const scratch=mkdtempSync(join(scratchBase,'srt-quotation-runtime-'));
  const cleanup=()=>{
    // Only remove the private runtime directory created by this process.
    if(scratch.startsWith(scratchBase+sep)&&dirname(scratch)===scratchBase)try{rmSync(scratch,{recursive:true,force:true});}catch{}
  };
  process.once('exit',cleanup);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>process.exit(0));
  const source=Readable.fromWeb(Bun.file(payload).stream()).pipe(createGunzip());
  const iterator=source[Symbol.asyncIterator]();
  let pending=Buffer.alloc(0);
  async function read(size,allowEnd=false){
    while(pending.length<size){const next=await iterator.next();if(next.done){if(allowEnd&&!pending.length)return null;throw new Error('内置运行资源不完整');}pending=Buffer.concat([pending,next.value]);}
    const result=pending.subarray(0,size);pending=pending.subarray(size);return result;
  }
  try{
    for(;;){
      const header=await read(8,true);if(!header)break;
      const pathSize=header.readUInt32LE(0),fileSize=header.readUInt32LE(4);
      if(pathSize>4096||fileSize>64*1024*1024)throw new Error('内置资源格式无效');
      const name=(await read(pathSize)).toString('utf8');
      if(name.includes('\\')||name.split('/').includes('..'))throw new Error('内置资源路径无效');
      const target=resolve(scratch,name);
      if(!target.startsWith(scratch+sep))throw new Error('内置资源路径超出运行目录');
      mkdirSync(dirname(target),{recursive:true});writeFileSync(target,await read(fileSize));
    }
    pending=null;
    process.chdir(scratch);
    await import(pathToFileURL(join(scratch,'.output/index.js')).href);
  }catch(error){cleanup();throw error;}
}
