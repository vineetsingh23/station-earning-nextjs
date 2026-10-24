CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyRegister" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyRegister_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DailyRegister_stationId_fkey"
      FOREIGN KEY ("stationId") REFERENCES "Station"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyRegister_stationId_businessDate_key"
  ON "DailyRegister"("stationId", "businessDate");
CREATE INDEX "DailyRegister_stationId_businessDate_idx"
  ON "DailyRegister"("stationId", "businessDate");
