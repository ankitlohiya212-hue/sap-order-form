export type SheetCell = string | number | boolean | null | undefined;

export type Party = {
  code: string;
  suffix: string;
  name: string;
  city: string;
  searchText: string;
};

export type ItemMaster = {
  code: string;
  name: string;
  nickname: string;
  searchText: string;
};

export type ProductRow = {
  code: string;
  description: string;
  rowNumber: number;
  caseRate: number;
  balance: number;
};

export type OrderLineInput = {
  itemCode: string;
  quantity: number | string;
};

export type ResolvedOrderLine = {
  item: ItemMaster;
  product: ProductRow;
  quantity: number;
};

export type ResolvedOrder = {
  party: Party;
  lines: ResolvedOrderLine[];
  totalQuantity: number;
  piValue: number;
};

export type NextOrderColumn = {
  col: number;
  letter: string;
  previousCol: number;
  previousLetter: string;
  requiresColumnAppend: boolean;
};

export type BootstrapPayload = {
  targetSheet: string;
  targetSheetCandidates: string[];
  nextColumn: NextOrderColumn;
  parties: Party[];
  items: ItemMaster[];
  products: ProductRow[];
};
