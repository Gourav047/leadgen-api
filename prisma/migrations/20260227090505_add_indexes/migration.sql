-- CreateIndex
CREATE INDEX "Lead_userId_idx" ON "Lead"("userId");

-- CreateIndex
CREATE INDEX "Lead_userId_deletedAt_idx" ON "Lead"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Lead_userId_createdAt_idx" ON "Lead"("userId", "createdAt");
