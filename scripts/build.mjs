import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve,dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const toolsPackage=resolve(root,'node_modules/@modern-js/app-tools/package.json');
const tools=JSON.parse(readFileSync(toolsPackage,'utf8'));
const modern=resolve(dirname(toolsPackage),typeof tools.bin==='string'?tools.bin:tools.bin.modern);
// Modern.js build tooling uses its supported Node runtime; the deployed server uses Bun.
const run=(entry,args=[])=>execFileSync('node',[entry,...args],{cwd:root,stdio:'inherit'});
run(require.resolve('typescript/bin/tsc'),['--noEmit']);
run(modern,['deploy']);
await import('./build-binary.mjs');
