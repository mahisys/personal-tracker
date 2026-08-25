-- CreateTable
CREATE TABLE "TaskTombstone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userIds" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TaskTombstone_deletedAt_idx" ON "TaskTombstone"("deletedAt");
