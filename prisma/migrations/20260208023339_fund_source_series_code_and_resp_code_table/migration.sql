-- AlterTable
ALTER TABLE "tb_fund_sources" ADD COLUMN     "seriesCode" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "tb_responsibiliy_codes" (
    "id" SERIAL NOT NULL,
    "resp_code" TEXT NOT NULL,

    CONSTRAINT "tb_responsibiliy_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_responsibiliy_codes_resp_code_idx" ON "tb_responsibiliy_codes"("resp_code");
