import { resolve,join,relative } from 'node:path';
import { readFileSync,createReadStream,createWriteStream,readdirSync,mkdirSync,writeFileSync,statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
if(!process.versions.bun)throw new Error('请使用 Bun 执行此构建脚本');
const root=resolve(import.meta.dir,'..');
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const target=process.argv.find(v=>v.startsWith('--target='))?.slice(9)||('bun-'+(process.platform==='win32'?'windows':process.platform)+'-'+process.arch);
if(!/^bun-(linux|windows)-(x64|arm64)(-musl)?$/.test(target))throw new Error('支持的目标：bun-linux-x64、bun-linux-arm64、bun-windows-x64');
const dir=join(root,'output/binary-'+target+'-'+Date.now());mkdirSync(dir,{recursive:true});
const files=[];
function walk(base,local){for(const item of readdirSync(base,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const src=join(base,item.name),name=local+'/'+item.name;if(item.isDirectory())walk(src,name);else if(item.isFile()){if(item.name==='.env'||item.name.endsWith('.sqlite'))throw new Error('构建目录包含私密数据：'+name);files.push({src,name});}}}
for(const folder of ['.output','assets','public/stamps'])walk(join(root,folder),folder);
async function* frames(){for(const {src,name} of files){const path=Buffer.from(name),header=Buffer.alloc(8);header.writeUInt32LE(path.length,0);header.writeUInt32LE(statSync(src).size,4);yield header;yield path;for await(const chunk of createReadStream(src))yield chunk;}}
await pipeline(Readable.from(frames()),createGzip({level:6}),createWriteStream(join(dir,'payload.bin')));
const launchPath=relative(dir,join(root,'scripts/executable-entry.mjs')).replaceAll('\\','/');
writeFileSync(join(dir,'entry.mjs'),`import payload from './payload.bin' with {type:'file'};\nimport {launch} from '${launchPath}';\nlaunch(payload,${JSON.stringify(pkg.version)}).catch(error=>{console.error(error);process.exit(1);});\n`);
const executable=join(root,'output','srt-quotation-'+target+(target.includes('windows')?'.exe':''));
const result=await Bun.build({entrypoints:[join(dir,'entry.mjs')],compile:{target,outfile:executable},minify:true,bytecode:true});
if(!result.success)throw new AggregateError(result.logs,'Bun 二进制编译失败');
writeFileSync(join(root,'output/binary-build.json'),JSON.stringify({binary:relative(root,executable).replaceAll('\\','/'),target,version:pkg.version,created:new Date().toISOString(),files:files.length},null,2)+'\n');
console.log('可执行文件：'+executable+'\n内置资源：'+files.length+' 个文件\n外部数据目录：DATA_DIR（默认 ./data）');
