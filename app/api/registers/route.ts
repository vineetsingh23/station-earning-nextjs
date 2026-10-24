import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const parsed = registerQuerySchema.safeParse({
    stationId: request.nextUrl.searchParams.get("stationId") ?? undefined,
    businessDate: request.nextUrl.searchParams.get("businessDate"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid station or business date." }, { status: 400 });
  }

  try {
    const businessDate = new Date(`${parsed.data.businessDate}T00:00:00.000Z`);
    const snapshot = await prisma.dailyRegister.findUnique({
      where: {
        stationId_businessDate: {
          stationId: parsed.data.stationId,
          businessDate,
        },
      },
    });
    const station = await prisma.station.findUnique({
      where: { id: parsed.data.stationId },
      select: { name: true },
    });
    return NextResponse.json({
      stationName: station?.name,
      snapshot: snapshot ? {
        id: snapshot.id,
        stationId: snapshot.stationId,
        businessDate: parsed.data.businessDate,
        data: snapshot.data,
        revision: snapshot.revision,
        updatedAt: snapshot.clientUpdatedAt.toISOString(),
      } : null,
    });
  } catch (error) {
    console.error("Failed to read register snapshot from PostgreSQL.", error);
    return NextResponse.json(
      { error: "The local PostgreSQL database is unavailable. Local entries remain saved in this browser." },
      { status: 503 },
    );
  }
}
