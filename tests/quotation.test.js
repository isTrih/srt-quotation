import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateRow,
  insertRow,
  removeRow,
  normalizeData,
  paginateRows,
  stampRotation,
  STAMP_ROTATION_RANGE,
  setRowNumber,
  taxRateFor,
  quotationTerms,
} from "../src/quotation.js";

const product = (id) => ({
  id,
  no: "99",
  name: "电机",
  model: "AB-100",
  unit: "件",
  quantity: 12,
  price: 144,
});
const sequential = (rows) => rows.map((row) => row.no);

test("连续复制同一行后，编号连续且每行身份唯一，原始数据不变", () => {
  const original = [product("source")];
  let rows = original;
  for (let i = 0; i < 60; i++) rows = duplicateRow(rows, "source");
  assert.equal(rows.length, 61);
  assert.equal(new Set(rows.map((row) => row.id)).size, 61);
  assert.deepEqual(
    sequential(rows),
    Array.from({ length: 61 }, (_, i) => String(i + 1)),
  );
  assert.ok(
    rows.every(
      (row) => row.name === "电机" && row.quantity === 12 && row.price === 144,
    ),
  );
  assert.equal(original[0].no, "99");
});

test("按稳定的行 ID 插入和删除，重新编号但不改变产品顺序", () => {
  let rows = [product("a"), product("b"), product("c")];
  rows = insertRow(rows, product("inserted"), "a");
  rows = duplicateRow(rows, "b");
  rows = removeRow(rows, "a");
  assert.deepEqual(
    rows.slice(0, 2).map((row) => row.id),
    ["inserted", "b"],
  );
  assert.equal(rows.at(-1).id, "c");
  assert.deepEqual(sequential(rows), ["1", "2", "3", "4"]);
  assert.equal(duplicateRow(rows, "removed"), rows);
});

test("导入手动编号会保留原值和公章的随机种子", () => {
  const loaded = normalizeData({
    dataSource: [
      { ...product("a"), no: "A-001", noManual: true },
      { ...product("b"), no: "20" },
    ],
    stampSeed: 123,
  });
  assert.deepEqual(sequential(loaded.dataSource), ["A-001", "20"]);
  assert.equal(loaded.stampSeed, 123);
});

test("手动编号在插入、连续复制、删除及保存恢复后保持不变", () => {
  let rows = normalizeData({
    dataSource: [
      { ...product("a"), no: "1" },
      { ...product("b"), no: "2" },
    ],
  }).dataSource;
  rows = setRowNumber(rows, "a", "A-001");
  for (let index = 0; index < 20; index++) rows = duplicateRow(rows, "a");
  rows = insertRow(rows, product("inserted"), "a");
  rows = removeRow(rows, "b");
  assert.equal(rows[0].no, "A-001");
  assert.equal(rows[0].noManual, true);
  assert.equal(new Set(rows.map((row) => row.no)).size, rows.length);
  assert.deepEqual(
    normalizeData(JSON.parse(JSON.stringify({ dataSource: rows }))).dataSource,
    rows,
  );
});

test("自动编号避开手动数字编号，手动留空也不会被重新填入", () => {
  let rows = [
    { ...product("a"), no: "1" },
    { ...product("b"), no: "2" },
    { ...product("c"), no: "3" },
  ];
  rows = setRowNumber(rows, "a", "2");
  assert.deepEqual(sequential(rows), ["2", "3", "4"]);
  rows = setRowNumber(rows, "c", "");
  rows = duplicateRow(rows, "a");
  assert.equal(rows.find((row) => row.id === "c").no, "");
  assert.equal(rows.filter((row) => row.no === "2").length, 1);
});

test("税率按公司默认，手动税率可分别保存并反映在条款中", () => {
  const legacy = normalizeData({ quotationOffer: "ft", dataSource: [] });
  assert.equal(taxRateFor(legacy), 13);
  assert.equal(taxRateFor({ ...legacy, quotationOffer: "hh" }), 1);
  const custom = normalizeData({ ...legacy, taxRates: { hh: 3, ft: 9.5 } });
  assert.match(quotationTerms(custom), /含税（9.5%专票）/);
  assert.match(
    quotationTerms({ ...custom, quotationOffer: "hh" }),
    /含税（3%专票）/,
  );
  assert.equal(taxRateFor({ ...custom, taxRates: { ft: 0 } }), 0);
  for (const invalid of ["", -1, 101, null, "错误"])
    assert.equal(taxRateFor({ ...legacy, taxRates: { ft: invalid } }), 13);
});

test("仅末页预留条款空间，明细页按空间容纳更多行", () => {
  const rows = Array.from({ length: 61 }, (_, i) => product(String(i)));
  const metrics = {
    capacity: 600,
    continuationCapacity: 840,
    heights: Object.fromEntries(rows.map((row) => [row.id, 20])),
  };
  assert.deepEqual(
    paginateRows(rows.slice(0, 30), metrics).map((page) => page.length),
    [30],
  );
  assert.deepEqual(
    paginateRows(rows.slice(0, 60), metrics).map((page) => page.length),
    [42, 18],
  );
  const pages = paginateRows(rows, metrics);
  assert.deepEqual(
    pages.map((page) => page.length),
    [42, 19],
  );
  assert.deepEqual(pages.flat(), rows);
});

test("31 行跨页时保留末页产品，不产生只有条款的空明细页", () => {
  const rows = Array.from({ length: 31 }, (_, i) => product(String(i)));
  const pages = paginateRows(rows, {
    capacity: 600,
    continuationCapacity: 840,
    heights: Object.fromEntries(rows.map((row) => [row.id, 20])),
  });
  assert.deepEqual(
    pages.map((page) => page.length),
    [30, 1],
  );
  assert.deepEqual(pages.flat(), rows);
});

test("换行较多的产品按实际行高分页，避免内容超出纸张", () => {
  const rows = Array.from({ length: 22 }, (_, i) => product(String(i)));
  const metrics = {
    capacity: 580,
    continuationCapacity: 840,
    heights: Object.fromEntries(rows.map((row) => [row.id, 60])),
  };
  const pages = paginateRows(rows, metrics);
  assert.deepEqual(
    pages.map((page) => page.length),
    [14, 8],
  );
  assert.ok(
    pages.every(
      (page, index) =>
        page.reduce((height, row) => height + metrics.heights[row.id], 0) <=
        (index === pages.length - 1
          ? metrics.capacity
          : metrics.continuationCapacity),
    ),
  );
});

test("公章角度按页面变化，预览重渲染及导出时保持一致", () => {
  const angles = [1, 2, 3].map((page) => stampRotation(123, page));
  assert.equal(angles[0], stampRotation(123, 1));
  assert.equal(new Set(angles).size, 3);
  assert.ok(angles.every((angle) => Math.abs(angle) <= STAMP_ROTATION_RANGE));
});
import { amount } from '../src/quotation.js';
test('金额按行四舍五入到分，合计与显示的小计一致',()=>{
  assert.equal(amount({quantity:1,price:1.005}),1.01);
  assert.equal(amount({quantity:.1,price:.2}),.02);
  assert.equal([{quantity:1,price:.005},{quantity:1,price:.005}].reduce((sum,row)=>sum+amount(row),0),.02);
});
