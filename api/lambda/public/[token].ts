import { useHonoContext } from '@modern-js/server-runtime';
import { publicVersion, pdfBytes } from '../../_lib/quotes.js';
import { fail } from '../../_lib/auth.js';
export async function get(token:string) {
  const c=useHonoContext();
  c.header('Cache-Control','no-store');
  c.header('X-Robots-Tag','noindex, nofollow');
  try {
    const version=publicVersion(token);
    if(c.req.query('format')==='pdf') {
      return new Response(await pdfBytes(token),{headers:{
        'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+version.number+'-V'+version.version+'.pdf"',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      }});
    }
    return version;
  } catch(error) {return fail(c,error);}
}
