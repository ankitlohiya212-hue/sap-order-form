import type {
  ItemMaster,
  NextOrderColumn,
  OrderLineInput,
  Party,
  ProductRow,
  ResolvedOrder,
  ResolvedOrderLine,
  SheetCell
} from "./types";

export const FIRST_ORDER_COL = 6;
export const PI_VALUE_ROW = 4;
export const PI_NUMBER_ROW = 5;
export const PARTY_ROW = 6;
export const SAP_CODE_ROW = 7;
export const TOTAL_CS_ROW = 8;
export const ITEM_START_ROW = 9;
export const MATERIAL_COL = 1;
export const DESCRIPTION_COL = 2;
export const CASE_RATE_COL = 3;
export const BAL_QTY_COL = 5;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

export class OrderValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join("\n"));
    this.name = "OrderValidationError";
    this.issues = issues;
  }
}

export function isBlank(value: SheetCell): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

export function toColumnLetter(col: number): string {
  if (!Number.isInteger(col) || col < 1) {
    throw new Error(`Invalid column number: ${col}`);
  }
  let n = col;
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replaceAll("'", "''")}'`;
}

export function cell(values: SheetCell[][], row: number, col: number): SheetCell {
  return values[row - 1]?.[col - 1];
}

export function cleanText(value: SheetCell): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return String(value).trim();
}

export function cleanNumber(value: SheetCell): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = cleanText(value).replace(/,/g, "");
  if (!text) {
    return 0;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function customerSuffix(code: string, prefix = "500100"): string {
  const clean = code.replace(/\D/g, "");
  if (!clean) {
    return "";
  }
  if (prefix && clean.startsWith(prefix)) {
    return clean.slice(prefix.length).padStart(4, "0");
  }
  return clean.slice(-4).padStart(4, "0");
}

export function fullCustomerCode(codeOrSuffix: string, prefix = "500100"): string {
  const clean = codeOrSuffix.replace(/\D/g, "");
  if (!clean) {
    return "";
  }
  if (prefix && clean.startsWith(prefix)) {
    return clean;
  }
  return `${prefix}${clean.slice(-4).padStart(4, "0")}`;
}

export function buildCurrentMonthCandidates(
  date = new Date(),
  timezone = "Asia/Kolkata"
): string[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: timezone,
    year: "numeric"
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? MONTHS[date.getMonth()];
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getFullYear());
  return [`SMKDR ${month} ${year.slice(-2)}`, `SMKDR ${month} ${year}`];
}

export function selectCurrentMonthSheet(
  sheetTitles: string[],
  date = new Date(),
  timezone = "Asia/Kolkata"
): { targetSheet: string; candidates: string[] } {
  const candidates = buildCurrentMonthCandidates(date, timezone);
  const byLower = new Map(sheetTitles.map((title) => [title.trim().toLowerCase(), title]));
  const targetSheet = candidates
    .map((candidate) => byLower.get(candidate.toLowerCase()))
    .find((title): title is string => Boolean(title));
  if (!targetSheet) {
    throw new Error(`Current month tab not found. Expected ${candidates.join(" or ")}.`);
  }
  return { targetSheet, candidates };
}

export function parseParties(values: SheetCell[][], prefix = "500100"): Party[] {
  const parties: Party[] = [];
  const seen = new Set<string>();
  for (const row of values.slice(1)) {
    const rawCode = cleanText(row[0]);
    const name = cleanText(row[1]);
    if (!rawCode || !name) {
      continue;
    }
    const code = fullCustomerCode(rawCode, prefix);
    if (!code || seen.has(code)) {
      continue;
    }
    const city = cleanText(row[2]);
    const suffix = customerSuffix(code, prefix);
    parties.push({
      code,
      suffix,
      name,
      city,
      searchText: `${name} ${city} ${code} ${suffix}`.toLowerCase()
    });
    seen.add(code);
  }
  return parties;
}

export function parseItems(values: SheetCell[][]): ItemMaster[] {
  const items: ItemMaster[] = [];
  const seen = new Set<string>();
  for (const row of values.slice(1)) {
    const code = cleanText(row[0]).toUpperCase();
    const name = cleanText(row[1]);
    const nickname = cleanText(row[2]);
    if (!code || !name || seen.has(code)) {
      continue;
    }
    items.push({
      code,
      name,
      nickname,
      searchText: `${code} ${name} ${nickname}`.toLowerCase()
    });
    seen.add(code);
  }
  return items;
}

export function parseProducts(values: SheetCell[][]): ProductRow[] {
  const products: ProductRow[] = [];
  const seen = new Set<string>();
  for (let rowNumber = ITEM_START_ROW; rowNumber <= values.length; rowNumber += 1) {
    const code = cleanText(cell(values, rowNumber, MATERIAL_COL)).toUpperCase();
    if (!code || seen.has(code)) {
      continue;
    }
    products.push({
      code,
      description: cleanText(cell(values, rowNumber, DESCRIPTION_COL)),
      rowNumber,
      caseRate: cleanNumber(cell(values, rowNumber, CASE_RATE_COL)),
      balance: cleanNumber(cell(values, rowNumber, BAL_QTY_COL))
    });
    seen.add(code);
  }
  return products;
}

export function detectNextOrderColumn(
  values: SheetCell[][],
  gridColumnCount: number
): NextOrderColumn {
  const row = values[PARTY_ROW - 1] ?? [];
  let lastPartyCol = FIRST_ORDER_COL - 1;
  for (let col = FIRST_ORDER_COL; col <= Math.max(row.length, gridColumnCount); col += 1) {
    if (!isBlank(row[col - 1])) {
      lastPartyCol = col;
    }
  }
  const col = lastPartyCol + 1;
  const previousCol = Math.max(FIRST_ORDER_COL, col - 1);
  return {
    col,
    letter: toColumnLetter(col),
    previousCol,
    previousLetter: toColumnLetter(previousCol),
    requiresColumnAppend: col > gridColumnCount
  };
}

export function normalizeQuantity(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid quantity: ${value}`);
  }
  return parsed;
}

export function resolveOrder(
  partyCode: string,
  rawLines: OrderLineInput[],
  parties: Party[],
  items: ItemMaster[],
  products: ProductRow[],
  prefix = "500100"
): ResolvedOrder {
  const issues: string[] = [];
  const partyLookup = new Map(parties.map((party) => [party.code, party]));
  const itemLookup = new Map(items.map((item) => [item.code, item]));
  const productLookup = new Map(products.map((product) => [product.code, product]));
  const normalizedPartyCode = fullCustomerCode(partyCode, prefix);
  const party = partyLookup.get(normalizedPartyCode);
  if (!party) {
    issues.push("Party is not present in SAP Codes.");
  }

  const aggregated = new Map<string, number>();
  rawLines.forEach((line, index) => {
    const itemCode = cleanText(line.itemCode).toUpperCase();
    if (!itemCode) {
      issues.push(`Line ${index + 1}: item is required.`);
      return;
    }
    let quantity = 0;
    try {
      quantity = normalizeQuantity(line.quantity);
    } catch {
      issues.push(`Line ${index + 1}: quantity must be a number.`);
      return;
    }
    if (quantity <= 0) {
      issues.push(`Line ${index + 1}: quantity must be greater than 0.`);
      return;
    }
    aggregated.set(itemCode, (aggregated.get(itemCode) ?? 0) + quantity);
  });

  if (aggregated.size === 0) {
    issues.push("Add at least one item.");
  }

  const lines: ResolvedOrderLine[] = [];
  for (const [itemCode, quantity] of aggregated.entries()) {
    const item = itemLookup.get(itemCode);
    if (!item) {
      issues.push(`${itemCode}: item is not present in Item Codes.`);
      continue;
    }
    const product = productLookup.get(itemCode);
    if (!product) {
      issues.push(`${itemCode}: item is not present in the current month sheet.`);
      continue;
    }
    if (quantity > product.balance) {
      issues.push(
        `${itemCode}: requested ${formatNumber(quantity)} CS exceeds balance ${formatNumber(
          product.balance
        )} CS.`
      );
      continue;
    }
    lines.push({ item, product, quantity });
  }

  if (issues.length > 0 || !party) {
    throw new OrderValidationError(issues);
  }

  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const piValue = lines.reduce((sum, line) => sum + line.quantity * line.product.caseRate, 0);
  return { party, lines, totalQuantity, piValue };
}

export function buildOrderColumnValues(
  order: ResolvedOrder,
  orderCol: number,
  products: ProductRow[]
): (string | number)[][] {
  const colLetter = toColumnLetter(orderCol);
  const lastProductRow = Math.max(...products.map((product) => product.rowNumber), ITEM_START_ROW);
  const quantityByRow = new Map(order.lines.map((line) => [line.product.rowNumber, line.quantity]));
  const rows: (string | number)[][] = [];
  for (let row = 1; row <= lastProductRow; row += 1) {
    if (row <= 3) {
      rows.push([""]);
    } else if (row === PI_VALUE_ROW) {
      rows.push([`=SUMPRODUCT($C$${ITEM_START_ROW}:$C$${lastProductRow},${colLetter}${ITEM_START_ROW}:${colLetter}${lastProductRow})`]);
    } else if (row === PI_NUMBER_ROW) {
      rows.push([""]);
    } else if (row === PARTY_ROW) {
      rows.push([order.party.name]);
    } else if (row === SAP_CODE_ROW) {
      rows.push([order.party.suffix]);
    } else if (row === TOTAL_CS_ROW) {
      rows.push([`=SUM(${colLetter}${ITEM_START_ROW}:${colLetter}${lastProductRow})`]);
    } else {
      rows.push([quantityByRow.get(row) ?? ""]);
    }
  }
  return rows;
}

export function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
