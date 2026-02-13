import { LedgerStatus } from "./constants.js";

/**
 * * HELPER: Update Ledger Logic for Fund Entries
 * Recalculates the ledger for a specific fund and date based on entries.
 */
export const updateLedgerFromEntry = async (tx, fundSourceId, dateInput) => {
  if (!fundSourceId || !dateInput) return;

  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  // 1. Find the specific ledger for this period
  const ledger = await tx.fundLedger.findUnique({
    where: {
      fundSourceId_year_period: {
        fundSourceId: Number(fundSourceId),
        year: year,
        period: month,
      },
    },
  });

  // Only update if ledger exists
  if (ledger) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // 2. Recalculate Total Entries (Sum of all active entries in this period)
    // Checks for entries where enteredAt falls in the period
    // OR enteredAt is null AND createdAt falls in the period (backward compatibility)
    const entriesAgg = await tx.fundEntry.aggregate({
      _sum: { amount: true },
      where: {
        fundSourceId: Number(fundSourceId),
        deletedAt: null,
        OR: [
          { enteredAt: { gte: startDate, lte: endDate } },
          { enteredAt: null, createdAt: { gte: startDate, lte: endDate } },
        ],
      },
    });

    const totalEntry = Number(entriesAgg._sum.amount || 0);

    // 3. Recalculate Ending Balance
    // Ending = Starting + Entries - Disbursed
    const endingBalance =
      Number(ledger.startingBalance) +
      totalEntry -
      Number(ledger.totalDisbursed);

    // 4. Update the ledger
    await tx.fundLedger.update({
      where: { id: ledger.id },
      data: {
        totalEntry,
        endingBalance,
        updatedAt: new Date(),
      },
    });

    console.log(
      `Ledger updated for Fund ${fundSourceId} (${month}/${year}). New Balance: ${endingBalance}`,
    );
  }
};

/**
 * * HELPER: Create Yearly Ledgers
 * Creates ledgers for the entire year (12 months) for a given fund.
 * Only the current month gets the initial balance; other months start at zero.
 */
export const createYearlyLedgers = async (tx, fundId, year, initialBalance) => {
  const ledgers = [];
  const balance = Number(initialBalance || 0);
  
  // Get current month (1-12)
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1 = Jan, 2 = Feb, etc.
  const currentYear = currentDate.getFullYear();

  for (let i = 0; i < 12; i++) {
    const month = i + 1;
    const startDate = new Date(year, i, 1);
    const endDate = new Date(year, i + 1, 0);
    
    // Only use initial balance if this is the current month AND current year
    const isCurrentPeriod = (month === currentMonth && year === currentYear);
    const startingBalance = isCurrentPeriod ? balance : 0;

    ledgers.push({
      fundSourceId: Number(fundId),
      year: Number(year),
      period: month,
      startDate: startDate,
      endDate: endDate,
      startingBalance: startingBalance,
      endingBalance: startingBalance,
      totalEntry: 0,
      totalDisbursed: 0,
      status: LedgerStatus.OPEN,
    });
  }

  // Use createMany for efficiency
  await tx.fundLedger.createMany({
    data: ledgers,
    skipDuplicates: true, // Prevents errors if run on existing data
  });

  console.log(`Initialized 12 ledgers for Fund ${fundId} (Year: ${year})`);
};
