import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
const directory=resolve('output','runtime-'+Date.now());
mkdirSync(directory,{recursive:true});
// Dereference Modern.js workspace links so the release needs no source checkout.
for(const source of ['.output','assets/fonts','public/stamps'])cpSync(resolve(source),join(directory,source),{recursive:true,dereference:true});
mkdirSync(join(directory,'scripts'));
for(const source of ['backup.mjs','backup-lib.mjs'])cpSync(resolve('scripts',source),join(directory,'scripts',source));
writeFileSync(join(directory,'package.json'),JSON.stringify({name:'srt-quotation',version:JSON.parse(readFileSync('package.json')).version,private:true,type:'module',scripts:{start:'bun .output/index.js',backup:'bun scripts/backup.mjs'}},null,2));
function size(path){const st=statSync(path);return st.isDirectory()?readdirSync(path).reduce((n,f)=>n+size(join(path,f)),0):st.size;}
const bytes=size(directory);
writeFileSync(resolve('output/runtime-build.json'),JSON.stringify({directory,bytes,buildTime:new Date().toISOString()},null,2));
console.log(`Bun runtime release: ${directory} (${(bytes/1024/1024).toFixed(1)} MiB)`);
