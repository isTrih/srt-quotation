import { defineServerConfig } from '@modern-js/server-runtime';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bodyLimit } from 'hono/body-limit';
const limit = bodyLimit({maxSize:1024*1024,onError:c=>c.json({error:'请求内容超过1MB，请减少报价行'},413)});
export default defineServerConfig({
  middlewares:[{
    name:'quotation-request-limits',
    order:'pre',
    handler:async(c,next)=>{
      c.header('X-Content-Type-Options','nosniff');
      c.header('Referrer-Policy','no-referrer');
      if(c.req.path==='/stamps/hh.png'||c.req.path==='/stamps/ft.png')return new Response(new Uint8Array(readFileSync(resolve('public/stamps',c.req.path.split('/').pop()))),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
      if(c.req.path.startsWith('/q/'))c.header('X-Robots-Tag','noindex, nofollow');
      if(c.req.path.startsWith('/api'))return limit(c as any,next);
      return next();
    },
  }],
});
