"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateTomRow,
  calculateTvmRow,
  calculatedValue,
  createDefaultRegisterData,
  deriveSv2Opening,
  rowSum,
  SV2_PARTICULARS,
  TOM_COLUMNS,
  TVM_COLUMNS,
  type DashboardData,
  type RegisterColumn,
  type RegisterData,
  type RegisterRow,
} from "@/lib/register-data";
import { registerDataSchema } from "@/lib/validation";
import {
  markSnapshotSynced,
  markSnapshotSyncError,
  listSnapshots,
  queuedSnapshots,
  readSnapshot,
  snapshotId,
  STATION_ID,
  STATION_NAME,
  writeSnapshot,
  type RegisterSnapshot,
} from "@/lib/storage";

type PageKey = "dashboard" | "overview" | "tom" | "tvm" | "final" | "statistics" | "history" | "support";
type RemoteSnapshot = {
  id: string;
  stationId: string;
  businessDate: string;
  data: unknown;
  revision: number;
  updatedAt: string;
};

const NAVIGATION: Array<{ id: PageKey; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "overview", label: "Station overview", icon: "⌂" },
  { id: "tom", label: "TOM & CC earning", icon: "▤" },
  { id: "tvm", label: "TVM earning", icon: "▥" },
  { id: "final", label: "Final earning", icon: "✓" },
  { id: "statistics", label: "Statistics", icon: "◫" },
  { id: "history", label: "Historical records", icon: "↗" },
  { id: "support", label: "Support", icon: "?" },
];

const amount = (value: string | number) => Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const currency = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value);
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" }).format(new Date(`${date}T12:00:00+05:30`));
const localBusinessDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const previousDate = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};
const initialSnapshot = (date: string): RegisterSnapshot => ({
  id: snapshotId(STATION_ID, date),
  stationId: STATION_ID,
  businessDate: date,
  data: createDefaultRegisterData(),
  revision: 0,
  serverRevision: 0,
  updatedAt: new Date().toISOString(),
  syncState: "synced",
});
const remoteToSnapshot = (remote: RemoteSnapshot): RegisterSnapshot => {
  const data = registerDataSchema.parse(remote.data) as RegisterData;
  return {
    id: remote.id,
    stationId: remote.stationId,
    businessDate: remote.businessDate,
    data,
    revision: remote.revision,
    serverRevision: remote.revision,
    updatedAt: remote.updatedAt,
    syncState: "synced",
  };
};

function calculateFinal(data: RegisterData) {
  const tom = data.tomRows;
  const tvm = data.tvmRows;
  return {
    tomQrQty: rowSum(tom, "qrSaleQuantity"),
    tomQrAmount: rowSum(tom, "qrSaleAmount"),
    tvmQrQty: rowSum(tvm, "tvmQrSaleQuantity"),
    tvmQrAmount: rowSum(tvm, "tvmQrSaleAmount"),
    paidExitQty: rowSum(tom, "paidExitQrQuantity"),
    paidExitAmount: rowSum(tom, "paidExitQrAmount"),
    refundQty: rowSum(tom, "qrRefundQuantity"),
    refundAmount: rowSum(tom, "qrRefundAmount"),
    tomCscAmount: rowSum(tom, "cscSaleAmount"),
    tvmAddValueAmount: rowSum(tvm, "tvmAddValueAmount") + rowSum(tvm, "tvmNcmcAddValueAmount"),
    tomAddValueAmount: rowSum(tom, "addValueSv2TomAmount") + rowSum(tom, "addValueNcmcTomAmount"),
    tvmPos: rowSum(tvm, "tvmPaymentByPos"),
    tvmUpi: rowSum(tvm, "tvmPaymentByUpi"),
    tomUpi: rowSum(tom, "upiAtTomCc"),
    tomPos: rowSum(tom, "posAtCcc") + rowSum(tom, "posAtTvm") + rowSum(tom, "posAtRctm") + rowSum(tom, "posAtScvm"),
    afc: rowSum(tom, "afcCollectionTotal", row => calculateTomRow(row).afcCollectionTotal) +
      rowSum(tvm, "tvmTotal", row => calculateTvmRow(row).tvmTotal),
    totalEarning: rowSum(tom, "totalEarning", row => calculateTomRow(row).totalEarning) +
      rowSum(tvm, "tvmFinalTotal", row => calculateTvmRow(row).tvmFinalTotal),
    cashless: rowSum(tom, "cashless", row => {
      return ["posAtCcc", "posAtTvm", "staticQrAtCcc", "posAtRctm", "posAtScvm", "upiAtTvm", "upiAtTomCc", "hhtPenaltyPurseCashless", "hhtParkingPurse"]
        .reduce((total, key) => total + amount(row[key]), 0);
    }) + rowSum(tvm, "cashless", row => amount(row.tvmPaymentByPos) + amount(row.tvmPaymentByUpi)),
    surcharge: rowSum(tom, "surcharge", row =>
      ["surchargeCashAmount", "surchargePurseAmount", "ncmcCashAmount", "ncmcPurseAmount"]
        .reduce((total, key) => total + amount(row[key]), 0)),
  };
}

function setDashboardValue(
  dashboard: DashboardData,
  section: "outstanding",
  key: keyof DashboardData["outstanding"],
  value: string,
): DashboardData;
function setDashboardValue(
  dashboard: DashboardData,
  section: "cash",
  key: "previousDaysCash" | "bankSent",
  value: string,
): DashboardData;
function setDashboardValue(
  dashboard: DashboardData,
  section: "outstanding" | "cash",
  key: string,
  value: string,
) {
  if (section === "outstanding") {
    return { ...dashboard, outstanding: { ...dashboard.outstanding, [key]: value } };
  }
  return { ...dashboard, [key]: value };
}

function DataTable({
  id,
  rows,
  columns,
  onChange,
  readOnly = false,
}: {
  id: string;
  rows: RegisterRow[];
  columns: RegisterColumn[];
  onChange?: (row: number, key: string, value: string) => void;
  readOnly?: boolean;
}) {
  const groups = useMemo(() => {
    const result: Array<{ name: string; count: number }> = [];
    columns.forEach(column => {
      const last = result[result.length - 1];
      if (last?.name === column.group) last.count += 1;
      else result.push({ name: column.group, count: 1 });
    });
    return result;
  }, [columns]);
  const total = (column: RegisterColumn) =>
    rows.reduce((sum, row) => sum + Number(calculatedValue(row, column.key)), 0);

  return (
    <div className="table-viewport">
      <table id={id} className="register-table">
        <thead>
          <tr>{groups.map((group, index) => <th key={`${group.name}-${index}`} colSpan={group.count}>{group.name}</th>)}</tr>
          <tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${id}-${rowIndex}`}>
              {columns.map(column => {
                const value = column.kind === "calculated" ? calculatedValue(row, column.key) : row[column.key] ?? "";
                if (readOnly || column.kind === "calculated") {
                  return <td key={column.key} className={column.kind === "calculated" ? "calculated-cell" : ""}>
                    {column.kind === "calculated" || column.key.toLowerCase().includes("amount")
                      ? currency(Number(value))
                      : value}
                  </td>;
                }
                return <td key={column.key}>
                  <input
                    aria-label={`${column.label}, row ${rowIndex + 1}`}
                    inputMode={column.kind === "text" ? "text" : "decimal"}
                    value={value}
                    onChange={event => onChange?.(rowIndex, column.key, event.target.value)}
                    onKeyDown={event => {
                      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
                      const target = event.currentTarget;
                      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && column.kind === "text") {
                        const atStart = target.selectionStart === 0;
                        const atEnd = target.selectionEnd === target.value.length;
                        if ((event.key === "ArrowLeft" && !atStart) || (event.key === "ArrowRight" && !atEnd)) return;
                      }
                      event.preventDefault();
                      const inputs = Array.from(target.closest("table")?.querySelectorAll<HTMLInputElement>("tbody input") ?? []);
                      const index = inputs.indexOf(target);
                      let nextIndex = index;
                      if (event.key === "ArrowLeft") nextIndex -= 1;
                      if (event.key === "ArrowRight") nextIndex += 1;
                      if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) {
                        const targetRow = Math.max(0, rowIndex - 1);
                        const cells = Array.from(target.closest("tbody")?.rows[targetRow]?.querySelectorAll("input") ?? []);
                        cells[Math.min(cells.length - 1, target.closest("td")?.cellIndex ?? 0)]?.focus();
                        return;
                      }
                      if (event.key === "ArrowDown" || event.key === "Enter") {
                        const targetRow = Math.min(rows.length - 1, rowIndex + 1);
                        const cells = Array.from(target.closest("tbody")?.rows[targetRow]?.querySelectorAll("input") ?? []);
                        cells[Math.min(cells.length - 1, target.closest("td")?.cellIndex ?? 0)]?.focus();
                        return;
                      }
                      inputs[nextIndex]?.focus();
                    }}
                  />
                </td>;
              })}
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <td colSpan={columns.length > 0 ? 1 : undefined}>Totals</td>
          {columns.slice(1).map(column => (
            <td key={column.key} className={column.kind === "calculated" ? "calculated-cell" : ""}>
              {column.kind === "text" ? "" : column.kind === "calculated" || column.key.toLowerCase().includes("amount")
                ? currency(total(column))
                : new Intl.NumberFormat("en-IN").format(total(column))}
            </td>
          ))}
        </tr></tfoot>
      </table>
    </div>
  );
}

function SummaryCard({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return <article className="metric-card">
    <span className="metric-label">{label}</span>
    <strong className="metric-value">{value}</strong>
    {foot && <span className="metric-foot">{foot}</span>}
  </article>;
}

export default function StationApp() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [businessDate, setBusinessDate] = useState("");
  const [snapshot, setSnapshot] = useState<RegisterSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Opening local register…");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [history, setHistory] = useState<RegisterSnapshot[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncLock = useRef(false);

  const refreshSnapshot = useCallback(async (id: string) => {
    const current = await readSnapshot(id);
    if (current) setSnapshot(current);
  }, []);

  const synchronize = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const queue = (await queuedSnapshots()).filter(entry => entry.syncState !== "conflict");
      if (queue.length === 0) {
        setSyncMessage("Local register ready");
        return;
      }
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationName: STATION_NAME,
          snapshots: queue.map(entry => ({
            ...entry,
            baseRevision: entry.serverRevision,
          })),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error : `Sync failed with status ${response.status}.`;
        for (const entry of queue) await markSnapshotSyncError(entry.id, message);
        setSyncMessage(message);
        await refreshSnapshot(snapshot?.id ?? "");
        return;
      }
      if (typeof body !== "object" || body === null || !("results" in body) || !Array.isArray(body.results)) {
        throw new Error("The synchronization service returned an invalid response.");
      }
      for (const result of body.results) {
        if (typeof result !== "object" || result === null || !("id" in result) || typeof result.id !== "string") continue;
        const queued = queue.find(entry => entry.id === result.id);
        if (!queued) continue;
        if ("status" in result && result.status === "synced" && "serverRevision" in result && typeof result.serverRevision === "number") {
          await markSnapshotSynced(result.id, queued.revision, result.serverRevision);
        } else if ("status" in result && result.status === "conflict") {
          const serverRevision = "serverRevision" in result && typeof result.serverRevision === "number"
            ? result.serverRevision : undefined;
          await markSnapshotSyncError(
            result.id,
            "PostgreSQL has a newer revision. Review and re-save this date to retry.",
            true,
            serverRevision,
          );
        }
      }
      setSyncMessage("All queued changes synchronized");
      if (snapshot) await refreshSnapshot(snapshot.id);
      setHistory(await listSnapshots());
    } catch (error) {
      console.error("Unable to synchronize local register data.", error);
      const message = error instanceof Error ? error.message : "Synchronization failed unexpectedly.";
      setSyncMessage(message);
      if (snapshot) {
        await markSnapshotSyncError(snapshot.id, message).catch(storageError => {
          console.error("Unable to update local sync status.", storageError);
        });
        await refreshSnapshot(snapshot.id);
      }
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [refreshSnapshot, snapshot]);

  const loadBusinessDate = useCallback(async (date: string) => {
    setReady(false);
    setSyncMessage("Loading local register…");
    const id = snapshotId(STATION_ID, date);
    try {
      const [local, localPrevious] = await Promise.all([
        readSnapshot(id),
        readSnapshot(snapshotId(STATION_ID, previousDate(date))),
      ]);
      let remote: RegisterSnapshot | null = null;
      try {
        const response = await fetch(`/api/registers?stationId=${encodeURIComponent(STATION_ID)}&businessDate=${encodeURIComponent(date)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Local PostgreSQL server returned ${response.status}.`);
        const result: unknown = await response.json();
        if (typeof result !== "object" || result === null || !("snapshot" in result)) {
          throw new Error("The register endpoint returned an invalid response.");
        }
        const remoteData = result.snapshot as RemoteSnapshot | null;
        if (remoteData) remote = remoteToSnapshot(remoteData);
        setSyncMessage("Local server reachable");
      } catch (error) {
        setSyncMessage(error instanceof Error ? `${error.message} Using IndexedDB.` : "Local server unavailable. Using IndexedDB.");
      }

      let selected = local ?? remote ?? initialSnapshot(date);
      if (local?.syncState === "synced" && remote && remote.serverRevision > local.serverRevision) selected = remote;
      let previous = localPrevious;
      if (!previous) {
        try {
          const previousResponse = await fetch(
            `/api/registers?stationId=${encodeURIComponent(STATION_ID)}&businessDate=${encodeURIComponent(previousDate(date))}`,
            { cache: "no-store" },
          );
          if (previousResponse.ok) {
            const previousResult: unknown = await previousResponse.json();
            if (typeof previousResult === "object" && previousResult !== null && "snapshot" in previousResult && previousResult.snapshot) {
              previous = remoteToSnapshot(previousResult.snapshot as RemoteSnapshot);
              await writeSnapshot(previous, false);
            }
          }
        } catch (error) {
          console.error("Unable to load the previous day's SV2 closing balances.", error);
        }
      }
      const previousSv2 = previous?.data.dashboard.sv2;
      if (previousSv2 && selected.syncState !== "conflict") {
        const sv2 = deriveSv2Opening(previousSv2, selected.data.dashboard.sv2);
        const changed = sv2.some((row, index) => row.opening !== selected.data.dashboard.sv2[index]?.opening);
        if (changed) {
          selected = {
            ...selected,
            revision: selected.revision + 1,
            updatedAt: new Date().toISOString(),
            syncState: "pending",
            syncMessage: undefined,
            data: {
              ...selected.data,
              dashboard: {
                ...selected.data.dashboard,
                sv2,
              },
            },
          };
        }
      }
      setSnapshot(selected);
      if (!local && remote) await writeSnapshot(remote, false);
      else if (!local) await writeSnapshot(selected, false);
      setHistory(await listSnapshots());
    } catch (error) {
      console.error("Unable to open local IndexedDB register.", error);
      setSyncMessage(error instanceof Error ? `Local storage error: ${error.message}` : "Local storage error.");
      setSnapshot(initialSnapshot(date));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setBusinessDate(current => current || localBusinessDate());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!businessDate) return;
    const frame = window.requestAnimationFrame(() => void loadBusinessDate(businessDate));
    return () => window.cancelAnimationFrame(frame);
  }, [businessDate, loadBusinessDate]);

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("metro-register-theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        const frame = window.requestAnimationFrame(() => setTheme(savedTheme));
        return () => window.cancelAnimationFrame(frame);
      }
    } catch (error) {
      console.error("Unable to read saved theme preference.", error);
    }
  }, []);

  useEffect(() => {
    if (!ready || !snapshot || snapshot.syncState === "synced") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await writeSnapshot(snapshot);
        setSyncMessage("Saved locally · waiting for local server");
        setHistory(await listSnapshots());
        await synchronize();
      } catch (error) {
        console.error("Unable to save register data in IndexedDB.", error);
        setSyncMessage(error instanceof Error ? `Local save failed: ${error.message}` : "Local save failed.");
      }
    }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, snapshot, synchronize]);

  useEffect(() => {
    const syncWhenOnline = () => { void synchronize(); };
    window.addEventListener("online", syncWhenOnline);
    const interval = window.setInterval(syncWhenOnline, 30_000);
    return () => {
      window.removeEventListener("online", syncWhenOnline);
      window.clearInterval(interval);
    };
  }, [synchronize]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("metro-register-theme", theme);
    } catch (error) {
      console.error("Unable to save theme preference.", error);
    }
  }, [theme]);

  const data = snapshot?.data;
  const totals = useMemo(() => data ? calculateFinal(data) : null, [data]);

  const updateData = useCallback((update: (data: RegisterData) => RegisterData) => {
    setSnapshot(current => {
      if (!current) return current;
      return {
        ...current,
        data: update(current.data),
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        syncState: "pending",
        syncMessage: undefined,
      };
    });
  }, []);

  const updateRegisterRow = (register: "tomRows" | "tvmRows", rowIndex: number, key: string, value: string) => {
    updateData(current => ({
      ...current,
      [register]: current[register].map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
    }));
  };

  const updateDashboard = (updater: (dashboard: DashboardData) => DashboardData) =>
    updateData(current => ({ ...current, dashboard: updater(current.dashboard) }));

  const addRegisterRow = (register: "tomRows" | "tvmRows", columns: RegisterColumn[]) => {
    updateData(current => ({
      ...current,
      [register]: [...current[register], Object.fromEntries(columns.map(column => [column.key, ""]))],
    }));
  };

  const openPage = (next: PageKey) => setPage(next);
  const toggleTheme = () => setTheme(current => current === "light" ? "dark" : "light");

  if (!snapshot || !data || !totals) {
    return <main className="loading-screen">Opening station register…</main>;
  }

  const currentAfc = totals.afc;
  const cashOnHand = amount(data.dashboard.previousDaysCash) + totals.totalEarning +
    data.dashboard.imprestReceived.reduce((sum, row) => sum + amount(row.amount), 0) +
    amount(data.dashboard.outstanding.paidAfc) + amount(data.dashboard.outstanding.paidTvm) +
    amount(data.dashboard.outstanding.paidMisc);
  const bankTotal = data.dashboard.bankNotes.reduce((sum, item) => sum + item.value * amount(item.count), 0);
  const coinsTotal = data.dashboard.coins.reduce((sum, item) => sum + item.value * amount(item.count), 0);
  const possessionTotal = data.dashboard.cashNotes.reduce((sum, item) => sum + item.value * amount(item.count), 0) +
    coinsTotal + data.dashboard.imprestIssued.reduce((sum, row) => sum + amount(row.imprest) + amount(row.advance), 0);
  const currentOutstandingAfc = rowSum(data.tomRows, "outstandingCurrentAfc");
  const currentOutstandingTvm = rowSum(data.tvmRows, "tvmOutstandingCurrent");
  const outstandingRows = [
    { key: "afc", label: "AFC · TOM & CC", previous: data.dashboard.outstanding.previousAfc, current: String(currentOutstandingAfc), paid: "paidAfc", waived: "waivedAfc" },
    { key: "tvm", label: "TVM", previous: data.dashboard.outstanding.previousTvm, current: String(currentOutstandingTvm), paid: "paidTvm", waived: "waivedTvm" },
    { key: "misc", label: "Misc", previous: data.dashboard.outstanding.previousMisc, current: data.dashboard.outstanding.miscCurrent, paid: "paidMisc", waived: "waivedMisc" },
  ] as const;
  const paidOutstanding = outstandingRows.reduce((sum, row) => sum + amount(data.dashboard.outstanding[row.paid]), 0);
  const pageName = NAVIGATION.find(item => item.id === page)?.label ?? "Dashboard";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" onClick={event => { event.preventDefault(); openPage("dashboard"); }}>
          <span className="brand-mark">M</span>
          <span><strong>Metro Register</strong><small>Station earnings</small></span>
        </a>
        <p className="nav-caption">Station workspace</p>
        <nav className="main-navigation" aria-label="Main navigation">
          {NAVIGATION.map(item => (
            <button key={item.id} type="button" className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => openPage(item.id)}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="station-badge"><span className="online-dot" /><span><small>Active station</small><strong>{STATION_NAME}</strong></span></div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">Metro Register <span>/</span> <strong>{pageName}</strong></div>
          <div className="topbar-actions">
            <span className={`sync-indicator ${syncing ? "working" : snapshot.syncState}`} title={syncMessage}>
              <span className="online-dot" />{syncing ? "Syncing…" : syncMessage}
            </span>
            <label className="date-picker">Business date
              <input type="date" value={businessDate} onChange={event => setBusinessDate(event.target.value)} />
            </label>
            <button className="secondary-button" type="button" onClick={toggleTheme}>{theme === "light" ? "◐ Dark mode" : "◑ Light mode"}</button>
          </div>
        </header>
        <div className="page-content">
          {page === "dashboard" && <section>
            <PageHeading eyebrow="DAILY CASH CONTROL" title="Dashboard" description={`Cash position, bank deposits and stock records · ${dateLabel(businessDate)}`} />
            <div className="dashboard-grid">
              <article className="card cash-card">
                <h2>Cash on hand</h2>
                <p className="card-caption">Previous cash + current earnings + TOM advances + paid outstanding</p>
                <strong className="cash-total">{currency(cashOnHand)}</strong>
                <SummaryLine label="Previous days cash not yet sent">
                  <input className="inline-money" aria-label="Previous days cash not yet sent" inputMode="decimal" value={data.dashboard.previousDaysCash} onChange={event => updateDashboard(current => setDashboardValue(current, "cash", "previousDaysCash", event.target.value))} />
                </SummaryLine>
                <SummaryLine label="Current day earning">{currency(totals.totalEarning)}</SummaryLine>
                <SummaryLine label="Advance received from TOMs">{currency(data.dashboard.imprestReceived.reduce((sum, row) => sum + amount(row.amount), 0))}</SummaryLine>
                <SummaryLine label="Paid outstanding received">{currency(paidOutstanding)}</SummaryLine>
                <section className="nested-card">
                  <div className="card-title-row"><h3>Cash to bank</h3><strong>{currency(bankTotal)}</strong></div>
                  <DenominationTable
                    title="Cash to bank by notes"
                    items={data.dashboard.bankNotes}
                    onChange={(items) => updateDashboard(current => ({ ...current, bankNotes: items }))}
                  />
                  <SummaryLine label="Sent to bank today">
                    <input className="inline-money" aria-label="Sent to bank today" inputMode="decimal" value={data.dashboard.bankSent} onChange={event => updateDashboard(current => setDashboardValue(current, "cash", "bankSent", event.target.value))} />
                  </SummaryLine>
                  <SummaryLine label="Due to bank">{currency(Math.max(0, Math.floor((amount(data.dashboard.previousDaysCash) + totals.totalEarning + paidOutstanding) / 100) * 100 - amount(data.dashboard.bankSent)))}</SummaryLine>
                </section>
              </article>
              <article className="card">
                <h2>Cash in possession</h2>
                <p className="card-caption">Counted notes, bank-received coins, and imprest issued.</p>
                <DenominationTable
                  title="Cash in possession by notes"
                  items={data.dashboard.cashNotes}
                  onChange={(items) => updateDashboard(current => ({ ...current, cashNotes: items }))}
                />
                <SummaryLine label="Coins received from bank">{currency(coinsTotal)}</SummaryLine>
                <SummaryLine label="Imprest issued">{currency(data.dashboard.imprestIssued.reduce((sum, row) => sum + amount(row.imprest) + amount(row.advance), 0))}</SummaryLine>
                <SummaryLine label="Total in possession"><strong>{currency(possessionTotal)}</strong></SummaryLine>
                <p className={`reconcile ${possessionTotal === cashOnHand ? "matched" : ""}`}>
                  {possessionTotal === cashOnHand ? "✓ Matches cash on hand" : `Difference · ${currency(Math.abs(possessionTotal - cashOnHand))}`}
                </p>
              </article>
              <div className="dashboard-stack">
                <article className="card">
                  <h2>Imprest issued to each TOM</h2>
                  <ImprestIssuedTable rows={data.dashboard.imprestIssued} onChange={rows => updateDashboard(current => ({ ...current, imprestIssued: rows }))} />
                </article>
                <article className="card">
                  <h2>Imprest received</h2>
                  <ImprestReceivedTable rows={data.dashboard.imprestReceived} onChange={rows => updateDashboard(current => ({ ...current, imprestReceived: rows }))} />
                </article>
              </div>
              <article className="card full-span">
                <h2>Coins in hand</h2>
                <p className="card-caption">Counts received from the bank by denomination; total is included in cash in possession.</p>
                <DenominationTable title="Coins received from bank" items={data.dashboard.coins} onChange={items => updateDashboard(current => ({ ...current, coins: items }))} />
              </article>
              <article className="card full-span">
                <h2>SV2 records</h2>
                <p className="card-caption">Closing = opening + received − sent − sale. Closing balance carries forward as the next business day&apos;s opening balance.</p>
                <Sv2Table
                  rows={data.dashboard.sv2}
                  onChange={(index, key, value) => updateDashboard(current => ({
                    ...current,
                    sv2: current.sv2.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
                  }))}
                />
              </article>
              <article className="card full-span">
                <h2>Outstanding summary</h2>
                <p className="card-caption">AFC is sourced from TOM &amp; CC; TVM from the TVM register; Misc is entered manually. Only paid outstanding is included in cash on hand.</p>
                <OutstandingTable rows={outstandingRows} data={data.dashboard} onChange={(key, value) => updateDashboard(current => ({
                  ...current,
                  outstanding: { ...current.outstanding, [key]: value },
                }))} />
              </article>
            </div>
          </section>}

          {page === "overview" && <section>
            <PageHeading eyebrow={dateLabel(businessDate).toUpperCase()} title="Station overview" description="Daily earnings, payment channels and register status." />
            <div className="metric-grid">
              <SummaryCard label="Current AFC earning" value={currency(currentAfc)} foot="Calculated from both registers" />
              <SummaryCard label="Cash-less earning" value={currency(totals.cashless)} foot="POS and UPI channels" />
              <SummaryCard label="Total QR sale · TVM + TOM" value={currency(totals.tvmQrAmount + totals.tomQrAmount)} foot={`${totals.tvmQrQty + totals.tomQrQty} transactions`} />
              <SummaryCard label="Total add value · TVM + TOM" value={currency(totals.tvmAddValueAmount + totals.tomAddValueAmount)} />
            </div>
            <div className="section-heading"><h2>Register pages</h2><span>Editable registers · final earning is read-only</span></div>
            <div className="quick-links">
              <button className="card quick-link" onClick={() => openPage("tom")}><strong>TOM &amp; CC Earning</strong><span>Shift register and calculated totals →</span></button>
              <button className="card quick-link" onClick={() => openPage("tvm")}><strong>TVM Earning</strong><span>Machine register and calculated totals →</span></button>
              <button className="card quick-link" onClick={() => openPage("final")}><strong>Final Earning</strong><span>Read-only roll-up →</span></button>
            </div>
          </section>}

          {page === "tom" && <section>
            <PageHeading eyebrow={`${STATION_NAME.toUpperCase()} · DAILY REGISTER`} title="TOM & CC Earning Register" description={`Shift entries and calculations · ${dateLabel(businessDate)}`} />
            <div className="table-toolbar"><span>{data.tomRows.length} rows · scroll horizontally to view the complete register</span><button className="primary-button" onClick={() => addRegisterRow("tomRows", TOM_COLUMNS)}>＋ Add row</button></div>
            <p className="keyboard-hint">Keyboard: arrow keys move between cells, Enter moves down; Tab and Shift+Tab move through fields.</p>
            <DataTable id="tom-register" rows={data.tomRows} columns={TOM_COLUMNS} onChange={(row, key, value) => updateRegisterRow("tomRows", row, key, value)} />
          </section>}

          {page === "tvm" && <section>
            <PageHeading eyebrow={`${STATION_NAME.toUpperCase()} · MACHINE REGISTER`} title="TVM Earning Register" description={`TVM transactions, cashless payments and outstanding · ${dateLabel(businessDate)}`} />
            <div className="table-toolbar"><span>{data.tvmRows.length} machine rows</span><button className="primary-button" onClick={() => addRegisterRow("tvmRows", TVM_COLUMNS)}>＋ Add row</button></div>
            <p className="keyboard-hint">Keyboard: arrow keys move between cells, Enter moves down; Tab and Shift+Tab move through fields.</p>
            <DataTable id="tvm-register" rows={data.tvmRows} columns={TVM_COLUMNS} onChange={(row, key, value) => updateRegisterRow("tvmRows", row, key, value)} />
          </section>}

          {page === "final" && <section>
            <PageHeading eyebrow={`${STATION_NAME.toUpperCase()} · READ ONLY`} title="Final Earning Register" description={`Combined values from TOM & CC and TVM registers · ${dateLabel(businessDate)}`} />
            <div className="read-only-note">Read-only roll-up · values are calculated from the editable registers.</div>
            <FinalTable totals={totals} />
          </section>}

          {page === "statistics" && <section>
            <PageHeading eyebrow="STATION TOTALS" title="Statistics" description={`Figures calculated from selected-date registers · ${dateLabel(businessDate)}`} />
            <div className="metric-grid">
              <SummaryCard label="Current AFC earning" value={currency(currentAfc)} />
              <SummaryCard label="Cash-less earning" value={currency(totals.cashless)} />
              <SummaryCard label="TVM QR sale" value={`${totals.tvmQrQty} / ${currency(totals.tvmQrAmount)}`} foot="Quantity / amount" />
              <SummaryCard label="TOM/CC QR sale" value={`${totals.tomQrQty} / ${currency(totals.tomQrAmount)}`} foot="Quantity / amount" />
              <SummaryCard label="TVM add value" value={currency(totals.tvmAddValueAmount)} />
              <SummaryCard label="TOM add value" value={currency(totals.tomAddValueAmount)} />
              <SummaryCard label="Total QR sale · TVM + TOM" value={currency(totals.tvmQrAmount + totals.tomQrAmount)} />
              <SummaryCard label="Total add value · TVM + TOM" value={currency(totals.tvmAddValueAmount + totals.tomAddValueAmount)} />
              <SummaryCard label="TOM UPI" value={currency(totals.tomUpi)} />
              <SummaryCard label="TVM UPI" value={currency(totals.tvmUpi)} />
              <SummaryCard label="TOM POS" value={currency(totals.tomPos)} />
              <SummaryCard label="TVM POS" value={currency(totals.tvmPos)} />
              <SummaryCard label="Surcharge" value={currency(totals.surcharge)} />
            </div>
          </section>}

          {page === "history" && <section>
            <PageHeading eyebrow="RECORDS BY CALENDAR MONTH" title="Historical records" description="High and low daily earnings calculated from locally stored Final Earning records." />
            <HistoryCards snapshots={history} currentMonth={businessDate.slice(0, 7)} />
          </section>}

          {page === "support" && <section>
            <PageHeading eyebrow="HELP & GUIDANCE" title="Support" description="Working with offline station registers and synchronization." />
            <article className="card support-card">
              <h2>Offline-first register</h2>
              <p>Edits are saved in this browser&apos;s IndexedDB first. When the local station server is reachable, queued date records synchronize to PostgreSQL through the application server.</p>
              <p>PostgreSQL credentials remain on the server; they are never sent to the browser. A sync conflict is shown in the status area and does not discard the local version.</p>
              <p>To configure PostgreSQL, copy <code>.env.example</code> to <code>.env</code>, set your local database URL, then run the database migration command described in the project README.</p>
            </article>
          </section>}
          <footer className="app-footer">Metro Station Register · {snapshot.syncState === "synced" ? "Synchronized" : "Offline-first local storage"}</footer>
        </div>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>
  </div>;
}

function SummaryLine({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="summary-line"><span>{label}</span><strong>{children}</strong></div>;
}

function DenominationTable({
  title,
  items,
  onChange,
}: {
  title: string;
  items: DashboardData["coins"];
  onChange: (items: DashboardData["coins"]) => void;
}) {
  return <div className="small-table-wrap">
    <table className="small-table" aria-label={title}>
      <thead><tr><th>Denomination</th><th>Count</th><th>Amount</th></tr></thead>
      <tbody>{items.map((item, index) => (
        <tr key={`${item.value}-${index}`}>
          <td>{currency(item.value)}</td>
          <td><input aria-label={`${item.value} denomination count`} inputMode="numeric" value={item.count} onChange={event => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, count: event.target.value } : row))} /></td>
          <td>{currency(item.value * amount(item.count))}</td>
        </tr>
      ))}</tbody>
      <tfoot><tr><td colSpan={2}>Total</td><td>{currency(items.reduce((sum, item) => sum + item.value * amount(item.count), 0))}</td></tr></tfoot>
    </table>
  </div>;
}

function ImprestIssuedTable({
  rows,
  onChange,
}: {
  rows: DashboardData["imprestIssued"];
  onChange: (rows: DashboardData["imprestIssued"]) => void;
}) {
  const totals = rows.reduce((sum, row) => ({ imprest: sum.imprest + amount(row.imprest), advance: sum.advance + amount(row.advance) }), { imprest: 0, advance: 0 });
  return <div className="small-table-wrap">
    <table className="small-table"><thead><tr><th>TOM No.</th><th>Imprest</th><th>Advance</th><th>Total</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.tom}-${index}`}>
        <td><input aria-label={`TOM number ${index + 1}`} value={row.tom} onChange={event => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, tom: event.target.value } : item))} /></td>
        <td><input aria-label={`Imprest for TOM ${row.tom}`} inputMode="decimal" value={row.imprest} onChange={event => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, imprest: event.target.value } : item))} /></td>
        <td><input aria-label={`Advance for TOM ${row.tom}`} inputMode="decimal" value={row.advance} onChange={event => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, advance: event.target.value } : item))} /></td>
        <td>{currency(amount(row.imprest) + amount(row.advance))}</td>
      </tr>)}</tbody>
      <tfoot><tr><td>Total</td><td>{currency(totals.imprest)}</td><td>{currency(totals.advance)}</td><td>{currency(totals.imprest + totals.advance)}</td></tr></tfoot>
    </table>
  </div>;
}

function ImprestReceivedTable({
  rows,
  onChange,
}: {
  rows: DashboardData["imprestReceived"];
  onChange: (rows: DashboardData["imprestReceived"]) => void;
}) {
  return <div className="small-table-wrap">
    <table className="small-table"><thead><tr><th>TOM No.</th><th>Amount received</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.tom}-${index}`}>
        <td>{row.tom}</td>
        <td><input aria-label={`Amount received from TOM ${row.tom}`} inputMode="decimal" value={row.amount} onChange={event => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, amount: event.target.value } : item))} /></td>
      </tr>)}</tbody>
      <tfoot><tr><td>Total received</td><td>{currency(rows.reduce((sum, row) => sum + amount(row.amount), 0))}</td></tr></tfoot>
    </table>
  </div>;
}

function OutstandingTable({
  rows,
  data,
  onChange,
}: {
  rows: ReadonlyArray<{ key: string; label: string; previous: string; current: string; paid: keyof DashboardData["outstanding"]; waived: keyof DashboardData["outstanding"] }>;
  data: DashboardData;
  onChange: (key: keyof DashboardData["outstanding"], value: string) => void;
}) {
  const totals = rows.reduce((result, row) => {
    result.previous += amount(row.previous);
    result.current += amount(row.current);
    result.paid += amount(data.outstanding[row.paid]);
    result.waived += amount(data.outstanding[row.waived]);
    result.balance += amount(row.previous) + amount(row.current) - amount(data.outstanding[row.paid]) - amount(data.outstanding[row.waived]);
    return result;
  }, { previous: 0, current: 0, paid: 0, waived: 0, balance: 0 });
  return <div className="table-viewport">
    <table className="register-table dashboard-table"><thead><tr>
      {["Outstanding type", "Previous OS", "Current OS", "Paid OS", "Waived-off OS", "Total balance OS"].map(label => <th key={label}>{label}</th>)}
    </tr></thead><tbody>{rows.map(row => <tr key={row.key}>
      <td>{row.label}</td><td>{currency(amount(row.previous))}</td>
      <td>{row.key === "misc" ? <input aria-label="Current Misc outstanding" inputMode="decimal" value={row.current} onChange={event => onChange("miscCurrent", event.target.value)} /> : currency(amount(row.current))}</td>
      <td><input aria-label={`${row.label} paid OS`} inputMode="decimal" value={data.outstanding[row.paid]} onChange={event => onChange(row.paid, event.target.value)} /></td>
      <td><input aria-label={`${row.label} waived-off OS`} inputMode="decimal" value={data.outstanding[row.waived]} onChange={event => onChange(row.waived, event.target.value)} /></td>
      <td className="calculated-cell">{currency(amount(row.previous) + amount(row.current) - amount(data.outstanding[row.paid]) - amount(data.outstanding[row.waived]))}</td>
    </tr>)}</tbody><tfoot><tr>
      <td>Total</td><td>{currency(totals.previous)}</td><td>{currency(totals.current)}</td><td>{currency(totals.paid)}</td><td>{currency(totals.waived)}</td><td>{currency(totals.balance)}</td>
    </tr></tfoot></table>
  </div>;
}

function Sv2Table({
  rows,
  onChange,
}: {
  rows: DashboardData["sv2"];
  onChange: (index: number, key: "received" | "sentRevenue" | "sentOther" | "sale", value: string) => void;
}) {
  const headers = ["Particular", "Opening balance", "Received from revenue / other station", "Sent to revenue", "Sent to other station", "Total sale for the day", "Closing balance"];
  const closings = rows.map(row => amount(row.opening) + amount(row.received) - amount(row.sentRevenue) - amount(row.sentOther) - amount(row.sale));
  return <div className="table-viewport">
    <table className="register-table dashboard-table"><thead><tr>{headers.map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={SV2_PARTICULARS[index]}>
        <td>{row.particular}</td><td>{currency(amount(row.opening))}</td>
        {([
          ["received", "Received from revenue or other station"],
          ["sentRevenue", "Sent to revenue"],
          ["sentOther", "Sent to other station"],
          ["sale", "Total sale for the day"],
        ] as const).map(([key, label]) => <td key={key}>
          <input aria-label={`${row.particular} ${label}`} inputMode="decimal" value={row[key]} onChange={event => onChange(index, key, event.target.value)} />
        </td>)}
        <td className="calculated-cell">{currency(closings[index])}</td>
      </tr>)}</tbody>
      <tfoot><tr><td>Total</td>
        <td>{currency(rows.reduce((sum, row) => sum + amount(row.opening), 0))}</td>
        <td>{currency(rows.reduce((sum, row) => sum + amount(row.received), 0))}</td>
        <td>{currency(rows.reduce((sum, row) => sum + amount(row.sentRevenue), 0))}</td>
        <td>{currency(rows.reduce((sum, row) => sum + amount(row.sentOther), 0))}</td>
        <td>{currency(rows.reduce((sum, row) => sum + amount(row.sale), 0))}</td>
        <td className="calculated-cell">{currency(closings.reduce((sum, value) => sum + value, 0))}</td>
      </tr></tfoot>
    </table>
  </div>;
}

function FinalTable({ totals }: { totals: ReturnType<typeof calculateFinal> }) {
  const rows = [
    ["TOM & CC QR sale", totals.tomQrQty, currency(totals.tomQrAmount)],
    ["TVM QR sale", totals.tvmQrQty, currency(totals.tvmQrAmount)],
    ["Paid exit QR", totals.paidExitQty, currency(totals.paidExitAmount)],
    ["QR refund", totals.refundQty, currency(totals.refundAmount)],
    ["CSC sale", "—", currency(totals.tomCscAmount)],
    ["TOM add value", "—", currency(totals.tomAddValueAmount)],
    ["TVM add value", "—", currency(totals.tvmAddValueAmount)],
    ["TOM UPI", "—", currency(totals.tomUpi)],
    ["TVM UPI", "—", currency(totals.tvmUpi)],
    ["TOM POS", "—", currency(totals.tomPos)],
    ["TVM POS", "—", currency(totals.tvmPos)],
    ["Surcharge", "—", currency(totals.surcharge)],
  ];
  return <div className="table-viewport">
    <table className="register-table final-table"><thead><tr><th>Particulars</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>Total AFC earning</td><td>{currency(totals.afc)}</td></tr><tr><td colSpan={2}>Final total earning</td><td>{currency(totals.totalEarning)}</td></tr></tfoot>
    </table>
  </div>;
}

function HistoryCards({ snapshots, currentMonth }: { snapshots: RegisterSnapshot[]; currentMonth: string }) {
  const entries = snapshots.filter(snapshot => snapshot.revision > 0).map(snapshot => ({
    date: snapshot.businessDate,
    earning: calculateFinal(snapshot.data).totalEarning,
  }));
  if (entries.length === 0) return <article className="card empty-state">Historical highs and lows will appear as daily registers are saved.</article>;
  const monthly = entries.filter(entry => entry.date.startsWith(currentMonth));
  const highMonth = monthly.length ? monthly.reduce((best, entry) => entry.earning > best.earning ? entry : best) : null;
  const lowMonth = monthly.length ? monthly.reduce((best, entry) => entry.earning < best.earning ? entry : best) : null;
  const highAll = entries.reduce((best, entry) => entry.earning > best.earning ? entry : best);
  const lowAll = entries.reduce((best, entry) => entry.earning < best.earning ? entry : best);
  const records: Array<[string, { date: string; earning: number }]> = [];
  if (highMonth) records.push(["Highest earning · this month", highMonth]);
  if (lowMonth) records.push(["Lowest earning · this month", lowMonth]);
  records.push(["Highest earning · all time", highAll]);
  records.push(["Lowest earning · all time", lowAll]);
  return <div className="history-grid">{records.map(([label, record]) =>
    <article className="card history-card" key={label}>
      <span>{label}</span><strong>{currency(record.earning)}</strong><small>{dateLabel(record.date)}</small>
    </article>
  )}</div>;
}
