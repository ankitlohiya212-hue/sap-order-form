import { google, sheets_v4 } from "googleapis";
import {
  buildOrderColumnValues,
  detectNextOrderColumn,
  formatNumber,
  parseItems,
  parseParties,
  parseProducts,
  quoteSheetName,
  resolveOrder,
  selectCurrentMonthSheet,
  toColumnLetter
} from "./order-logic";
import type { BootstrapPayload, OrderLineInput, SheetCell } from "./types";

type SheetMeta = {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
};

type LoadedSheetState = BootstrapPayload & {
  targetSheetId: number;
  targetGridRows: number;
  targetGridColumns: number;
  targetValues: SheetCell[][];
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function spreadsheetId(): string {
  return requiredEnv("GOOGLE_SHEET_ID");
}

function timezone(): string {
  return process.env.ORDER_ENTRY_TIMEZONE || "Asia/Kolkata";
}

function customerPrefix(): string {
  return process.env.CUSTOMER_ID_PREFIX || "500100";
}

function privateKey(): string {
  return requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

async function sheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = new google.auth.JWT({
    email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: privateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  await auth.authorize();
  return google.sheets({ auth, version: "v4" });
}

function sheetMetadata(response: sheets_v4.Schema$Spreadsheet): SheetMeta[] {
  return (
    response.sheets
      ?.map((sheet) => {
        const properties = sheet.properties;
        const grid = properties?.gridProperties;
        if (
          properties?.sheetId === null ||
          properties?.sheetId === undefined ||
          !properties.title
        ) {
          return null;
        }
        return {
          sheetId: properties.sheetId,
          title: properties.title,
          rowCount: grid?.rowCount ?? 100,
          columnCount: grid?.columnCount ?? 26
        };
      })
      .filter((sheet): sheet is SheetMeta => Boolean(sheet)) ?? []
  );
}

async function getMetadata(api: sheets_v4.Sheets): Promise<SheetMeta[]> {
  const response = await api.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: "sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))"
  });
  return sheetMetadata(response.data);
}

async function getValues(api: sheets_v4.Sheets, range: string): Promise<SheetCell[][]> {
  const response = await api.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });
  return (response.data.values ?? []) as SheetCell[][];
}

async function loadSheetState(): Promise<LoadedSheetState> {
  const api = await sheetsClient();
  const metadata = await getMetadata(api);
  const { targetSheet, candidates } = selectCurrentMonthSheet(
    metadata.map((sheet) => sheet.title),
    new Date(),
    timezone()
  );
  const targetMeta = metadata.find((sheet) => sheet.title === targetSheet);
  if (!targetMeta) {
    throw new Error(`Could not read metadata for ${targetSheet}.`);
  }

  const targetRange = `${quoteSheetName(targetSheet)}!A1:${toColumnLetter(
    targetMeta.columnCount
  )}${targetMeta.rowCount}`;
  const [partyValues, itemValues, targetValues] = await Promise.all([
    getValues(api, `${quoteSheetName("SAP Codes")}!A1:F500`),
    getValues(api, `${quoteSheetName("Item Codes")}!A1:C1000`),
    getValues(api, targetRange)
  ]);

  const parties = parseParties(partyValues, customerPrefix());
  const items = parseItems(itemValues);
  const products = parseProducts(targetValues);
  const nextColumn = detectNextOrderColumn(targetValues, targetMeta.columnCount);

  return {
    targetSheet,
    targetSheetCandidates: candidates,
    targetSheetId: targetMeta.sheetId,
    targetGridRows: targetMeta.rowCount,
    targetGridColumns: targetMeta.columnCount,
    targetValues,
    nextColumn,
    parties,
    items,
    products
  };
}

async function appendAndPrepareColumn(
  api: sheets_v4.Sheets,
  state: LoadedSheetState
): Promise<void> {
  if (!state.nextColumn.requiresColumnAppend) {
    return;
  }
  const extraColumns = state.nextColumn.col - state.targetGridColumns;
  await api.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          appendDimension: {
            sheetId: state.targetSheetId,
            dimension: "COLUMNS",
            length: extraColumns
          }
        },
        {
          copyPaste: {
            source: {
              sheetId: state.targetSheetId,
              startRowIndex: 0,
              endRowIndex: state.targetGridRows,
              startColumnIndex: state.nextColumn.previousCol - 1,
              endColumnIndex: state.nextColumn.previousCol
            },
            destination: {
              sheetId: state.targetSheetId,
              startRowIndex: 0,
              endRowIndex: state.targetGridRows,
              startColumnIndex: state.nextColumn.col - 1,
              endColumnIndex: state.nextColumn.col
            },
            pasteType: "PASTE_FORMAT",
            pasteOrientation: "NORMAL"
          }
        },
        {
          copyPaste: {
            source: {
              sheetId: state.targetSheetId,
              startRowIndex: 0,
              endRowIndex: state.targetGridRows,
              startColumnIndex: state.nextColumn.previousCol - 1,
              endColumnIndex: state.nextColumn.previousCol
            },
            destination: {
              sheetId: state.targetSheetId,
              startRowIndex: 0,
              endRowIndex: state.targetGridRows,
              startColumnIndex: state.nextColumn.col - 1,
              endColumnIndex: state.nextColumn.col
            },
            pasteType: "PASTE_FORMULA",
            pasteOrientation: "NORMAL"
          }
        }
      ]
    }
  });
}

export async function getBootstrapPayload(): Promise<BootstrapPayload> {
  const state = await loadSheetState();
  return {
    targetSheet: state.targetSheet,
    targetSheetCandidates: state.targetSheetCandidates,
    nextColumn: state.nextColumn,
    parties: state.parties,
    items: state.items,
    products: state.products
  };
}

export async function submitOrderToSheet(
  partyCode: string,
  lines: OrderLineInput[]
): Promise<{
  targetSheet: string;
  column: string;
  partyName: string;
  sapSuffix: string;
  totalQuantity: string;
  piValue: string;
}> {
  const api = await sheetsClient();
  const state = await loadSheetState();
  const order = resolveOrder(
    partyCode,
    lines,
    state.parties,
    state.items,
    state.products,
    customerPrefix()
  );

  await appendAndPrepareColumn(api, state);

  const values = buildOrderColumnValues(order, state.nextColumn.col, state.products);
  await api.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${quoteSheetName(state.targetSheet)}!${state.nextColumn.letter}1:${state.nextColumn.letter}${values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });

  return {
    targetSheet: state.targetSheet,
    column: state.nextColumn.letter,
    partyName: order.party.name,
    sapSuffix: order.party.suffix,
    totalQuantity: formatNumber(order.totalQuantity),
    piValue: formatNumber(order.piValue)
  };
}
