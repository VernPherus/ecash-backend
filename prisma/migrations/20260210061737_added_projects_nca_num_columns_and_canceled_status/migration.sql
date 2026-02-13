-- AlterEnum
ALTER TYPE "Status" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "tb_disbursements" ADD COLUMN     "nca_num" TEXT,
ADD COLUMN     "project_name" TEXT;
