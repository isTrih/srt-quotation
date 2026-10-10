import { useHonoContext } from '@modern-js/server-runtime';
import { requireAdmin, sameOrigin, body, fail } from '../_lib/auth.js';
import { validateData } from '../_lib/validation.js';
import { makePdf } from '../_lib/pdf.js';
export async function post() {
  const c=useHonoContext();
  try {
    requireAdmin(c);sameOrigin(c);
    const input=await body(c);
    const bytes=await makePdf(validateData(input.data),{watermark:'草稿 · 未发布'});
    c.header('Cache-Control','no-store');
    return new Response(bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store'}});
  } catch(error) {return fail(c,error);}
}
