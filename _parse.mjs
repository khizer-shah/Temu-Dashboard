// src/lib/parseExcel.ts
import * as XLSX from "xlsx";
var FIELD_HEADERS = {
  orderId: ["orderid"],
  orderItemId: ["orderitemid"],
  status: ["orderstatus"],
  itemStatus: ["orderitemstatus"],
  fulfillmentMode: ["fulfillmentmode"],
  productName: ["productname", "productnamebycustomerorder"],
  variation: ["variation"],
  contributionSku: ["contributionsku"],
  skuId: ["skuid"],
  qtyPurchased: ["quantitypurchased"],
  qtyShipped: ["quantityshipped"],
  qtyToShip: ["quantitytoship"],
  qtyCanceled: ["quantitycanceled", "quantitycancelled"],
  retailPriceTotal: ["retailpricetotal"],
  goodsBasePrice: ["goodsbaseprice"],
  activityGoodsBasePrice: ["activitygoodsbaseprice"],
  shippingCost: ["shippingcost"],
  taxTotal: ["producttaxtotal"],
  discountTemu: ["discountfromtemu"],
  discountSeller: ["discountfromseller"],
  carrier: ["carrier"],
  trackingNumber: ["trackingnumber"],
  settlementStatus: ["ordersettlementstatus", "settlementstatus"],
  city: ["shipcity"],
  state: ["shipstate"],
  country: ["shipcountry"],
  purchaseDate: ["purchasedate"]
};
var KNOWN_TOKENS = new Set(Object.values(FIELD_HEADERS).flat());
var normalize = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
function fixSheetRange(ws) {
  const addrs = Object.keys(ws).filter((k) => !k.startsWith("!"));
  if (addrs.length === 0) return;
  let minR = Infinity;
  let minC = Infinity;
  let maxR = 0;
  let maxC = 0;
  for (const a of addrs) {
    const c = XLSX.utils.decode_cell(a);
    if (c.r < minR) minR = c.r;
    if (c.c < minC) minC = c.c;
    if (c.r > maxR) maxR = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } });
}
function pickSheet(wb) {
  const names = wb.SheetNames;
  const isJunk = (n) => /courier|instruction|guide|readme|help|cover/i.test(n);
  const preferred = (n) => /order|report|sales|transaction|item/i.test(n);
  const candidates = names.filter((n) => !isJunk(n));
  const pool = candidates.length ? candidates : names;
  const byName = pool.find((n) => preferred(n));
  if (byName) return byName;
  let best = pool[0];
  let bestCells = -1;
  for (const n of pool) {
    const cells = Object.keys(wb.Sheets[n]).filter((k) => !k.startsWith("!")).length;
    if (cells > bestCells) {
      bestCells = cells;
      best = n;
    }
  }
  return best;
}
function findHeaderRow(aoa) {
  const limit = Math.min(aoa.length, 25);
  let bestRow = 0;
  let bestScore = -1;
  for (let r = 0; r < limit; r++) {
    const row = aoa[r] ?? [];
    let known = 0;
    let filled = 0;
    for (const cell of row) {
      const n = normalize(cell);
      if (!n) continue;
      filled++;
      if (KNOWN_TOKENS.has(n)) known++;
    }
    const score = known * 100 + filled;
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}
function detectColumns(headers) {
  const mapping = {};
  const used = /* @__PURE__ */ new Set();
  const normd = headers.map((h) => normalize(h));
  for (const field of Object.keys(FIELD_HEADERS)) {
    for (const candidate of FIELD_HEADERS[field]) {
      const idx = normd.findIndex((n, i) => !used.has(i) && n === candidate);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}
var CURRENCY_SYMBOLS = [
  { re: /£/, code: "GBP" },
  { re: /€/, code: "EUR" },
  { re: /\$/, code: "USD" },
  { re: /¥|円/, code: "JPY" }
];
function toNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function toStr(value) {
  if (value == null) return "";
  return String(value).trim();
}
var MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};
function parsePurchaseDate(raw) {
  if (!raw) return null;
  const m = raw.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (mon && day) {
      const key = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const label = `${m[1].slice(0, 3)} ${day}`;
      return { key, label, sort: year * 1e4 + mon * 100 + day };
    }
  }
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return {
      key: `${y}-${mo}-${d}`,
      label: `${mo}/${d}`,
      sort: +y * 1e4 + +mo * 100 + +d
    };
  }
  return null;
}
function detectCurrency(rows, moneyCols) {
  for (const row of rows.slice(0, 50)) {
    for (const col of moneyCols) {
      const v = row[col];
      if (typeof v === "string") {
        for (const { re, code } of CURRENCY_SYMBOLS) {
          if (re.test(v)) return code;
        }
      }
    }
  }
  return "USD";
}
function buildItem(raw, m, index) {
  const get = (f) => m[f] ? raw[m[f]] : void 0;
  const qtyPurchased = toNumber(get("qtyPurchased"));
  const qtyShipped = toNumber(get("qtyShipped"));
  const qtyToShip = toNumber(get("qtyToShip"));
  const qtyCanceled = toNumber(get("qtyCanceled"));
  const retail = toNumber(get("retailPriceTotal"));
  const goodsBase = toNumber(get("goodsBasePrice"));
  const activityBase = toNumber(get("activityGoodsBasePrice"));
  const units = qtyPurchased || 1;
  let revenue = retail;
  if (revenue <= 0) revenue = (activityBase || goodsBase) * units;
  const discount = toNumber(get("discountTemu")) + toNumber(get("discountSeller"));
  const orderId = toStr(get("orderId")) || `ROW-${index + 1}`;
  const sku = toStr(get("contributionSku")) || toStr(get("skuId"));
  const status = toStr(get("status")) || toStr(get("itemStatus")) || "Unknown";
  const purchaseDateRaw = toStr(get("purchaseDate"));
  return {
    id: `${orderId}-${toStr(get("orderItemId")) || index}`,
    orderId,
    orderItemId: toStr(get("orderItemId")),
    status,
    fulfillmentMode: toStr(get("fulfillmentMode")),
    productName: toStr(get("productName")) || sku || orderId,
    variation: toStr(get("variation")),
    sku: sku || "\u2014",
    qtyPurchased,
    qtyShipped,
    qtyToShip,
    qtyCanceled,
    revenue,
    goodsBasePrice: goodsBase,
    shippingCost: toNumber(get("shippingCost")),
    taxTotal: toNumber(get("taxTotal")),
    discount,
    carrier: toStr(get("carrier")) || "\u2014",
    trackingNumber: toStr(get("trackingNumber")),
    settlementStatus: toStr(get("settlementStatus")),
    city: toStr(get("city")),
    state: toStr(get("state")),
    country: toStr(get("country")) || "\u2014",
    purchaseDate: parsePurchaseDate(purchaseDateRaw),
    purchaseDateRaw,
    awaitingShipment: qtyToShip > 0,
    raw
  };
}
function computeKpis(items) {
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const unitsSold = items.reduce((s, i) => s + i.qtyPurchased, 0);
  const orderIds = new Set(items.map((i) => i.orderId));
  const awaitingShipment = items.filter((i) => i.awaitingShipment).length;
  const canceledUnits = items.reduce((s, i) => s + i.qtyCanceled, 0);
  const totalDiscount = items.reduce((s, i) => s + i.discount, 0);
  return {
    totalRevenue,
    unitsSold,
    orderCount: orderIds.size,
    itemCount: items.length,
    avgOrderValue: orderIds.size > 0 ? totalRevenue / orderIds.size : 0,
    awaitingShipment,
    canceledUnits,
    totalDiscount
  };
}
function parseWorkbook(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: "array" });
  if (workbook.SheetNames.length === 0) {
    throw new Error("The workbook contains no sheets.");
  }
  const sheetName = pickSheet(workbook);
  const sheet = workbook.Sheets[sheetName];
  fixSheetRange(sheet);
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false
  });
  if (aoa.length === 0) {
    throw new Error(`Sheet "${sheetName}" has no rows.`);
  }
  const headerRowIdx = findHeaderRow(aoa);
  const headers = (aoa[headerRowIdx] ?? []).map((h) => toStr(h));
  const mapping = detectColumns(headers);
  if (mapping.orderId == null && mapping.productName == null) {
    throw new Error(
      `Could not find an order header row in sheet "${sheetName}". Expected columns like "Order ID" / "product name".`
    );
  }
  const dataRows = aoa.slice(headerRowIdx + 1);
  const records = dataRows.map((row) => {
    const rec = {};
    headers.forEach((h, c) => {
      if (h) rec[h] = row[c] ?? "";
    });
    return rec;
  }).filter((rec) => Object.values(rec).some((v) => v !== "" && v != null));
  if (records.length === 0) {
    throw new Error(`Sheet "${sheetName}" has headers but no order rows.`);
  }
  const moneyCols = [
    mapping.retailPriceTotal,
    mapping.goodsBasePrice,
    mapping.activityGoodsBasePrice,
    mapping.shippingCost,
    mapping.discountTemu
  ].filter(Boolean);
  const currency = detectCurrency(records, moneyCols);
  const items = records.map((r, i) => buildItem(r, mapping, i));
  const warnings = [];
  if (!mapping.retailPriceTotal && !mapping.goodsBasePrice && !mapping.activityGoodsBasePrice) {
    warnings.push("No price/revenue column detected \u2014 revenue metrics may read as zero.");
  }
  if (!mapping.status && !mapping.itemStatus) {
    warnings.push("No order-status column detected \u2014 status breakdown is unavailable.");
  }
  if (!mapping.purchaseDate) {
    warnings.push("No purchase-date column detected \u2014 the sales-over-time trend is hidden.");
  }
  return {
    items,
    kpis: computeKpis(items),
    mapping,
    headers,
    sheetName,
    fileName,
    rowCount: records.length,
    currency,
    warnings
  };
}
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseWorkbook(reader.result, file.name));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to parse the file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsArrayBuffer(file);
  });
}
export {
  parseExcelFile,
  parseWorkbook
};
