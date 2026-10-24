"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RegisterData } from "@/lib/register-data";

export const STATION_ID = "central-metro";
export const STATION_NAME = "Central Metro";

export type SyncState = "pending" | "synced" | "error" | "conflict";

export type RegisterSnapshot = {
  id: string;
  stationId: string;
  businessDate: string;
  data: RegisterData;
  revision: number;
  serverRevision: number;
  updatedAt: string;
  syncState: SyncState;
  syncMessage?: string;
};

type SyncQueueEntry = {
  id: string;
  snapshot: RegisterSnapshot;
  queuedAt: string;
};

interface RegisterDatabase extends DBSchema {
  dailyRegisters: {
    key: string;
    value: RegisterSnapshot;
    indexes: { "by-station-date": [string, string] };
  };
  syncQueue: {
    key: string;
    value: SyncQueueEntry;
  };
}

let databasePromise: Promise<IDBPDatabase<RegisterDatabase>> | undefined;

function database() {
  databasePromise ??= openDB<RegisterDatabase>("metro-station-register", 1, {
    upgrade(db) {
      const registers = db.createObjectStore("dailyRegisters", { keyPath: "id" });
      registers.createIndex("by-station-date", ["stationId", "businessDate"]);
      db.createObjectStore("syncQueue", { keyPath: "id" });
    },
  });
  return databasePromise;
}

export function snapshotId(stationId: string, businessDate: string) {
  return `${stationId}:${businessDate}`;
}

export async function readSnapshot(id: string) {
  return (await database()).get("dailyRegisters", id);
}

export async function listSnapshots() {
  return (await database()).getAllFromIndex("dailyRegisters", "by-station-date", IDBKeyRange.bound(
    [STATION_ID, ""],
    [STATION_ID, "\uffff"],
  ));
}

export async function writeSnapshot(snapshot: RegisterSnapshot, queueForSync = true) {
  const db = await database();
  const transaction = db.transaction(["dailyRegisters", "syncQueue"], "readwrite");
  transaction.objectStore("dailyRegisters").put(snapshot);
  if (queueForSync && snapshot.syncState !== "synced") {
    transaction.objectStore("syncQueue").put({
      id: snapshot.id,
      snapshot,
      queuedAt: new Date().toISOString(),
    });
  } else if (snapshot.syncState === "synced") {
    transaction.objectStore("syncQueue").delete(snapshot.id);
  }
  await transaction.done;
}

export async function queuedSnapshots() {
  const entries = await (await database()).getAll("syncQueue");
  return entries.map(entry => entry.snapshot);
}

export async function markSnapshotSynced(id: string, revision: number, serverRevision: number) {
  const db = await database();
  const transaction = db.transaction(["dailyRegisters", "syncQueue"], "readwrite");
  const current = await transaction.objectStore("dailyRegisters").get(id);
  const queued = await transaction.objectStore("syncQueue").get(id);
  if (current) {
    const hasNewerLocalEdit = current.revision > revision;
    const next: RegisterSnapshot = {
      ...current,
      serverRevision,
      syncState: hasNewerLocalEdit ? "pending" : "synced",
      syncMessage: undefined,
    };
    transaction.objectStore("dailyRegisters").put(next);
    if (hasNewerLocalEdit && queued) {
      transaction.objectStore("syncQueue").put({
        ...queued,
        snapshot: next,
        queuedAt: new Date().toISOString(),
      });
    } else {
      transaction.objectStore("syncQueue").delete(id);
    }
  }
  await transaction.done;
}

export async function markSnapshotSyncError(
  id: string,
  message: string,
  conflict = false,
  serverRevision?: number,
) {
  const db = await database();
  const transaction = db.transaction(["dailyRegisters", "syncQueue"], "readwrite");
  const snapshot = await transaction.objectStore("dailyRegisters").get(id);
  const queueEntry = await transaction.objectStore("syncQueue").get(id);
  if (snapshot) {
    const updated: RegisterSnapshot = {
      ...snapshot,
      ...(serverRevision === undefined ? {} : { serverRevision }),
      syncState: conflict ? "conflict" : "error",
      syncMessage: message,
    };
    transaction.objectStore("dailyRegisters").put(updated);
    if (queueEntry) transaction.objectStore("syncQueue").put({ ...queueEntry, snapshot: updated });
  }
  await transaction.done;
}
