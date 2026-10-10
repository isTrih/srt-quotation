import test from "node:test";
import assert from "node:assert/strict";
import {
  rememberCustomer,
  normalizeHistory,
  loadCustomerHistory,
  CUSTOMER_HISTORY_KEY,
} from "../src/customerHistory.js";

const customer = (company, name, phone) => ({
  quotationAccepter: company,
  quotationAccepterName: name,
  quotationAccepterPhone: phone,
});

test("客户历史独立保存，重复客户置顶且不重复", () => {
  let history = rememberCustomer(
    null,
    customer(" 甲公司 ", " 张三 ", " 13800138000 "),
  );
  history = rememberCustomer(
    history,
    customer("乙公司", "李四", "13900139000"),
  );
  history = rememberCustomer(
    history,
    customer("甲公司", "张三", "13800138000"),
  );
  assert.deepEqual(history.companies, ["甲公司", "乙公司"]);
  assert.equal(history.contacts.length, 2);
  assert.deepEqual(history.contacts[0], {
    company: "甲公司",
    name: "张三",
    phone: "13800138000",
  });
});

test("同名不同号码保留不同选项，不保存缺少姓名或电话的组合", () => {
  let history = rememberCustomer(
    null,
    customer("甲公司", "张三", "13800138000"),
  );
  history = rememberCustomer(
    history,
    customer("甲公司", "张三", "13900139000"),
  );
  history = rememberCustomer(history, customer("乙公司", "王五", ""));
  assert.equal(history.contacts.length, 2);
  assert.deepEqual(
    history.contacts.map((item) => item.phone),
    ["13900139000", "13800138000"],
  );
  assert.deepEqual(history.companies, ["乙公司", "甲公司"]);
});

test("清空报价后的空客户不会清空历史，异常记录能被过滤", () => {
  const saved = {
    companies: ["甲公司", "甲公司", 1, null],
    contacts: [
      null,
      { name: "张三", phone: "13800138000" },
      { name: "张三", phone: "13800138000" },
    ],
  };
  assert.deepEqual(
    rememberCustomer(saved, customer("", "", "")),
    normalizeHistory(saved),
  );
  assert.equal(normalizeHistory(saved).contacts.length, 1);
});

test("刷新时从独立键恢复历史，并兼容当前旧报价的客户信息", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) =>
      key === CUSTOMER_HISTORY_KEY
        ? JSON.stringify({ companies: ["旧公司"], contacts: [] })
        : null,
  };
  try {
    assert.deepEqual(
      loadCustomerHistory(customer("新公司", "张三", "13800138000")).companies,
      ["新公司", "旧公司"],
    );
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
