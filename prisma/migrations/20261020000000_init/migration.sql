-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workloadType" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "slaLatencyThresholdMs" DOUBLE PRECISION NOT NULL,
    "arrivalPattern" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_results" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "totalRequests" INTEGER NOT NULL,
    "averageLatencyMs" DOUBLE PRECISION NOT NULL,
    "p95LatencyMs" DOUBLE PRECISION NOT NULL,
    "totalCostUSD" DOUBLE PRECISION NOT NULL,
    "totalCarbonG" DOUBLE PRECISION NOT NULL,
    "coldStartRatePercent" DOUBLE PRECISION NOT NULL,
    "slaViolationRatePercent" DOUBLE PRECISION NOT NULL,
    "averageOverheadMs" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "policy_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiments_createdAt_idx" ON "experiments"("createdAt");

-- CreateIndex
CREATE INDEX "experiments_workloadType_idx" ON "experiments"("workloadType");

-- CreateIndex
CREATE INDEX "policy_results_experimentId_idx" ON "policy_results"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "policy_results_experimentId_policy_key" ON "policy_results"("experimentId", "policy");

-- AddForeignKey
ALTER TABLE "policy_results" ADD CONSTRAINT "policy_results_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
