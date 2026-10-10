import React, { useEffect, useState, useRef } from 'react';
import Editor from './Editor';
import { request, adminGet, adminPost, downloadBlob } from './api';
import { loadData, normalizeData, newRow, todayInput, newStampSeed, defaultTaxRates, money } from './quotation';
import './style.css';
import './workspace.css';
const date = value => new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
function Auth({ setupRequired, onDone }) {
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e) {
    e.preventDefault();setError('');
    if(setupRequired&&password!==repeat) {setError('两次输入的密码不一致');return;}
    setBusy(true);
    try {await request('/api/auth',{method:'POST',body:JSON.stringify({action:setupRequired?'setup':'login',username,password})});onDone();}
    catch(err){setError(err.message);} finally{setBusy(false);}
  }
  return <main className="auth-screen"><section className="auth-card">
    <span className="brand-mark">报</span><div className="eyebrow">QUOTATION WORKSPACE</div>
    <h1>{setupRequired?'设置管理员':'欢迎回来'}</h1><p>{setupRequired?'首次使用，为内部工作台创建唯一的管理员账户。':'登录后管理草稿、历史报价和发布版本。'}</p>
    <form onSubmit={submit}>
      <label className="field"><span>管理员账号</span><input required minLength={3} maxLength={40} autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="3位以上英文或数字"/></label>
      <label className="field"><span>密码</span><input required type="password" minLength={setupRequired?12:1} maxLength={128} autoComplete={setupRequired?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={setupRequired?'至少12位':'请输入密码'}/></label>
      {setupRequired&&<label className="field"><span>确认密码</span><input required type="password" autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>}
      {error&&<p className="error" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy?'处理中…':setupRequired?'创建账户并进入':'登录工作台'}</button>
    </form><small>访客通过专属链接查看报价，无需登录。</small>
  </section></main>;
}
function VersionList({record,onChange,onError}) {
  if(!record) return null;
  return <section className="publication-panel">
    <div><span className="eyebrow">PUBLISHED VERSIONS</span><h2>已发布版本</h2><p>分享固定版本；编辑草稿不会改变已发出的报价。</p></div>
    {!record.versions?.length&&<p className="empty-note">尚未发布。确认内容后点击“发布报价”。</p>}
    {record.versions?.map(v=><div className="version-card" key={v.token}>
      <div><strong>V{v.version}</strong><span className={'badge '+(v.revoked?'muted':'success')}>{v.revoked?'已撤销':'可访问'}</span><small>{date(v.created)}</small><code>{v.content_hash.slice(0,16)}</code></div>
      <div className="version-actions">
        {!v.revoked&&<><a className="secondary-button" href={'/q/'+v.token} target="_blank" rel="noreferrer">查看在线报价</a>
          <button className="secondary-button" onClick={async()=>{try{await navigator.clipboard.writeText(v.url);onError('访客链接已复制');}catch{onError('无法复制，请手动复制下方地址');}}}>复制链接</button>
          <a className="primary-button" href={'/api/public/'+v.token+'?format=pdf'} download>生成并下载 PDF</a>
          <button className="text-button danger" onClick={async()=>{if(!window.confirm('撤销 V'+v.version+'？访客链接和PDF下载将立即停止访问。'))return;try{onChange(await adminPost({action:'revoke',token:v.token}));}catch(e){onError(e.message);}}}>撤销访问</button></>}
      </div><input aria-label={'V'+v.version+'访客地址'} value={v.url} readOnly onFocus={e=>e.target.select()}/>
    </div>)}
    {record.audit?.length>0&&<details><summary>操作记录</summary><ul className="audit-list">{record.audit.map((a,i)=><li key={i}><span>{a.action}</span><time>{date(a.at)}</time></li>)}</ul></details>}
  </section>;
}
function History({onOpen,onNew,onNotice}) {
  const [search,setSearch]=useState(''),[page,setPage]=useState(1),[archived,setArchived]=useState(false);
  const [result,setResult]=useState({items:[],count:0}),[loading,setLoading]=useState(true),[tick,setTick]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);
    const timer=setTimeout(()=>adminGet({search,page,archived:archived?'1':'0'}).then(r=>{if(active)setResult(r);}).catch(e=>{if(active)onNotice(e.message);}).finally(()=>{if(active)setLoading(false);}),180);
    return()=>{active=false;clearTimeout(timer);};
  },[search,page,archived,tick]);
  return <main className="dashboard">
    <div className="page-heading"><div><div className="eyebrow">QUOTE LIBRARY</div><h1>历史报价</h1><p>草稿与正式版本都在这里，随时继续编辑。</p></div><button className="primary-button" onClick={onNew}>＋ 新建报价</button></div>
    <div className="history-tools"><input aria-label="搜索报价" placeholder="搜索客户、标题或报价编号" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/><button className="secondary-button" aria-pressed={archived} onClick={()=>{setArchived(!archived);setPage(1);}}>{archived?'查看进行中':'查看已归档'}</button><span>{result.count}份报价</span></div>
    {loading?<p className="empty-note">正在读取报价…</p>:!result.items.length?<div className="empty-state"><span>▤</span><h2>这里还没有报价</h2><p>保存第一份草稿，建立你的报价记录。</p><button className="primary-button" onClick={onNew}>创建报价单</button></div>:
      <div className="history-list">{result.items.map(q=><article className="history-card" key={q.id}>
        <div><div><code>{q.number}</code><span className={'badge '+(q.published?'success':'muted')}>{q.published?'已发布':'草稿'}</span></div><h2>{q.title}</h2><p>{q.customer||'未填写客户'} · 更新于 {date(q.updated)}</p></div>
        <strong className="history-amount">¥{money(q.total)}</strong><div className="history-actions"><button className="secondary-button" onClick={()=>onOpen(q.id)}>打开报价</button><button className="text-button" onClick={async()=>{try{await adminPost({action:archived?'restore':'archive',id:q.id});setTick(tick+1);onNotice(archived?'已恢复':'已归档，已发布链接仍可访问');}catch(e){onNotice(e.message);}}}>{archived?'恢复':'归档'}</button></div>
      </article>)}</div>}
    <div className="pagination-controls"><button className="secondary-button" disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</button><span>{page} / {Math.max(1,Math.ceil(result.count/20))}</span><button className="secondary-button" disabled={page*20>=result.count} onClick={()=>setPage(page+1)}>下一页</button></div>
  </main>;
}
function Settings({onNotice,onLogout}) {
  const [config,setConfig]=useState(null),[busy,setBusy]=useState(false);
  const [currentPassword,setCurrentPassword]=useState(''),[password,setPassword]=useState('');
  useEffect(()=>{adminGet({action:'settings'}).then(setConfig).catch(e=>onNotice(e.message));},[]);
  if(!config)return <main className="dashboard">正在读取设置…</main>;
  return <main className="dashboard settings-page"><div className="page-heading"><div><div className="eyebrow">WORKSPACE SETTINGS</div><h1>系统设置</h1><p>配置在线报价地址、核验水印与管理员账户。</p></div></div>
    <section className="panel"><h2>在线报价与水印</h2><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await adminPost({action:'settings',...config});onNotice('系统设置已保存');}catch(err){onNotice(err.message);}finally{setBusy(false);}}}>
      <label className="field"><span>在线访问地址</span><input required type="url" value={config.publicOrigin} onChange={e=>setConfig({...config,publicOrigin:e.target.value})} placeholder="https://quote.example.com"/></label><p className="help">正式发布的链接和二维码使用此地址。可在本机测试时填写当前地址：{window.location.origin}。修改地址只影响新版本。</p>
      <label className="field"><span>PDF 水印文字</span><input maxLength={80} value={config.watermark} onChange={e=>setConfig({...config,watermark:e.target.value})}/></label><p className="help">留空关闭水印。水印提示访客核验，下载文件是否改动由校验码判断。</p>
      <button className="primary-button" disabled={busy}>保存设置</button>
    </form></section>
    <section className="panel"><h2>管理员账户 · {config.username}</h2><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await adminPost({action:'password',currentPassword,password});onNotice('密码已更新，请重新登录');onLogout();}catch(err){onNotice(err.message);}finally{setBusy(false);}}}>
      <div className="field-grid"><label className="field"><span>当前密码</span><input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label className="field"><span>新密码</span><input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label></div><button className="secondary-button" disabled={busy}>更新密码并退出</button>
    </form></section>
    <section className="panel"><h2>数据备份</h2><p className="help">下载报价数据用于离线留档。服务器完整恢复只需备份持久目录中的 SQLite 数据库，具体操作见部署说明。</p><button className="secondary-button" onClick={async()=>{try{const data=await adminGet({action:'backup'});downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'报价历史-'+todayInput()+'.json');onNotice('报价历史已导出');}catch(e){onNotice(e.message);}}}>导出全部报价数据</button></section>
  </main>;
}
export default function Workspace() {
  const [auth,setAuth]=useState(null),[view,setView]=useState('editor'),[error,setError]=useState('');
  const [record,setRecord]=useState(null),[initialData,setInitialData]=useState(null),[key,setKey]=useState(0),[busy,setBusy]=useState(false);
  const saving=useRef(false);
  async function refreshAuth() {try{setAuth(await request('/api/auth'));setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{refreshAuth();const expired=()=>setAuth({authenticated:false,setupRequired:false});window.addEventListener('quote-session-expired',expired);return()=>window.removeEventListener('quote-session-expired',expired);},[]);
  useEffect(()=>{
    if(!auth?.authenticated)return;
    const id=localStorage.getItem('quotationActiveQuote');
    if(id)adminGet({action:'detail',id}).then(r=>{setRecord(r);setInitialData(loadData());setKey(k=>k+1);}).catch(()=>localStorage.removeItem('quotationActiveQuote'));
  },[auth?.authenticated]);
  const notice = text => setError(text);
  const newQuote=()=>{
    setRecord(null);localStorage.removeItem('quotationActiveQuote');
    setInitialData(normalizeData({quotationOffer:'hh',quotationAccepter:'',quotationAccepterName:'',quotationAccepterPhone:'',quotationDate:todayInput(),taxRates:defaultTaxRates,stampSeed:newStampSeed(),dataSource:[newRow(1)]}));
    setKey(k=>k+1);setView('editor');setError('');
  };
  async function openQuote(id) {try{const r=await adminGet({action:'detail',id});setRecord(r);setInitialData(r.data);setKey(k=>k+1);setView('editor');localStorage.setItem('quotationActiveQuote',id);setError('');}catch(e){notice(e.message);}}
  async function save(data,publish=false) {
    if(saving.current)throw new Error('正在保存，请稍后重试');
    saving.current=true;setBusy(true);
    try {
      let r=await adminPost({action:'save',id:record?.id,revision:record?.revision,data});
      setRecord(r);localStorage.setItem('quotationActiveQuote',r.id);
      if(publish){r=await adminPost({action:'publish',id:r.id});setRecord(r);notice('报价已发布，PDF下载和访客链接见下方“已发布版本”');}
      return r;
    } finally{saving.current=false;setBusy(false);}
  }
  async function logout() {try{await request('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})});setAuth({authenticated:false,setupRequired:false});}catch(e){notice(e.message);}}
  if(!auth)return <main className="auth-screen"><div className="auth-card"><h1>正经报价</h1><p>{error||'正在连接工作台…'}</p>{error&&<button className="primary-button" onClick={refreshAuth}>重试连接</button>}</div></main>;
  if(!auth.authenticated)return <Auth setupRequired={auth.setupRequired} onDone={refreshAuth}/>;
  return <>
    <header className="app-header shell-header"><div className="header-inner"><span className="brand-mark">报</span><div className="shell-brand"><strong>正经报价</strong><small>内部报价工作台</small></div>
      <nav className="shell-nav" aria-label="工作台导航">{[['editor','编辑报价'],['history','历史报价'],['settings','系统设置']].map(([id,label])=><button key={id} className={view===id?'active':''} onClick={()=>{if(id==='editor'&&view!=='editor')setInitialData(loadData());setView(id);setError('');}}>{label}</button>)}</nav>
      <div className="build-info"><span>v{__APP_VERSION__}</span><span>构建：{date(__BUILD_TIME__)}</span></div><button className="text-button logout-button" onClick={logout}>退出</button>
    </div></header>
    {error&&<div className="app-notice" role="status"><span>{error}</span><button aria-label="关闭通知" onClick={()=>setError('')}>×</button></div>}
    {view==='editor'&&<><Editor key={key} initialData={initialData} record={record} busy={busy} onSave={data=>save(data)} onPublish={data=>save(data,true)}/>{record && <div className="quote-copy-bar"><button className="secondary-button" onClick={()=>{setInitialData({...loadData(),quotationDate:todayInput(),stampSeed:newStampSeed()});setRecord(null);localStorage.removeItem('quotationActiveQuote');setKey(k=>k+1);notice('已复制为新草稿，保存后生成新的报价编号');window.scrollTo(0,0);}}>复制为新报价</button></div>}<VersionList record={record} onChange={setRecord} onError={notice}/></>}
    {view==='history'&&<History onOpen={openQuote} onNew={newQuote} onNotice={notice}/>}
    {view==='settings'&&<Settings onNotice={notice} onLogout={()=>setAuth({authenticated:false,setupRequired:false})}/>}
  </>;
}
