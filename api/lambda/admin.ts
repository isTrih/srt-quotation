import { useHonoContext } from '@modern-js/server-runtime';
import { requireAdmin, sameOrigin, body, fail, HttpError } from '../_lib/auth.js';
import { list, detail, mutate } from '../_lib/quotes.js';
import { query, settings } from '../_lib/db.js';
export async function get() {
  const c=useHonoContext();
  c.header('Cache-Control','no-store');
  try {
    requireAdmin(c);
    const action=c.req.query('action');
    if(action==='detail') return detail(c.req.query('id'));
    if(action==='settings') return {...settings(),username:query('SELECT username FROM admin WHERE id=1').get().username};
    if(action==='customers') return query('SELECT data FROM quotes ORDER BY updated DESC LIMIT 100').all().map(q=>{
      const d=JSON.parse(String(q.data));return {quotationAccepter:d.quotationAccepter,quotationAccepterName:d.quotationAccepterName,quotationAccepterPhone:d.quotationAccepterPhone};
    });
    if(action==='backup') {
      const quotes=query('SELECT * FROM quotes ORDER BY created').all();
      return c.json({format:'quotation-backup-v2',created:new Date().toISOString(),quotes:quotes.map(q=>({...q,data:JSON.parse(String(q.data))})),versions:query('SELECT * FROM versions ORDER BY created').all(),pdfDownloadHashes:query('SELECT * FROM pdf_download_hashes ORDER BY created').all(),settings:settings()});
    }
    if(action && action!=='list') throw new HttpError(400,'操作无效');
    return list(c.req.query());
  } catch(error) {return fail(c,error);}
}
export async function post() {
  const c=useHonoContext();
  c.header('Cache-Control','no-store');
  try {requireAdmin(c);sameOrigin(c);return await mutate(await body(c));}
  catch(error) {return fail(c,error);}
}
