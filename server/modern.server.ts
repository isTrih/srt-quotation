import { defineServerConfig } from '@modern-js/server-runtime';
import { bodyLimit } from 'hono/body-limit';
const limit = bodyLimit({maxSize:1024*1024,onError:c=>c.json({error:'请求内容超过1MB，请减少报价行'},413)});
export default defineServerConfig({
  middlewares:[{
    name:'quotation-request-limits',
    order:'pre',
    handler:async(c,next)=>{
      c.header('X-Content-Type-Options','nosniff');
      c.header('Referrer-Policy','no-referrer');
      if(c.req.path.startsWith('/q/'))c.header('X-Robots-Tag','noindex, nofollow');
      if(c.req.path.startsWith('/api'))return limit(c as any,next);
      return next();
    },
  }],
});
