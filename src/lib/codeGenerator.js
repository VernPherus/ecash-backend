import { prisma } from "../lib/prisma.js";

/**
 * LDDAP code generator helpers.
 * @returns Formatted LDDAP code e.g. 01101101-01-0001-2026
 */
export const genLDDAPCode = async (date, seriesCode) => {
  const [year, month, day] = date.split("-").map(Number);
  const currentDate = new Date(year, month - 1, day);
  const currentYear = currentDate.getFullYear();

  const prefix = seriesCode; 
  const formattedMonth = String(currentDate.getMonth() + 1).padStart(2, "0"); // Formatting: 2 Digits, January = 01

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
  const formattedYear = currentYear;

  return `${prefix}-${formattedMonth}-${seriesFormatted}-${formattedYear}`;
};
