import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adminGet, downloadBlob } from "./api";
import {
  amount,
  companies,
  dateLabel,
  defaultTaxRates,
  duplicateRow as copyQuoteRow,
  insertRow,
  loadData,
  money,
  newRow,
  newStampSeed,
  normalizeData,
  removeRow,
  renumberRows,
  setRowNumber,
  taxRateFor,
  quotationTerms,
  stampRotation,
  STORAGE_KEY,
  todayInput,
} from "./quotation";
import "./style.css";
import CustomerField from "./CustomerField";
import {
  CUSTOMER_HISTORY_KEY,
  loadCustomerHistory,
  rememberCustomer,
} from "./customerHistory";

const currency = (value) => `¥${money(value)}`;

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    eye: (
      <>
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

import QuoteDocument from "./QuoteDocument";

export default function Editor({ initialData, record, onSave, onPublish, busy }) {
  const [step, setStep] = useState(0);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width:760px)").matches);
  useEffect(() => {
    const media=window.matchMedia("(max-width:760px)");
    const change=()=>setNarrow(media.matches);
    media.addEventListener("change",change);
    return()=>media.removeEventListener("change",change);
  },[]);
  const [rowPage, setRowPage] = useState(0);
  const [data, setData] = useState(() => initialData || loadData());
  const [customerHistory, setCustomerHistory] = useState(() =>
    loadCustomerHistory(data),
  );
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const modalRef = useRef(null);
  const importRef = useRef(null);
  const total = useMemo(
    () => data.dataSource.reduce((sum, row) => sum + amount(row), 0),
    [data.dataSource],
  );
  const filledRows = useMemo(
    () =>
      data.dataSource.filter(
        (row) =>
          row.name.trim() ||
          row.model.trim() ||
          row.unit.trim() ||
          row.quantity !== "" ||
          row.price !== "",
      ),
    [data.dataSource],
  );
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    localStorage.setItem(CUSTOMER_HISTORY_KEY, JSON.stringify(customerHistory));
  }, [customerHistory]);

  useEffect(() => { adminGet({action:"customers"}).then(items => setCustomerHistory(prev => items.slice().reverse().reduce((history,item)=>rememberCustomer(history,item),prev))).catch(()=>{}); }, []);
  const saveCustomer = () =>
    setCustomerHistory((previous) => rememberCustomer(previous, data));
  const companyOptions = customerHistory.companies.map((company) => ({
    key: company,
    label: company,
    search: company,
    company,
  }));
  const contactOptions = [...customerHistory.contacts]
    .sort(
      (a, b) =>
        Number(b.company === data.quotationAccepter.trim()) -
        Number(a.company === data.quotationAccepter.trim()),
    )
    .map((contact) => ({
      ...contact,
      key: JSON.stringify([contact.name, contact.phone, contact.company]),
      label: `${contact.name} · ${contact.phone}`,
      detail: contact.company,
      search: `${contact.name} ${contact.phone} ${contact.company}`,
    }));
  const selectContact = (contact) =>
    setData((previous) => ({
      ...previous,
      quotationAccepterName: contact.name,
      quotationAccepterPhone: contact.phone,
    }));

  useEffect(() => {
    if (!showPreview) return;
    const escape = e => { if (e.key === "Escape") setShowPreview(false); };
    window.addEventListener("keydown",escape);
    return () => window.removeEventListener("keydown",escape);
  },[showPreview]);
  const change = (key, value) => setData((prev) => ({ ...prev, [key]: value }));
  const changeTaxRate = (value) => {
    if (
      value !== "" &&
      (!Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 100)
    )
      return;
    setData((prev) => ({
      ...prev,
      taxRates: {
        ...defaultTaxRates,
        ...prev.taxRates,
        [prev.quotationOffer]: value === "" ? "" : Number(value),
      },
    }));
  };
  useEffect(()=>{setRowPage(p=>Math.min(p,Math.max(0,Math.ceil(data.dataSource.length/20)-1)));},[data.dataSource.length]);
  const changeRow = (id, key, value) =>
    setData((prev) => ({
      ...prev,
      dataSource:
        key === "no"
          ? setRowNumber(prev.dataSource, id, value)
          : prev.dataSource.map((row) =>
              row.id === id ? { ...row, [key]: value } : row,
            ),
    }));
  const addRow = (afterId = null) => {
    const row = newRow();
    setData((prev) => ({
      ...prev,
      dataSource: insertRow(prev.dataSource, row, afterId),
    }));
    if (!afterId) setRowPage(Math.floor(data.dataSource.length / 20));
    setNotice("已添加一行");
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-row-id="${row.id}"] input[data-field="name"]`)
        ?.focus(),
    );
  };
  const duplicateRow = (id) => {
    setData((prev) => ({
      ...prev,
      dataSource: copyQuoteRow(prev.dataSource, id),
    }));
    setNotice("已复制一行，手动编号已保留");
  };
  const [deleted, setDeleted] = useState(null);
  const deleteRow = (id) => {
    setDeleted({row:data.dataSource.find(r=>r.id===id),index:data.dataSource.findIndex(r=>r.id===id)});
    setData(prev=>({...prev,dataSource:removeRow(prev.dataSource,id)}));
    setNotice("已删除一行，可撤销");
  };
  const clearData = () => {
    if (!window.confirm("确定清空客户信息和所有报价行吗？")) return;
    setData({
      quotationOffer: data.quotationOffer,
      taxRates: { ...defaultTaxRates, ...data.taxRates },
      quotationAccepter: "",
      quotationAccepterName: "",
      quotationAccepterPhone: "",
      quotationDate: todayInput(),
      stampSeed: newStampSeed(),
      dataSource: [newRow(1)],
    });
    setNotice("内容已清空");
  };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `报价单备份-${data.quotationDate || todayInput()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("备份文件已下载");
  };
  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = normalizeData(JSON.parse(await file.text()));
      setData(imported);
      setNotice("备份已导入并自动保存");
    } catch {
      setNotice("导入失败：请选择本工具导出的 JSON 备份");
    } finally {
      event.target.value = "";
    }
  };
  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch("/api/preview", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data})});
      if (!response.ok) throw new Error((await response.json()).error || "生成失败");
      downloadBlob(await response.blob(), "草稿-"+data.quotationDate+".pdf");
      setNotice("文字 PDF 已下载；正式报价请发布后下载原件");
    } catch (error) { setNotice(error.message); }
    finally { setExporting(false); }
  };
  const saveOnline = async (publish = false) => {
    saveCustomer();
    try { await (publish ? onPublish(data) : onSave(data)); setNotice(publish ? "报价已发布，可以分享链接或下载正式PDF" : "已保存到服务器"); }
    catch(error) { setNotice(error.message); }
  };

  return (
    <>
      <main className={`workspace mobile-step-${step}`}>
        <nav className="wizard-tabs" aria-label="编辑步骤">{["客户信息","报价明细","核对与发布"].map((label,i)=><button key={label} className={step===i?"active":""} aria-current={step===i?"step":undefined} onClick={()=>setStep(i)}><span>{i+1}</span>{label}</button>)}</nav>
        <div className="page-heading">
          <div>
            <div className="eyebrow">QUOTATION WORKSPACE</div>
            <h1>{record ? record.number : "创建报价单"}</h1>
            <p>本机自动保存 · 保存到服务器后可在历史报价中继续编辑。</p>
          </div>
          <div className="editor-main-actions">
            <button className="secondary-button" disabled={busy} onClick={()=>saveOnline()}>保存草稿</button>
            <button className="primary-button" disabled={busy || !filledRows.length} onClick={()=>saveOnline(true)}>{busy ? "处理中…" : "发布报价"}</button>
          </div>
        </div>
        <div className="workspace-grid">
          <section className="editor" aria-label="报价单编辑区">
            <div className="panel company-panel">
              <div className="section-title">
                <span className="step">01</span>
                <div>
                  <h2>报价单位</h2>
                  <p>选择出具报价单的公司</p>
                </div>
              </div>
              <div className="company-options">
                {Object.entries(companies).map(([id, company]) => (
                  <button
                    key={id}
                    type="button"
                    className={`company-card ${data.quotationOffer === id ? "selected" : ""}`}
                    onClick={() => change("quotationOffer", id)}
                    aria-pressed={data.quotationOffer === id}
                  >
                    <img src={company.stamp} alt="" />
                    <span>{company.name}</span>
                    <span className="company-check">
                      <Icon name="check" size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div
              className="panel customer-panel"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  saveCustomer();
              }}
            >
              <div className="section-title">
                <span className="step">02</span>
                <div>
                  <h2>客户信息</h2>
                  <p>可选择历史记录，也可直接输入新客户</p>
                </div>
              </div>
              <div className="field-grid">
                <CustomerField
                  label="询价单位"
                  value={data.quotationAccepter}
                  onChange={(value) => change("quotationAccepter", value)}
                  options={companyOptions}
                  onSelect={(item) => change("quotationAccepter", item.company)}
                  placeholder="请输入公司名称"
                />
                <CustomerField
                  label="询价联系人"
                  value={data.quotationAccepterName}
                  onChange={(value) => change("quotationAccepterName", value)}
                  options={contactOptions}
                  onSelect={selectContact}
                  placeholder="请输入联系人"
                />
                <CustomerField
                  label="联系电话"
                  type="tel"
                  value={data.quotationAccepterPhone}
                  onChange={(value) => change("quotationAccepterPhone", value)}
                  options={contactOptions}
                  onSelect={selectContact}
                  placeholder="请输入电话"
                />
                <Field
                  label="报价日期"
                  type="date"
                  value={data.quotationDate}
                  onChange={(e) => change("quotationDate", e.target.value)}
                />
                <Field
                  label="发票税率（%）"
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={
                    data.taxRates?.[data.quotationOffer] ??
                    companies[data.quotationOffer].taxRate
                  }
                  onChange={(e) => changeTaxRate(e.target.value)}
                  onBlur={() => changeTaxRate(taxRateFor(data))}
                  title="HH 默认 1%，FT 默认 13%；可修改，金额按录入的含税单价计算"
                />
              </div>
              <div className="customer-history-help">
                <span>
                  离开此区域后自动记住；选择联系人或电话会同时带出两项。
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    saveCustomer();
                    setNotice("客户已保存到历史记录");
                  }}
                >
                  记住客户
                </button>
              </div>
            </div>
            <div className="panel items-panel">
              <div className="section-title items-title">
                <span className="step">03</span>
                <div>
                  <h2>报价明细</h2>
                  <p>编号可手动修改；金额和预览实时更新</p>
                </div>
                <button
                  className="secondary-button add-top"
                  onClick={() => addRow()}
                >
                  <Icon name="plus" size={17} /> 添加一行
                </button>
              </div>
              <div className="table-scroll">
                <table className="editor-table">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>产品名称</th>
                      <th>规格型号</th>
                      <th>单位</th>
                      <th>数量</th>
                      <th>单价（元）</th>
                      <th>小计</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dataSource.slice(rowPage*20,(rowPage+1)*20).map((row, localIndex) => { const index=rowPage*20+localIndex; return (
                      <tr key={row.id} data-row-id={row.id}>
                        <td data-label="编号">
                          <input
                            aria-label={`第${index + 1}行编号`}
                            value={row.no}
                            onChange={(e) =>
                              changeRow(row.id, "no", e.target.value)
                            }
                            placeholder="编号"
                            title="可手动输入编号；修改后会保留"
                          />
                        </td>
                        <td data-label="产品名称">
                          <input
                            data-field="name"
                            aria-label={`第${index + 1}行产品名称`}
                            value={row.name}
                            onChange={(e) =>
                              changeRow(row.id, "name", e.target.value)
                            }
                            placeholder="产品名称"
                          />
                        </td>
                        <td data-label="规格型号">
                          <input
                            aria-label={`第${index + 1}行规格型号`}
                            value={row.model}
                            onChange={(e) =>
                              changeRow(row.id, "model", e.target.value)
                            }
                            placeholder="规格型号"
                          />
                        </td>
                        <td data-label="单位">
                          <input
                            aria-label={`第${index + 1}行单位`}
                            value={row.unit}
                            onChange={(e) =>
                              changeRow(row.id, "unit", e.target.value)
                            }
                            placeholder="件"
                          />
                        </td>
                        <td data-label="数量">
                          <input
                            aria-label={`第${index + 1}行数量`}
                            type="number"
                            min="0"
                            step="any"
                            value={row.quantity}
                            onChange={(e) =>
                              changeRow(row.id, "quantity", e.target.value)
                            }
                            placeholder="0"
                          />
                        </td>
                        <td data-label="单价（元）">
                          <input
                            aria-label={`第${index + 1}行单价`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.price}
                            onChange={(e) =>
                              changeRow(row.id, "price", e.target.value)
                            }
                            placeholder="0.00"
                          />
                        </td>
                        <td data-label="小计" className="row-amount">
                          {currency(amount(row))}
                        </td>
                        <td data-label="操作">
                          <div className="row-actions">
                            <button
                              title="在下方插入一行"
                              aria-label={`在第${index + 1}行下方插入`}
                              onClick={() => addRow(row.id)}
                            >
                              <Icon name="plus" size={16} />
                            </button>
                            <button
                              title="复制此行"
                              aria-label={`复制第${index + 1}行`}
                              onClick={() => duplicateRow(row.id)}
                            >
                              <Icon name="copy" size={16} />
                            </button>
                            <button
                              title="删除此行"
                              aria-label={`删除第${index + 1}行`}
                              onClick={() => deleteRow(row.id)}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
              {data.dataSource.length>20 && <div className="pagination-controls"><button className="secondary-button" disabled={rowPage===0} onClick={()=>setRowPage(rowPage-1)}>前20行</button><span>第 {rowPage*20+1}–{Math.min((rowPage+1)*20,data.dataSource.length)} 行 / {data.dataSource.length} 行</span><button className="secondary-button" disabled={(rowPage+1)*20>=data.dataSource.length} onClick={()=>setRowPage(rowPage+1)}>后20行</button></div>}
              <button className="add-row-button" onClick={() => addRow()}>
                <Icon name="plus" size={17} /> 添加一行产品
              </button>
              <div className="editor-summary">
                <span>
                  已填写 {filledRows.length} 项 · 共 {data.dataSource.length} 行
                </span>
                <span>
                  报价总计 <strong>{currency(total)}</strong>
                </span>
              </div>
            </div>
            <div className="editor-footer">
              <div className="backup-actions">
                <button className="text-button" onClick={clearData}>
                  <Icon name="trash" size={16} /> 清空内容
                </button>
                <button className="text-button" onClick={exportBackup}>
                  导出备份
                </button>
                <button
                  className="text-button"
                  onClick={() => importRef.current?.click()}
                >
                  导入备份
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={importBackup}
                  hidden
                />
              </div>
              {deleted && <button className="text-button" onClick={()=>{setData(prev=>({...prev,dataSource:renumberRows([...prev.dataSource.slice(0,deleted.index),deleted.row,...prev.dataSource.slice(deleted.index)])}));setDeleted(null);setNotice("删除已撤销");}}>撤销删除</button>}
              <span role="status">
                {notice || "编辑内容会自动保存在当前浏览器"}
              </span>
            </div>
          </section>
          {!narrow && <aside className="preview-panel" aria-label="报价单预览">
            <div className="preview-heading"><div><strong>网页预览</strong><span>内容实时更新</span></div><button className="secondary-button" onClick={()=>setShowPreview(true)}>放大预览</button></div>
            {!showPreview && <div className="web-quote-preview"><QuoteDocument data={data} preview number={record?.number}/></div>}
          </aside>}
        </div>
        {narrow && step===2 && <div className="mobile-review">
          <h2>确认报价</h2>{notice&&<p role="status">{notice}</p>}<p>{data.quotationAccepter || "未填写询价单位"} · {filledRows.length}项产品</p>
          <strong>{currency(total)}</strong><p>{quotationTerms(data)}</p>
          {!showPreview && <div className="web-quote-preview"><QuoteDocument data={data} preview number={record?.number}/></div>}
          <button className="secondary-button" onClick={()=>downloadPdf()} disabled={exporting}>下载草稿 PDF</button>
          <button className="secondary-button" onClick={()=>saveOnline()} disabled={busy}>保存草稿到服务器</button>
          <p>发布后生成访客链接、二维码和可核验的固定版本。</p>
        </div>}
        <div className="wizard-footer">
          <button className="secondary-button" disabled={step===0} onClick={()=>{saveCustomer();setStep(step-1);window.scrollTo(0,0);}}>上一步</button>
          <span>{currency(total)} · {filledRows.length}项</span>
          {step<2 ? <button className="primary-button" onClick={()=>{saveCustomer();setStep(step+1);window.scrollTo(0,0);}}>下一步</button> : <button className="primary-button" disabled={busy} onClick={()=>saveOnline(true)}>发布报价</button>}
        </div>
      </main>
      {showPreview && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowPreview(false);
          }}
        >
          <div
            className="preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="放大报价单预览"
          >
            <div className="modal-header">
              <strong>报价单网页预览</strong>
              <div>
                <button
                  className="primary-button"
                  onClick={() => downloadPdf()}
                  disabled={exporting || !filledRows.length}
                >
                  <Icon name="download" size={16} />
                  {exporting ? "生成中…" : "下载草稿 PDF"}
                </button>
                <button
                  className="modal-close"
                  onClick={() => setShowPreview(false)}
                  aria-label="关闭预览"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body web-quote-preview" ref={modalRef}><QuoteDocument data={data} preview number={record?.number}/></div>
          </div>
        </div>
      )}
    </>
  );
}


