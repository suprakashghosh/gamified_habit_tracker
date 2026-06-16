-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('daily', 'weekly', 'monthly', 'longterm');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('draft', 'active', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "XPReason" AS ENUM ('leaf_increment', 'parent_completion', 'undo');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "parent_id" TEXT,
    "max_count" INTEGER NOT NULL,
    "current_count" INTEGER NOT NULL DEFAULT 0,
    "xp_per_unit" INTEGER NOT NULL,
    "recurrence_group_id" TEXT,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "Status" NOT NULL DEFAULT 'draft',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XPTransaction" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source_task_id" TEXT NOT NULL,
    "reason" "XPReason" NOT NULL,
    "linked_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XPTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_tier_idx" ON "Task"("tier");

-- CreateIndex
CREATE INDEX "Task_parent_id_idx" ON "Task"("parent_id");

-- CreateIndex
CREATE INDEX "Task_sort_order_idx" ON "Task"("sort_order");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_is_published_idx" ON "Task"("is_published");

-- CreateIndex
CREATE INDEX "Task_recurrence_group_id_idx" ON "Task"("recurrence_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "Task_recurrence_group_id_period_start_key" ON "Task"("recurrence_group_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "XPTransaction_linked_transaction_id_key" ON "XPTransaction"("linked_transaction_id");

-- CreateIndex
CREATE INDEX "XPTransaction_source_task_id_idx" ON "XPTransaction"("source_task_id");

-- CreateIndex
CREATE INDEX "XPTransaction_reason_idx" ON "XPTransaction"("reason");

-- CreateIndex
CREATE INDEX "XPTransaction_created_at_idx" ON "XPTransaction"("created_at");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XPTransaction" ADD CONSTRAINT "XPTransaction_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
