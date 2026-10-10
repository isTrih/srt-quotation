import { test,expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QuoteDocument from '../src/QuoteDocument';
import { defaultData,normalizeData } from '../shared/quotation';
test('网页报价直接输出可选择的产品表格和日期，不包含PDF查看器',()=>{
  const data=normalizeData({...defaultData,dataSource:[{id:'web-row',no:'A-01',name:'网页轴承 <script>',model:'6205',unit:'件',quantity:2,price:18.5}]});
  for(const preview of [false,true]){
    const html=renderToStaticMarkup(<QuoteDocument data={data} preview={preview}/>);
    expect(html).toContain('<table');expect(html).toContain('网页轴承 &lt;script&gt;');expect(html).toContain('A-01');expect(html).toContain('37.00');expect(html).toContain('报价日期');
    expect(html).not.toMatch(/<(iframe|canvas|embed|object)\b/);
  }
});
