import { describe, expect, it } from "vitest";
import {
  buildCurrentMonthCandidates,
  buildOrderColumnValues,
  customerSuffix,
  detectNextOrderColumn,
  fullCustomerCode,
  OrderValidationError,
  parseItems,
  parseParties,
  parseProducts,
  resolveOrder,
  selectCurrentMonthSheet
} from "./order-logic";

const parties = parseParties([
  ["Customer", "Name of Customer", "City"],
  ["5001001958", "Manoj Traders", "GANDHINAGAR"],
  [5001002108, "Siddhivinayak Enterprise", "MAPUSA"]
]);

const items = parseItems([
  ["Prod Code", "Product Discription", "Product Nick Name"],
  ["F7000134", "K M Cone Pink 25g", "pink cone"],
  ["C7500042", "KCHC MINI-N.BlK24G", "mini easy fast"]
]);

const monthlyValues = [
  [],
  [],
  [],
  [],
  [],
  [null, null, null, null, null, "Manoj Tdrs", "Lucky Koregaon"],
  [],
  [],
  ["F7000134", "K M Cone Pink 25g", 2168, 278, 195],
  ["C7500042", "KCHC MINI-N.BlK24G", 2953.85, 47, 9]
];

const products = parseProducts(monthlyValues);

describe("current month tab detection", () => {
  it("builds 2-digit and 4-digit current month tab names", () => {
    expect(buildCurrentMonthCandidates(new Date("2026-06-10T12:00:00Z"))).toEqual([
      "SMKDR June 26",
      "SMKDR June 2026"
    ]);
  });

  it("selects the current month tab by exact monthly format", () => {
    expect(
      selectCurrentMonthSheet(["SAP Codes", "SMKDR May 26", "SMKDR June 2026"], new Date("2026-06-10T12:00:00Z"))
    ).toEqual({
      targetSheet: "SMKDR June 2026",
      candidates: ["SMKDR June 26", "SMKDR June 2026"]
    });
  });

  it("fails clearly when the current month tab is missing", () => {
    expect(() =>
      selectCurrentMonthSheet(["SMKDR May 26"], new Date("2026-06-10T12:00:00Z"))
    ).toThrow("SMKDR June 26 or SMKDR June 2026");
  });
});

describe("customer code helpers", () => {
  it("normalizes full codes and suffixes", () => {
    expect(customerSuffix("5001002108")).toBe("2108");
    expect(customerSuffix("991")).toBe("0991");
    expect(fullCustomerCode("2108")).toBe("5001002108");
    expect(fullCustomerCode("5001001958")).toBe("5001001958");
  });
});

describe("sheet parsing", () => {
  it("parses party and item lookup rows", () => {
    expect(parties[0]).toMatchObject({ code: "5001001958", suffix: "1958", name: "Manoj Traders" });
    expect(items[1]).toMatchObject({ code: "C7500042", nickname: "mini easy fast" });
  });

  it("detects the next order column after the last party", () => {
    expect(detectNextOrderColumn(monthlyValues, 10)).toMatchObject({
      col: 8,
      letter: "H",
      previousCol: 7,
      previousLetter: "G",
      requiresColumnAppend: false
    });
    expect(detectNextOrderColumn(monthlyValues, 7)).toMatchObject({
      col: 8,
      requiresColumnAppend: true
    });
  });
});

describe("order validation", () => {
  it("aggregates duplicate items and validates balance", () => {
    const order = resolveOrder(
      "1958",
      [
        { itemCode: "F7000134", quantity: "2.5" },
        { itemCode: "F7000134", quantity: 1.5 },
        { itemCode: "C7500042", quantity: 2 }
      ],
      parties,
      items,
      products
    );
    expect(order.party.name).toBe("Manoj Traders");
    expect(order.lines).toHaveLength(2);
    expect(order.totalQuantity).toBe(6);
    expect(order.piValue).toBeCloseTo(4 * 2168 + 2 * 2953.85);
  });

  it("blocks quantities above Bal Qty", () => {
    expect(() =>
      resolveOrder("1958", [{ itemCode: "C7500042", quantity: 10 }], parties, items, products)
    ).toThrow(OrderValidationError);
  });

  it("blocks item master rows missing from the current month sheet", () => {
    const reducedProducts = products.filter((product) => product.code !== "F7000134");
    expect(() =>
      resolveOrder("1958", [{ itemCode: "F7000134", quantity: 1 }], parties, items, reducedProducts)
    ).toThrow("not present in the current month sheet");
  });

  it("builds the exact single-column payload for Google Sheets", () => {
    const order = resolveOrder("1958", [{ itemCode: "F7000134", quantity: 3 }], parties, items, products);
    expect(buildOrderColumnValues(order, 8, products)).toEqual([
      [""],
      [""],
      [""],
      ["=SUMPRODUCT($C$9:$C$10,H9:H10)"],
      [""],
      ["Manoj Traders"],
      ["1958"],
      ["=SUM(H9:H10)"],
      [3],
      [""]
    ]);
  });
});
