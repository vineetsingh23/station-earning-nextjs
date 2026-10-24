import { z } from "zod";
import { SV2_PARTICULARS } from "./register-data";

const numericString = z.string().max(32);
const registerRow = z.record(z.string(), z.string().max(160));
const denomination = z.object({ value: z.number().int().positive(), count: numericString });

export const registerDataSchema = z.object({
  tomRows: z.array(registerRow).max(200),
  tvmRows: z.array(registerRow).max(200),
  dashboard: z.object({
    previousDaysCash: numericString,
    bankSent: numericString,
    bankNotes: z.array(denomination).max(20),
    cashNotes: z.array(denomination).max(20),
    coins: z.array(denomination).max(20),
    imprestIssued: z.array(z.object({
      tom: z.string().max(32),
      imprest: numericString,
      advance: numericString,
    })).max(100),
    imprestReceived: z.array(z.object({
      tom: z.string().max(32),
      amount: numericString,
    })).max(100),
    outstanding: z.object({
      previousAfc: numericString,
      previousTvm: numericString,
      previousMisc: numericString,
      miscCurrent: numericString,
      paidAfc: numericString,
      paidTvm: numericString,
      paidMisc: numericString,
      waivedAfc: numericString,
      waivedTvm: numericString,
      waivedMisc: numericString,
    }),
    sv2: z.array(z.object({
      particular: z.enum(SV2_PARTICULARS),
      opening: numericString,
      received: numericString,
      sentRevenue: numericString,
      sentOther: numericString,
      sale: numericString,
    })).length(SV2_PARTICULARS.length),
  }),
});

export const snapshotSyncSchema = z.object({
  id: z.string().min(3).max(120),
  stationId: z.string().min(1).max(80),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseRevision: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  data: registerDataSchema,
}).refine(
  snapshot => snapshot.id === `${snapshot.stationId}:${snapshot.businessDate}`,
  { message: "Snapshot ID must match station and business date.", path: ["id"] },
).refine(snapshot => {
  const date = new Date(`${snapshot.businessDate}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === snapshot.businessDate;
}, { message: "Business date is invalid.", path: ["businessDate"] });

export const syncRequestSchema = z.object({
  stationName: z.string().min(1).max(120),
  snapshots: z.array(snapshotSyncSchema).min(1).max(20),
});

export const registerQuerySchema = z.object({
  stationId: z.string().min(1).max(80).default("central-metro"),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(({ businessDate }) => {
  const date = new Date(`${businessDate}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === businessDate;
}, { message: "Business date is invalid.", path: ["businessDate"] });
