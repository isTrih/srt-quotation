import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { companies, quotationTerms, stampRotation, amount, money, paginateRows } from '../../shared/quotation.js';
import { filledRows, totalAmount } from './validation.js';
import { HttpError } from './auth.js';

const widths = [55,146,86,35,45,66,76];
const contentWidth = widths.reduce((sum, width) => sum + width, 0);
const metaColumnWidth = (contentWidth - 14) / 2;
const headers = ['编号','产品名称','规格型号','单位','数量','单价','总价'];
const values = (r) => [r.no || '—',r.name || '—',r.model || '—',r.unit || '—',String(r.quantity),money(Number(r.price)),money(amount(r))];
let busy = false;
// Bound concurrent font parsing and PDF buffers for this single-admin app.
export async function makePdf(data, info = {}) {
  if (busy) throw new HttpError(429,'正在生成另一份PDF，请稍后重试');
  busy = true;
  try { return await render(data, info); } finally { busy = false; }
}
async function render(data, info) {
  const doc = new PDFDocument({ size:'A4', margin:0, compress:true, autoFirstPage:false,
    info:{Title: info.number ? info.number + ' 报价单' : '报价单预览', Author:companies[data.quotationOffer].name, CreationDate:new Date(info.created || Date.now()), ModDate:new Date(info.created || Date.now())} });
  const chunks = [];
  const complete = new Promise((resolve,reject) => {
    doc.on('data',c => chunks.push(c)); doc.on('end',() => resolve(Buffer.concat(chunks))); doc.on('error',reject);
  });
  doc.registerFont('cn',resolve('assets/fonts/NotoSansSC-Regular.otf')).font('cn').fontSize(8);
  const rows = filledRows(data);
  const heights = Object.fromEntries(rows.map(r => [r.id, Math.max(15,...values(r).map((v,i) => doc.heightOfString(v,{width:widths[i]-8,lineGap:0})+3))]));
  if (Object.values(heights).some(h => h > 615)) throw new HttpError(400,'单行文字过长，请拆分为多行产品');
  const company = companies[data.quotationOffer];
  const metaRows = [
    ['报价单位：'+company.name,'询价单位：'+(data.quotationAccepter||'—')],
    ['联系人：华天录','联系人：'+(data.quotationAccepterName||'—')],
    ['电话：18955395088','电话：'+(data.quotationAccepterPhone||'—')],
  ];
  doc.fontSize(9);
  const tableStart = 91 + metaRows.reduce((sum,[l,r]) => sum + Math.max(doc.heightOfString(l,{width:metaColumnWidth}),doc.heightOfString(r,{width:metaColumnWidth}),15) + 2,0);
  const finalCapacity=Math.max(15,645-tableStart-22);
  if(Object.values(heights).some(h=>h>finalCapacity))throw new HttpError(400,"单行文字或客户信息过长，请拆分产品行或缩短客户信息");
  const pages = paginateRows(rows,{capacity:finalCapacity,continuationCapacity:Math.max(15,765-tableStart-22),heights});
  doc.fontSize(8);
  const qr = info.url ? await QRCode.toBuffer(info.url,{width:240,margin:2,errorCorrectionLevel:'M'}) : null;
  const stamp = readFileSync(resolve('public',company.stamp.slice(1)));
  const text = (value,x,y,width,size=9,align='left',color='#172033') => {
    doc.font('cn').fontSize(size).fillColor(color).text(String(value),x,y,{width,align,lineGap:0});
  };
  for (let p=0;p<pages.length;p++) {
    doc.addPage();
    const last = p === pages.length-1;
    const left = (doc.page.width - contentWidth) / 2;
    const right = left + contentWidth;
    if (info.watermark) {
      doc.save().opacity(.075).rotate(-28,{origin:[doc.page.width/2,410]});
      text(info.watermark,left,396,contentWidth,28,'center','#52718c');
      doc.restore();
    }
    if (qr) {
      doc.roundedRect(left,15,46,46,5).lineWidth(.6).stroke('#dce5ef');
      doc.image(qr,left+3,18,{width:40,height:40});
      doc.link(left,15,46,46,info.url);
      text('扫码核验',left,64,46,6.5,'center','#7d91a8');
    } else {
      doc.roundedRect(left,20,43,34,5).fill('#eef3fb');
      text('草稿',left+2,30,39,9,'center','#8094ad');
    }
    text(company.name + ' — 报价单',left+55,18,contentWidth-55-222,8,'left','#617086');
    text(info.number ? info.number + ' · V' + info.version : '草稿预览',right-222,18,222,8,'right','#617086');
    text(p ? '报价单（续表）' : '报价单',left,39,contentWidth,21,'center');
    const meta = [
      ['报价单位：'+company.name,'询价单位：'+(data.quotationAccepter||'—')],
      ['联系人：华天录','联系人：'+(data.quotationAccepterName||'—')],
      ['电话：18955395088','电话：'+(data.quotationAccepterPhone||'—')],
    ];
    let y = 81;
    for (const [l,r] of meta) {
      doc.font('cn').fontSize(9);
      const h = Math.max(doc.heightOfString(l,{width:metaColumnWidth}),doc.heightOfString(r,{width:metaColumnWidth}),15);
      text(l,left,y,metaColumnWidth); text(r,left+metaColumnWidth+14,y,metaColumnWidth); y += h + 2;
    }
    // Long customer fields reduce available height on every page.
    const tableY = y + 10;
    const targetBottom = last ? Math.min(tableY + pages[p].reduce((s,r)=>s+heights[r.id],0) + 22,686) : 765;
    let x = left;
    headers.forEach((h,i) => {
      doc.rect(x,tableY,widths[i],22).fillAndStroke('#edf2f7','#546273');
      text(h,x+4,tableY+5,widths[i]-8,8,'center'); x += widths[i];
    });
    y = tableY + 22;
    const minSum = pages[p].reduce((s,r)=>s+heights[r.id],0);
    const grow = last || !pages[p].length ? 0 : Math.max(0,(targetBottom-y-minSum)/pages[p].length);
    for (const row of pages[p]) {
      const h = heights[row.id]+grow;
      x = left;
      values(row).forEach((v,i)=>{
        doc.rect(x,y,widths[i],h).lineWidth(.45).stroke('#687687');
        doc.font('cn').fontSize(8);
        const th = doc.heightOfString(v,{width:widths[i]-8,lineGap:0});
        text(v,x+4,y+(h-th)/2,widths[i]-8,8,'center');
        x += widths[i];
      });
      y += h;
    }
    const drawStamp = (cx,cy) => {
      doc.save().rotate(stampRotation(data.stampSeed,p+1),{origin:[cx,cy]}).image(stamp,cx-54,cy-54,{width:108,height:108}).restore();
    };
    if (!last) {
      drawStamp(right-49,doc.page.height/2);
      text('（有续表）',left,775,contentWidth,9,'center');
    } else {
      y += 12;
      text('合计金额：¥' + money(totalAmount(data)),left,y,contentWidth,12,'right');
      y += 26;
      text(quotationTerms(data),left,y,contentWidth,9);
      y += doc.fontSize(9).heightOfString(quotationTerms(data),{width:contentWidth}) + 15;
      const dateY = Math.min(y+42,754);
      text('报价日期：'+data.quotationDate,right-195,dateY,195,9,'right');
      drawStamp(right-52,dateY+2);
      if (qr) {
        text('左上角扫码查看 / 核验原件',left,Math.min(y,738)+8,218,8);
        text(info.number + ' · V' + info.version,left,Math.min(y,738)+24,218,8);
        text('内容校验码 '+info.contentHash.slice(0,16),left,Math.min(y,738)+40,218,7);
      } else text('草稿预览 · 发布后附在线核验二维码',left,Math.min(y+16,765),300,8,'left','#728096');
    }
    text((info.contentHash ? '核验码 '+info.contentHash.slice(0,16)+' · ' : '')+'第 '+(p+1)+' / '+pages.length+' 页',left,814,contentWidth,7,'center','#728096');
  }
  doc.end();
  return complete;
}
