"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { BootstrapPayload, ItemMaster, Party, ProductRow } from "@/lib/types";

type OrderLine = {
  id: string;
  itemCode: string;
  quantity: string;
};

type ApiStatus =
  | { kind: "idle"; message: "" }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; issues?: string[] };

function newLine(): OrderLine {
  return {
    id: crypto.randomUUID(),
    itemCode: "",
    quantity: ""
  };
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function itemLabel(item: ItemMaster): string {
  return item.nickname ? `${item.nickname} · ${item.code}` : `${item.name} · ${item.code}`;
}

function SearchSelect<T>({
  disabled,
  getKey,
  getLabel,
  getMeta,
  onChange,
  options,
  placeholder,
  search,
  value
}: {
  disabled?: boolean;
  getKey: (option: T) => string;
  getLabel: (option: T) => string;
  getMeta: (option: T) => string;
  onChange: (key: string) => void;
  options: T[];
  placeholder: string;
  search: (option: T) => string;
  value: string;
}) {
  const selected = options.find((option) => getKey(option) === value);
  const [query, setQuery] = useState(selected ? getLabel(selected) : "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nextSelected = options.find((option) => getKey(option) === value);
    if (nextSelected) {
      setQuery(getLabel(nextSelected));
    }
  }, [getKey, getLabel, options, value]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options.slice(0, 8);
    }
    return options.filter((option) => search(option).includes(normalized)).slice(0, 12);
  }, [options, query, search]);

  return (
    <div className="combo">
      <Search aria-hidden="true" className="comboIcon" size={17} />
      <input
        disabled={disabled}
        onBlur={() => window.setTimeout(() => setOpen(false), 130)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) {
            onChange("");
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        value={query}
      />
      {open && !disabled ? (
        <div className="comboMenu">
          {filtered.length ? (
            filtered.map((option) => (
              <button
                className="comboOption"
                key={getKey(option)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(getKey(option));
                  setQuery(getLabel(option));
                  setOpen(false);
                }}
                type="button"
              >
                <span>{getLabel(option)}</span>
                <small>{getMeta(option)}</small>
              </button>
            ))
          ) : (
            <div className="comboEmpty">No match</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => Promise<void> }) {
  const [passcode, setPasscode] = useState("");
  const [status, setStatus] = useState<ApiStatus>({ kind: "idle", message: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus({ kind: "loading", message: "Checking passcode" });
    const response = await fetch("/api/session", {
      body: JSON.stringify({ passcode }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    if (!response.ok) {
      setStatus({ kind: "error", message: "Invalid passcode." });
      return;
    }
    await onLogin();
  }

  return (
    <main className="loginShell">
      <form className="loginPanel" onSubmit={submit}>
        <div className="mark">
          <ShieldCheck size={22} />
        </div>
        <h1>SAP Order Entry</h1>
        <label htmlFor="passcode">Passcode</label>
        <input
          autoFocus
          id="passcode"
          onChange={(event) => setPasscode(event.target.value)}
          type="password"
          value={passcode}
        />
        <button className="primaryButton" disabled={status.kind === "loading"} type="submit">
          {status.kind === "loading" ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
          Unlock
        </button>
        {status.kind === "error" ? <p className="inlineError">{status.message}</p> : null}
      </form>
    </main>
  );
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [partyCode, setPartyCode] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([newLine()]);
  const [status, setStatus] = useState<ApiStatus>({ kind: "idle", message: "" });
  const [loadingData, setLoadingData] = useState(false);

  const productByCode = useMemo(() => {
    return new Map(data?.products.map((product) => [product.code, product]) ?? []);
  }, [data]);
  const itemByCode = useMemo(() => {
    return new Map(data?.items.map((item) => [item.code, item]) ?? []);
  }, [data]);
  const selectedParty = data?.parties.find((party) => party.code === partyCode);

  async function loadBootstrap() {
    setLoadingData(true);
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      setData(null);
      setLoadingData(false);
      return;
    }
    const payload = await response.json();
    if (!response.ok) {
      setStatus({ kind: "error", message: payload.error || "Could not load sheet data." });
      setAuthenticated(true);
      setLoadingData(false);
      return;
    }
    setData(payload);
    setAuthenticated(true);
    setStatus({ kind: "idle", message: "" });
    setLoadingData(false);
  }

  useEffect(() => {
    void loadBootstrap();
  }, []);

  const issues = useMemo(() => {
    const errors: string[] = [];
    if (!selectedParty) {
      errors.push("Select a party.");
    }
    const aggregate = new Map<string, number>();
    for (const [index, line] of lines.entries()) {
      if (!line.itemCode && !line.quantity.trim()) {
        continue;
      }
      if (!line.itemCode) {
        errors.push(`Line ${index + 1}: select an item.`);
        continue;
      }
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(`Line ${index + 1}: enter a quantity greater than 0.`);
        continue;
      }
      aggregate.set(line.itemCode, (aggregate.get(line.itemCode) ?? 0) + quantity);
    }
    if (aggregate.size === 0) {
      errors.push("Add at least one item.");
    }
    for (const [itemCode, quantity] of aggregate.entries()) {
      const product = productByCode.get(itemCode);
      if (!product) {
        errors.push(`${itemCode}: not present in the current month sheet.`);
      } else if (quantity > product.balance) {
        errors.push(`${itemCode}: ${formatNumber(quantity)} CS exceeds ${formatNumber(product.balance)} CS balance.`);
      }
    }
    return errors;
  }, [lines, productByCode, selectedParty]);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const quantity = Number(line.quantity);
        const product = productByCode.get(line.itemCode);
        if (Number.isFinite(quantity) && quantity > 0) {
          acc.cs += quantity;
          acc.value += quantity * (product?.caseRate ?? 0);
        }
        return acc;
      },
      { cs: 0, value: 0 }
    );
  }, [lines, productByCode]);

  async function submitOrder() {
    if (issues.length) {
      setStatus({ kind: "error", message: "Fix the order before submitting.", issues });
      return;
    }
    setStatus({ kind: "loading", message: "Writing order to Google Sheets" });
    const response = await fetch("/api/orders", {
      body: JSON.stringify({
        partyCode,
        lines: lines
          .filter((line) => line.itemCode && line.quantity.trim())
          .map((line) => ({ itemCode: line.itemCode, quantity: line.quantity }))
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus({
        kind: "error",
        message: payload.error || "Could not submit order.",
        issues: payload.issues
      });
      return;
    }
    setStatus({
      kind: "success",
      message: `Saved ${payload.order.partyName} in ${payload.order.targetSheet}!${payload.order.column}`
    });
    setLines([newLine()]);
    await loadBootstrap();
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setAuthenticated(false);
    setData(null);
    setPartyCode("");
    setLines([newLine()]);
  }

  if (authenticated === false) {
    return <LoginScreen onLogin={loadBootstrap} />;
  }

  if (authenticated === null || !data) {
    return (
      <main className="loadingShell">
        <Loader2 className="spin" size={28} />
        <span>Loading</span>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Order Entry</p>
          <h1>{data.targetSheet}</h1>
        </div>
        <div className="topActions">
          <div className="metric">
            <span>Next</span>
            <strong>{data.nextColumn.letter}</strong>
          </div>
          <button className="iconButton" disabled={loadingData} onClick={loadBootstrap} title="Refresh sheet data" type="button">
            {loadingData ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          </button>
          <button className="iconButton" onClick={logout} title="Logout" type="button">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="entryPanel">
          <div className="fieldBlock">
            <label>Party</label>
            <SearchSelect<Party>
              getKey={(party) => party.code}
              getLabel={(party) => party.name}
              getMeta={(party) => `${party.suffix} · ${party.city || "No city"}`}
              onChange={setPartyCode}
              options={data.parties}
              placeholder="Search party name or code"
              search={(party) => party.searchText}
              value={partyCode}
            />
          </div>

          <div className="lineHeader">
            <div>
              <h2>Items</h2>
              <p>{formatNumber(totals.cs)} CS · PI value {formatNumber(totals.value)}</p>
            </div>
            <button className="ghostButton" onClick={() => setLines((prev) => [...prev, newLine()])} type="button">
              <Plus size={17} />
              Add
            </button>
          </div>

          <div className="linesTable">
            <div className="tableHead">
              <span>Item</span>
              <span>Balance</span>
              <span>Qty CS</span>
              <span />
            </div>
            {lines.map((line, index) => {
              const item = itemByCode.get(line.itemCode);
              const product = productByCode.get(line.itemCode);
              const qty = Number(line.quantity);
              const over = product && Number.isFinite(qty) && qty > product.balance;
              return (
                <div className="lineRow" key={line.id}>
                  <div>
                    <SearchSelect<ItemMaster>
                      getKey={(option) => option.code}
                      getLabel={itemLabel}
                      getMeta={(option) => option.name}
                      onChange={(itemCode) =>
                        setLines((prev) =>
                          prev.map((candidate) =>
                            candidate.id === line.id ? { ...candidate, itemCode } : candidate
                          )
                        )
                      }
                      options={data.items}
                      placeholder="Search item, nickname, or code"
                      search={(option) => option.searchText}
                      value={line.itemCode}
                    />
                    {item ? (
                      <p className="itemDetail">
                        <strong>{item.code}</strong>
                        <span>{item.name}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className={over ? "balance dangerText" : "balance"}>
                    {product ? `${formatNumber(product.balance)} CS` : line.itemCode ? "Missing" : "-"}
                  </div>
                  <input
                    className={over ? "qtyInput dangerBorder" : "qtyInput"}
                    inputMode="decimal"
                    onChange={(event) =>
                      setLines((prev) =>
                        prev.map((candidate) =>
                          candidate.id === line.id ? { ...candidate, quantity: event.target.value } : candidate
                        )
                      )
                    }
                    placeholder="0"
                    step="any"
                    type="number"
                    value={line.quantity}
                  />
                  <button
                    className="iconButton subtle"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((candidate) => candidate.id !== line.id))}
                    title={`Remove line ${index + 1}`}
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="summaryPanel">
          <h2>Review</h2>
          <dl>
            <div>
              <dt>Party</dt>
              <dd>{selectedParty ? selectedParty.name : "-"}</dd>
            </div>
            <div>
              <dt>SAP suffix</dt>
              <dd>{selectedParty ? selectedParty.suffix : "-"}</dd>
            </div>
            <div>
              <dt>Total CS</dt>
              <dd>{formatNumber(totals.cs)}</dd>
            </div>
            <div>
              <dt>PI value</dt>
              <dd>{formatNumber(totals.value)}</dd>
            </div>
          </dl>

          {status.kind !== "idle" ? (
            <div className={`statusBox ${status.kind}`}>
              {status.kind === "loading" ? <Loader2 className="spin" size={18} /> : null}
              {status.kind === "success" ? <CheckCircle2 size={18} /> : null}
              {status.kind === "error" ? <AlertCircle size={18} /> : null}
              <div>
                <strong>{status.message}</strong>
                {status.kind === "error" && status.issues?.length ? (
                  <ul>
                    {status.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}

          <button
            className="submitButton"
            disabled={status.kind === "loading"}
            onClick={submitOrder}
            type="button"
          >
            {status.kind === "loading" ? <Loader2 className="spin" size={19} /> : <Send size={19} />}
            Submit Order
          </button>
        </aside>
      </section>
    </main>
  );
}
