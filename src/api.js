export async function request(path,options={}) {
  const response=await fetch(path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(!response.ok) {
    let message;try {message=(await response.json()).error;}catch{}
    if(response.status===401) window.dispatchEvent(new Event('quote-session-expired'));
    throw new Error(message||'请求失败，请稍后重试');
  }
  return response.json();
}
export const adminGet = (params) => request('/api/admin?'+new URLSearchParams(params));
export const adminPost = (input) => request('/api/admin',{method:'POST',body:JSON.stringify(input)});
export function downloadBlob(blob,name) {
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
