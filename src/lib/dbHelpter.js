import { prisma } from "../lib/prisma.js";

/**
 * * FIND ACTIVE RECORD: Finds a record by ID to ensure it hasn't been deleted.
 * @param {number|string} id
 * @param {object} include - Prisma include object (optional)
 * @returns {object} Record
 */
export const findActiveRecord = async (id, include = {}) => {
  return await prisma.disbursement.findFirst({
    where: {
      id: Number(id),
      deletedAt: null,
    },
    include: include,
  });
};

/**
 * * Gets the latest series for code generation
 */
export const getCurrentSeries = async () => {
  const latestDisbursement = await prisma.disbursement.findFirst({
    where: {
      lddapNum: {
        not: null,
      },
    },
    select: { lddapNum: true },
    orderBy: { createdAt: "desc" },
  });

  if (!latestDisbursement || !latestDisbursement.lddapNum) {
    return 0;
  }

  const parts = latestDisbursement.lddapNum.split("-");

  if (parts.length !== 4) {
    return 0;
  }

  const seriesNum = parseInt(parts[2], 10);

  return isNaN(seriesNum) ? 0 : seriesNum;
};
