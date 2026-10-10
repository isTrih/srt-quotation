import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataDir, query, transaction, audit, settings } from './db.js';
import { HttpError, hash, checkCredentials, encodePassword, matchesPassword } from './auth.js';
import { validateData, validatePublication, totalAmount, contentHash, originFor } from './validation.js';
import { makePdf } from './pdf.js';
const pdfDir = resolve(dataDir,'pdf');
mkdirSync(pdfDir,{recursive:true});
let publishing = false;
export const pdfPath = token => {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new HttpError(404,'报价链接不存在');
  return resolve(pdfDir,token+'.pdf');
};
function quote(id) {
  const result = query('SELECT * FROM quotes WHERE id=?').get(String(id));
  if (!result) throw new HttpError(404,'报价单不存在');
  return result;
}
function versions(id) {
  return query('SELECT token,version,content_hash,pdf_hash,url,created,revoked FROM versions WHERE quote_id=? ORDER BY version DESC').all(id);
}
export function detail(id) {
  const q=quote(id);
  return {...q,data:JSON.parse(q.data),versions:versions(id),audit:query('SELECT action,at FROM audit WHERE quote_id=? ORDER BY id DESC LIMIT 30').all(id)};
}
export function list({search='',page=1,archived='0'} = {}) {
  page = Math.max(1,Math.min(100000,Number(page)||1));
  search = String(search).slice(0,200);
  const where='WHERE archived=? AND (title LIKE ? OR customer LIKE ? OR number LIKE ?)';
  const args=[archived==='1'?1:0,'%'+search+'%','%'+search+'%','%'+search+'%'];
  return {
    items:query('SELECT id,number,title,customer,total,revision,archived,created,updated,(SELECT COUNT(*) FROM versions v WHERE v.quote_id=quotes.id AND revoked=0) AS published '+ 'FROM quotes '+where+' ORDER BY updated DESC LIMIT 20 OFFSET ?').all(...args,(page-1)*20),
    count:query('SELECT COUNT(*) AS n FROM quotes '+where).get(...args).n,
    page,
  };
}
export function save(input) {
  const data=validateData(input.data);
  const title=String(input.title||data.quotationAccepter||'未命名报价').trim().slice(0,150);
  const now=new Date().toISOString();
  return transaction(()=>{
    let id=input.id;
    if (id) {
      const old=quote(id);
      if (old.revision!==input.revision) throw new HttpError(409,'报价已在其他窗口修改，请重新打开历史记录后再保存');
      if (old.archived) throw new HttpError(409,'请先恢复已归档报价');
      query('UPDATE quotes SET title=?,customer=?,total=?,data=?,revision=revision+1,updated=? WHERE id=?').run(title,data.quotationAccepter,totalAmount(data),JSON.stringify(data),now,id);
    } else {
      id=randomUUID();
      const count=query('SELECT COUNT(*) AS n FROM quotes').get().n+1;
      const number='Q-'+data.quotationDate.replaceAll('-','')+'-'+String(count).padStart(4,'0');
      query('INSERT INTO quotes(id,number,title,customer,total,data,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(id,number,title,data.quotationAccepter,totalAmount(data),JSON.stringify(data),now,now);
    }
    audit(id,'保存草稿'); return detail(id);
  });
}
export async function publish(id) {
  if (publishing) throw new HttpError(429,'正在发布报价，请稍后重试');
  publishing=true;
  let path, inserted=false;
  try {
    const q=quote(id);
    if (q.archived) throw new HttpError(409,'请先恢复已归档报价');
    const data=JSON.parse(q.data);
    validatePublication(data);
    const config=settings();
    const origin=originFor(config.publicOrigin || process.env.PUBLIC_ORIGIN);
    if (!origin) throw new HttpError(400,'请先在系统设置填写在线访问地址，二维码将使用这个地址');
    const token=randomBytes(24).toString('hex');
    const version=(query('SELECT MAX(version) AS n FROM versions WHERE quote_id=?').get(id).n||0)+1;
    const created=new Date().toISOString(), url=origin+'/q/'+token, digest=contentHash(data);
    const bytes=await makePdf(data,{number:q.number,version,created,url,contentHash:digest,watermark:config.watermark});
    path=pdfPath(token);
    writeFileSync(path,bytes,{flag:'wx',mode:0o600});
    transaction(()=>{
      if (quote(id).revision!==q.revision) throw new HttpError(409,'生成期间草稿被修改，请重新发布');
      query('INSERT INTO versions(token,quote_id,version,data,content_hash,pdf_hash,url,created) VALUES(?,?,?,?,?,?,?,?)').run(token,id,version,JSON.stringify(data),digest,hash(bytes),url,created);
      audit(id,'发布 V'+version); inserted=true;
    });
    return detail(id);
  } finally {
    if(path&&!inserted) { try {unlinkSync(path);} catch{} }
    publishing=false;
  }
}
export function publicVersion(token) {
  pdfPath(token);
  const v=query('SELECT v.*,q.number,(SELECT MAX(version) FROM versions WHERE quote_id=v.quote_id AND revoked=0) AS latest FROM versions v JOIN quotes q ON q.id=v.quote_id WHERE token=?').get(token);
  if (!v) throw new HttpError(404,'报价链接不存在');
  if (v.revoked) throw new HttpError(410,'该版本已撤销，请联系报价方获取新的报价');
  return {token:v.token,number:v.number,version:v.version,data:JSON.parse(v.data),contentHash:v.content_hash,pdfHash:v.pdf_hash,url:v.url,created:v.created,isLatest:v.version===v.latest};
}
export function pdfBytes(token) { publicVersion(token); return readFileSync(pdfPath(token)); }
export async function mutate(input) {
  if(input.action==='save') return save(input);
  if(input.action==='publish') return publish(String(input.id));
  if(input.action==='revoke') {
    const v=query('SELECT quote_id,version FROM versions WHERE token=?').get(String(input.token));
    if(!v) throw new HttpError(404,'报价版本不存在');
    transaction(()=>{query('UPDATE versions SET revoked=1 WHERE token=?').run(input.token);audit(v.quote_id,'撤销 V'+v.version);});
    return detail(v.quote_id);
  }
  if(input.action==='archive'||input.action==='restore') {
    quote(input.id);
    transaction(()=>{query('UPDATE quotes SET archived=?,updated=? WHERE id=?').run(input.action==='archive'?1:0,new Date().toISOString(),input.id);audit(input.id,input.action==='archive'?'归档报价':'恢复报价');});
    return {ok:true};
  }
  if(input.action==='settings') {
    const publicOrigin=originFor(String(input.publicOrigin||'').trim());
    const watermark=String(input.watermark||'').trim().slice(0,80);
    query('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify({publicOrigin,watermark}));
    return settings();
  }
  if(input.action==='password') {
    const admin=query('SELECT * FROM admin WHERE id=1').get();
    if(!await matchesPassword(input.currentPassword||'',admin.password)) throw new HttpError(400,'当前密码不正确');
    checkCredentials(admin.username,input.password);
    const encoded=await encodePassword(input.password);
    transaction(()=>{query('UPDATE admin SET password=? WHERE id=1').run(encoded);query('DELETE FROM sessions').run();});
    return {ok:true};
  }
  throw new HttpError(400,'操作无效');
}
