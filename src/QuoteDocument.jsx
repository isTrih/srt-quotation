import React from 'react';
import { companies, quotationTerms, amount, money, stampRotation } from './quotation';
export default function QuoteDocument({data,preview=false,number,version}) {
  const c=companies[data.quotationOffer];
  const rows=data.dataSource.filter(r=>r.name.trim()||r.model.trim()||r.unit.trim()||r.quantity!==''||r.price!=='');
  const total=rows.reduce((s,r)=>s+amount(r),0);
  return <section className={'public-document '+(preview?'web-document-draft':'')}>
    {preview&&<header className="web-document-heading"><span>{number||'未保存草稿'}{version?' · V'+version:''}</span><h2>报价单</h2><small>草稿 · 内容实时更新</small></header>}
    <div className="public-meta"><div><small>报价单位</small><h2>{c.name}</h2><p>华天录 · 18955395088</p></div><div><small>询价单位</small><h2>{data.quotationAccepter||'未填写'}</h2><p>{data.quotationAccepterName||'—'} · {data.quotationAccepterPhone||'—'}</p></div></div>
    {rows.length?<div className="public-table-wrap"><table className="public-table"><thead><tr>{['编号','产品名称','规格型号','单位','数量','单价','总价'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td data-label="编号">{r.no||'—'}</td><td data-label="产品名称">{r.name||'—'}</td><td data-label="规格型号">{r.model||'—'}</td><td data-label="单位">{r.unit||'—'}</td><td data-label="数量">{r.quantity||'—'}</td><td data-label="单价">¥{money(Number(r.price))}</td><td data-label="总价">¥{money(amount(r))}</td></tr>)}</tbody></table></div>:<p className="empty-note">填写产品后，这里会立即显示报价内容。</p>}
    <div className="public-total">合计金额 <strong>¥{money(total)}</strong></div><p className="public-terms">{quotationTerms(data)}</p><div className="public-signature"><span>报价日期：{data.quotationDate}</span><img alt={c.name+'公章'} src={c.stamp} style={{transform:'rotate('+stampRotation(data.stampSeed,1)+'deg)'}}/></div>
  </section>;
}
