-- AlterTable: Add nullable userId and default isPublic columns
-- Preserves all existing experiment rows without requiring synthetic user backfilling
ALTER TABLE "experiments" ADD COLUMN "userId" TEXT;
ALTER TABLE "experiments" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: Index on userId for fast multi-tenant ownership queries
CREATE INDEX "experiments_userId_idx" ON "experiments"("userId");

-- CreateIndex: Index on isPublic for fast benchmark queries
CREATE INDEX "experiments_isPublic_idx" ON "experiments"("isPublic");

-- AddForeignKey: Link experiments.userId to users.id with SET NULL on delete
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
