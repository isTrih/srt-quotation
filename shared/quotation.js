export const STORAGE_KEY = "quotationData";

export const companies = {
  hh: { name: "芜湖昊涵机电科技有限公司", stamp: "/stamps/hh.png", taxRate: 1 },
  ft: {
    name: "芜湖富腾机电贸易有限公司",
    stamp: "/stamps/ft.png",
    taxRate: 13,
  },
};

export const defaultTaxRates = Object.fromEntries(
  Object.entries(companies).map(([id, company]) => [id, company.taxRate]),
);

function validTaxRate(value) {
  return (
    (typeof value === "number" || typeof value === "string") &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 100
  );
}

export function taxRateFor(data) {
  const rate = data.taxRates?.[data.quotationOffer];
  return validTaxRate(rate)
    ? Number(rate)
    : (companies[data.quotationOffer] ?? companies.hh).taxRate;
}

export function quotationTerms(data) {
  return `以上报价，有效日期为15个工作日。付款方式为款到发货，含税（${taxRateFor(data)}%专票）含运费，产品包装，不回收！`;
}

export const defaultData = {
  quotationOffer: "hh",
  taxRates: defaultTaxRates,
  quotationAccepter: "中航华东光电有限公司",
  quotationAccepterName: "吴文竹",
  quotationAccepterPhone: "17755501014",
  dataSource: [
    {
      id: "initial-1",
      no: "1",
      name: "产品名称0",
      model: "规格型号0",
      unit: "值",
      quantity: 12,
      price: 144,
    },
  ],
};

export const todayInput = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });

export const STAMP_ROTATION_RANGE = 60;

export function newStampSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// A saved random seed keeps each page's angle stable in the preview and PDF.
export function stampRotation(seed, page) {
  let value = (seed ^ Math.imul(page, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return Number(
    (((value / 0xffffffff) * 2 - 1) * STAMP_ROTATION_RANGE).toFixed(2),
  );
}

export function renumberRows(rows) {
  const used = new Set(
    rows.filter((row) => row.noManual).map((row) => String(row.no).trim()),
  );
  return rows.map((row, index) => {
    if (row.noManual) return { ...row, no: String(row.no) };
    let number = index + 1;
    while (used.has(String(number))) number++;
    used.add(String(number));
    return { ...row, no: String(number), noManual: false };
  });
}

export function setRowNumber(rows, id, value) {
  return renumberRows(
    rows.map((row) =>
      row.id === id ? { ...row, no: String(value), noManual: true } : row,
    ),
  );
}

export function insertRow(rows, row, afterId = null) {
  const index =
    afterId === null
      ? rows.length - 1
      : rows.findIndex((item) => item.id === afterId);
  if (afterId !== null && index < 0) return rows;
  return renumberRows([
    ...rows.slice(0, index + 1),
    row,
    ...rows.slice(index + 1),
  ]);
}

export function duplicateRow(rows, id, copyId) {
  const source = rows.find((row) => row.id === id);
  if (!source) return rows;
  return insertRow(
    rows,
    { ...source, id: copyId ?? crypto.randomUUID(), noManual: false },
    id,
  );
}

export function removeRow(rows, id) {
  return renumberRows(rows.filter((row) => row.id !== id));
}

export function newRow(no = "") {
  return {
    id: crypto.randomUUID(),
    no: String(no),
    name: "",
    model: "",
    unit: "",
    quantity: "",
    price: "",
  };
}

export function normalizeData(saved) {
  if (!saved || !Array.isArray(saved.dataSource))
    throw new Error("无效的报价单数据");
  return {
    quotationOffer: companies[saved.quotationOffer]
      ? saved.quotationOffer
      : "hh",
    taxRates: Object.fromEntries(
      Object.entries(defaultTaxRates).map(([id, fallback]) => [
        id,
        validTaxRate(saved.taxRates?.[id])
          ? Number(saved.taxRates[id])
          : fallback,
      ]),
    ),
    quotationAccepter: String(saved.quotationAccepter ?? ""),
    quotationAccepterName: String(saved.quotationAccepterName ?? ""),
    quotationAccepterPhone: String(saved.quotationAccepterPhone ?? ""),
    quotationDate: /^\d{4}-\d{2}-\d{2}$/.test(saved.quotationDate)
      ? saved.quotationDate
      : todayInput(),
    stampSeed: Number.isInteger(saved.stampSeed)
      ? saved.stampSeed >>> 0
      : newStampSeed(),
    dataSource: renumberRows(
      saved.dataSource.map((row, index) => ({
        id: String(row.id ?? crypto.randomUUID()),
        no: String(row.no ?? index + 1),
        noManual:
          typeof row.noManual === "boolean"
            ? row.noManual
            : row.no != null && String(row.no) !== String(index + 1),
        name: String(row.name ?? ""),
        model: String(row.model ?? ""),
        unit: String(row.unit ?? ""),
        quantity: row.quantity ?? "",
        price: row.price ?? "",
      })),
    ),
  };
}

export function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved
      ? normalizeData(saved)
      : {
          ...structuredClone(defaultData),
          quotationDate: todayInput(),
          stampSeed: newStampSeed(),
        };
  } catch {
    return {
      ...structuredClone(defaultData),
      quotationDate: todayInput(),
      stampSeed: newStampSeed(),
    };
  }
}

export function amount(row) {
  const quantity = Number(row.quantity) || 0;
  const price = Number(row.price) || 0;
  const value = quantity * price;
  return Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100;
}

export function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function dateLabel(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Shanghai",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

// Only the final page reserves the terms/date area. Continuation pages use all
// available table space, while keeping at least one product with the final footer.
export function paginateRows(rows, metrics = null) {
  if (!rows.length) return [[]];
  const pages = [];
  const finalCapacity = metrics?.capacity ?? 620;
  const continuationCapacity = metrics?.continuationCapacity ?? 840;
  const heights = rows.map((row) => {
    const longest = Math.max(
      String(row.name).length / 21,
      String(row.model).length / 16,
      1,
    );
    return metrics?.heights[row.id] ?? Math.max(1, Math.ceil(longest)) * 14 + 6;
  });
  let remainingHeight = heights.reduce((sum, height) => sum + height, 0);
  let start = 0;
  while (start < rows.length) {
    if (remainingHeight <= finalCapacity || start === rows.length - 1) {
      pages.push(rows.slice(start));
      break;
    }
    let end = start;
    let used = 0;
    while (
      end < rows.length - 1 &&
      (end === start || used + heights[end] <= continuationCapacity)
    ) {
      used += heights[end++];
    }
    pages.push(rows.slice(start, end));
    remainingHeight -= used;
    start = end;
  }
  return pages;
}
