import { normalizeData, amount } from '../../shared/quotation.js';
import { HttpError, hash } from './auth.js';
export function validateData(input) {
  if (!input || !Array.isArray(input.dataSource) || input.dataSource.length > 500) throw new HttpError(400, '报价最多支持500行');
  if (!['hh', 'ft'].includes(input.quotationOffer)) throw new HttpError(400, '报价单位无效');
  for (const key of ['quotationAccepter','quotationAccepterName','quotationAccepterPhone']) {
    if (typeof input[key] !== 'string' || input[key].length > 200) throw new HttpError(400, '客户字段长度不合法');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.quotationDate) || !Number.isFinite(Date.parse(input.quotationDate)) || new Date(input.quotationDate).toISOString().slice(0,10) !== input.quotationDate) throw new HttpError(400, '报价日期无效');
  for (const row of input.dataSource) {
    for (const key of ['id','no','name','model','unit']) {
      if (row[key] != null && (typeof row[key] !== 'string' || row[key].length > (key === 'name' || key === 'model' ? 500 : 80))) throw new HttpError(400, '产品字段长度不合法');
    }
    for (const key of ['quantity','price']) {
      if (row[key] !== '' && (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0 || Number(row[key]) > 1e9)) throw new HttpError(400, '数量和单价需为0至10亿之间的数字');
    }
  }
  const data = normalizeData(input);
  if (totalAmount(data) > 1e12) throw new HttpError(400, '报价总金额超过支持范围');
  if (new Set(data.dataSource.map(r => r.id)).size !== data.dataSource.length) throw new HttpError(400, '产品行标识重复');
  return data;
}
export const filledRows = (data) => data.dataSource.filter(r => r.name.trim() || r.model.trim() || r.unit.trim() || r.quantity !== '' || r.price !== '');
export function validatePublication(data) {
  if (!data.quotationAccepter.trim()) throw new HttpError(400, '请填写询价单位');
  const rows = filledRows(data);
  if (!rows.length) throw new HttpError(400, '请填写至少一项产品');
  if (rows.some(r => !r.name.trim() || r.quantity === '' || r.price === '')) throw new HttpError(400, '发布前请补齐每项产品名称、数量和单价');
}
export const totalAmount = (data) => data.dataSource.reduce((sum,r) => sum + amount(r),0);
export const contentHash = (data) => hash(JSON.stringify(data));
export function originFor(value) {
  if (!value) return '';
  let url; try { url = new URL(value); } catch { throw new HttpError(400, '在线访问地址需是完整的 http/https 地址'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new HttpError(400, '请输入纯域名地址，不包含路径、账号或参数');
  return url.origin;
}
