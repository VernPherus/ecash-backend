import { prisma } from "../lib/prisma.js";

/**
 * LDDAP and ACIC code generator helpers.
 * @returns Formatted LDDAP code e.g. 01101101-01-0001-2026
 */
export const genLDDAPCode = async () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();

  const prefix = "01101101"; // Constant
  const month = String(currentDate.getMonth() + 1).padStart(2, "0"); // Formatting: 2 Digits, January = 01

  // Get current series
  // Formatting: 4 digits e.g. 0019, 0020, increment based on last number, resets per year
  const latestDisbursement = await prisma.disbursement.findFirst({
    where: {
      lddapNum: {
        not: null,
      },
      deletedAt: null,
    },
    select: { lddapNum: true },
    orderBy: { createdAt: "desc" },
  });

  let series = 1;
  if (latestDisbursement && latestDisbursement.lddapNum) {
    const parts = latestDisbursement.lddapNum.split("-");

    if (parts.length === 4) {
      const lastYear = parseInt(parts[3], 10);
      const lastSeries = parseInt(parts[2], 10);

      // For same Year
      if (lastYear === currentYear && !isNaN(lastSeries)) {
        series = lastSeries + 1;
      }
    }
  }

  const seriesFormatted = String(series).padStart(4, "0");
  const year = currentYear;

  return `${prefix}-${month}-${seriesFormatted}-${year}`;
};
