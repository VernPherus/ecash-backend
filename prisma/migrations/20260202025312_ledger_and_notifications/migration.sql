-- CreateEnum
CREATE TYPE "NotifType" AS ENUM ('INFO', 'WARNING', 'SUCCESS', 'ALERT');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "tb_fund_ledgers" (
    "id" SERIAL NOT NULL,
    "fund_source_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "starting_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_entry" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_disbursed" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ending_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "LedgerStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tb_fund_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotifType" NOT NULL DEFAULT 'INFO',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_fund_ledgers_fund_source_id_year_period_key" ON "tb_fund_ledgers"("fund_source_id", "year", "period");

-- CreateIndex
CREATE INDEX "tb_notifications_user_id_is_read_idx" ON "tb_notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "tb_fund_ledgers" ADD CONSTRAINT "tb_fund_ledgers_fund_source_id_fkey" FOREIGN KEY ("fund_source_id") REFERENCES "tb_fund_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_notifications" ADD CONSTRAINT "tb_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tb_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
