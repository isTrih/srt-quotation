import React,{useEffect,useState} from 'react';
import { request } from './api';
import QuoteDocument from './QuoteDocument';
import './style.css';
import './workspace.css';
export default function PublicQuote() {
  const token=window.location.pathname.split('/').filter(Boolean).pop();
  const [quote,setQuote]=useState(null),[error,setError]=useState(''),[check,setCheck]=useState(''),[checking,setChecking]=useState(false);
  useEffect(()=>{request('/api/public/'+encodeURIComponent(token)).then(setQuote).catch(e=>setError(e.message));},[token]);
  async function verify(e) {
    const file=e.target.files?.[0];if(!file)return;
    setChecking(true);
    try{
      if(!crypto.subtle)throw new Error('文件校验需要 HTTPS 或本机 localhost 地址，请使用安全访问地址');
      if(file.size>20*1024*1024)throw new Error('请选择20MB以内的PDF');
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      const actual=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
      const latest=await request('/api/public/'+encodeURIComponent(token));setQuote(latest);
      setCheck(latest.pdfHashes.includes(actual)?'校验通过：与该版本的下载文件校验码一致。':'校验不一致：没有匹配的下载记录，请重新下载该版本对照。');
    }catch(err){setCheck(err.message);}finally{setChecking(false);e.target.value='';}
  }
  if(error)return <main className="auth-screen"><section className="auth-card"><span className="brand-mark">报</span><h1>无法查看报价</h1><p role="alert">{error}</p><p>请联系报价方确认链接或获取最新版本。</p></section></main>;
  if(!quote)return <main className="auth-screen">正在读取报价…</main>;
  const d=quote.data;
  return <main className="public-page"><header className="public-heading"><div><div className="eyebrow">VERIFIED QUOTATION</div><h1>报价单</h1><p>{quote.number} · V{quote.version}</p></div><a className="primary-button" href={'/api/public/'+token+'?format=pdf'} download>生成并下载 PDF</a></header>
    <div className={'public-status '+(!quote.isLatest?'older':'')}><strong>{quote.isLatest?'已发布的有效版本':'这是历史发布版本'}</strong><span>{quote.isLatest?'由报价方发布，内容已固定。':'报价方已经发布更新的版本，请联系报价方确认。'}</span></div>
    <QuoteDocument data={d}/>
    <section className="verification-panel"><div><div className="eyebrow">DOCUMENT VERIFICATION</div><h2>下载文件核验</h2><p>选择收到的PDF，在本机计算SHA-256并比对下载校验码，文件无需上传。服务器不保存PDF。</p></div>
      <label className="secondary-button verify-picker">{checking?'正在校验…':'选择 PDF 校验'}<input type="file" accept="application/pdf,.pdf" onChange={verify} disabled={checking} hidden/></label>{check&&<p className={'verify-result '+(check.startsWith('校验通过')?'pass':'error')} role="status">{check}</p>}
      <details><summary>查看校验信息</summary><div className="hash-detail"><p>内容校验码</p><code>{quote.contentHash}</code><p>最近一次下载的 PDF SHA-256</p><code>{quote.pdfHash||'首次下载后生成'}</code><p>发布于 {new Date(quote.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p><p>文件不一致也可能由重新保存或压缩导致。请对照在线报价确认；水印和图像公章不是数字签名。</p></div></details>
    </section><footer className="public-footer">正经报价 · 扫码核验，以在线报价为准</footer>
  </main>;
}
