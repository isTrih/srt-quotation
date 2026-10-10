import { Database } from 'bun:sqlite';
import { resolve,join } from 'node:path';
import { mkdirSync,existsSync } from 'node:fs';
export function backup(dataDir, destination) {
  dataDir=resolve(dataDir);
  if(!existsSync(join(dataDir,'quotation.sqlite')))throw new Error('未找到数据库，请确认 DATA_DIR');
  const target=resolve(destination||join(dataDir,'backups',new Date().toISOString().replaceAll(':','-')));
  mkdirSync(target,{recursive:true,mode:0o700});
  const db=new Database(join(dataDir,'quotation.sqlite'));
  try{
    db.exec('PRAGMA busy_timeout=5000');
    db.query('VACUUM INTO ?').run(join(target,'quotation.sqlite'));
  }finally{db.close();}
  console.log('完整备份已保存：'+target);
  return target;
}
