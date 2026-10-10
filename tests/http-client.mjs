import { request } from 'node:http';
// Each request gets a new connection: test servers are stopped and restarted at the same URL.
export function localFetch(url, options={}) {
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:options.method||'GET',headers:options.headers,agent:false},response=>{
      const chunks=[];response.on('data',bytes=>chunks.push(bytes));response.on('error',reject);
      response.on('end',()=>{
        const headers=new Headers();
        for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
        resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers}));
      });
    });
    req.on('error',error=>{error.message=(options.method||'GET')+' '+url+': '+error.message;reject(error);});
    req.setTimeout(20000,()=>req.destroy(new Error('Request timed out')));
    req.end(options.body);
  });
}
