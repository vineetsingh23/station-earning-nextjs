import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncRequestSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Register sync request contained invalid JSON.", error);
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Register sync payload failed validation.", details: parsed.error.issues }, { status: 400 });
  }

  const { stationName, snapshots } = parsed.data;
  const stationIds = new Set(snapshots.map(snapshot => snapshot.stationId));
  if (stationIds.size !== 1) {
    return NextResponse.json({ error: "A sync batch must contain records for one station." }, { status: 400 });
  }

  try {
    const results = await prisma.$transaction(async transaction => {
      const stationId = snapshots[0].stationId;
      await transaction.station.upsert({
        where: { id: stationId },
        create: { id: stationId, name: stationName },
        update: { name: stationName },
      });

      const batchResults = [];
      for (const snapshot of snapshots) {
        const existing = await transaction.dailyRegister.findUnique({
          where: { id: snapshot.id },
        });
        const currentRevision = existing?.revision ?? 0;
        if (currentRevision !== snapshot.baseRevision) {
          batchResults.push({
            id: snapshot.id,
            status: "conflict" as const,
            serverRevision: currentRevision,
          });
          continue;
        }

        const nextRevision = currentRevision + 1;
        await transaction.dailyRegister.upsert({
          where: { id: snapshot.id },
          create: {
            id: snapshot.id,
            stationId: snapshot.stationId,
            businessDate: new Date(`${snapshot.businessDate}T00:00:00.000Z`),
            data: snapshot.data as Prisma.InputJsonValue,
            revision: nextRevision,
            clientUpdatedAt: new Date(snapshot.updatedAt),
          },
          update: {
            data: snapshot.data as Prisma.InputJsonValue,
            revision: nextRevision,
            clientUpdatedAt: new Date(snapshot.updatedAt),
          },
        });
        batchResults.push({
          id: snapshot.id,
          status: "synced" as const,
          revision: snapshot.revision,
          serverRevision: nextRevision,
        });
      }
      return batchResults;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Failed to sync register snapshots to PostgreSQL.", error);
    return NextResponse.json(
      { error: "Synchronization failed. The saved local snapshots remain queued for retry." },
      { status: 503 },
    );
  }
}
