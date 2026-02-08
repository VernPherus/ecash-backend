/*
  Warnings:

  - A unique constraint covering the columns `[lddap_num]` on the table `tb_disbursements` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[checkNum]` on the table `tb_disbursements` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tb_disbursements_lddap_num_key" ON "tb_disbursements"("lddap_num");

-- CreateIndex
CREATE UNIQUE INDEX "tb_disbursements_checkNum_key" ON "tb_disbursements"("checkNum");
