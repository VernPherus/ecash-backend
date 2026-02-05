import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { createLog } from "./auditLogger.js";
import { notifyRoles } from "./notification.js";
import { getActiveResetTargets, getSystemTimeDetails } from "./time.js";
import { totalMonthBalance, totalNCA } from "./formulas.js";

/**
 * * AUTOMATION SCHEDULER
 * Handles time-based tasks like resetting funds, creating ledgers and notifications
 */
export const initScheduler = () => {
  console.log("System scheduler initialized.");

  /** --------------------------------------------------------
   ** MONTHLY MAINTENANCE
   * Runs at 00:00 every 1st day of the month
   * Cron expression: "0 0 1 * *"
   * --------------------------------------------------------
   */
  cron.schedule("0 0 1 * *", async () => {
    console.log("Running Monthly Maintenance Tasks...");
    try {
      await performFundReset();
      await createMonthlyLedgers();
      await sendAuditNotification();
    } catch (error) {
      console.error("Scheduler error: ", error);
    }
  });

  /** --------------------------------------------------------
   ** DAILY LEDGER UPDATE
   * Runs at 00:00 every day
   * Cron expression: "0 0 * * *"
   * Ensures ledger totals (entries, disbursements, ending balance) are accurate
   * --------------------------------------------------------
   */
  cron.schedule("0 0 * * *", async () => {
    console.log("Running Daily Ledger Updates...");
    try {
      await updateDailyLedgers();
    } catch (error) {
      console.error("Daily Ledger Update error: ", error);
    }
  });
};

/** --------------------------------------------------------
 * *LOGIC
 * --------------------------------------------------------
 */

/**
 * DAILY LEDGER UPDATE
 * Recalculates totalEntry, totalDisbursed, and endingBalance for all OPEN ledgers
 * based on actual FundEntry and Disbursement records.
 */
const updateDailyLedgers = async () => {
  // Get all OPEN ledgers
  const openLedgers = await prisma.fundLedger.findMany({
    where: { status: "OPEN" },
    include: {
      fundSource: { select: { code: true } },
    },
  });

  if (openLedgers.length === 0) {
    console.log("No open ledgers to update.");
    return;
  }

  console.log(`Updating ${openLedgers.length} open ledgers...`);
  let updatedCount = 0;

  for (const ledger of openLedgers) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Calculate Total Entries (FundEntry) for this period
        // Note: We do NOT use totalNCA() here to avoid double-counting initialBalance
        // if it was already captured in startingBalance.
        const entryAgg = await tx.fundEntry.aggregate({
          _sum: { amount: true },
          where: {
            fundSourceId: ledger.fundSourceId,
            createdAt: {
              gte: ledger.startDate,
              lte: ledger.endDate,
            },
            deletedAt: null,
          },
        });
        const totalEntry = Number(entryAgg._sum.amount || 0);

        // 2. Calculate Total Disbursements (PAID) for this period
        const disbAgg = await tx.disbursement.aggregate({
          _sum: { netAmount: true },
          where: {
            fundSourceId: ledger.fundSourceId,
            status: "PAID",
            dateReceived: {
              gte: ledger.startDate,
              lte: ledger.endDate,
            },
            deletedAt: null,
          },
        });
        const totalDisbursed = Number(disbAgg._sum.netAmount || 0);

        // 3. Calculate New Ending Balance
        const startingBalance = Number(ledger.startingBalance);
        const endingBalance = startingBalance + totalEntry - totalDisbursed;

        // 4. Update Ledger
        await tx.fundLedger.update({
          where: { id: ledger.id },
          data: {
            totalEntry,
            totalDisbursed,
            endingBalance,
            updatedAt: new Date(),
          },
        });
      });
      updatedCount++;
    } catch (error) {
      console.error(
        `Failed to update ledger #${ledger.id} (${ledger.fundSource.code}):`,
        error.message,
      );
    }
  }

  // Log summary
  await prisma.logs.create({
    data: {
      userId: 1, // System User
      log: `SYSTEM: Daily Ledger Update completed. Updated ${updatedCount}/${openLedgers.length} ledgers.`,
    },
  });

  console.log(`✅ Daily update complete. Updated ${updatedCount} ledgers.`);
};

/**
 * AUTOMATIC FUND RESET
 * Resets funds based on their reset schedule (MONTHLY, QUARTERLY, YEARLY)
 * Each fund is reset individually with its own calculated balance
 */
const performFundReset = async () => {
  const targets = getActiveResetTargets();
  if (targets.length === 0) return;

  const fundsToReset = await prisma.fundSource.findMany({
    where: {
      isActive: true,
      reset: { in: targets },
    },
  });

  if (fundsToReset.length === 0) {
    console.log("No funds to reset.");
    return;
  }

  let successCount = 0;
  const errors = [];

  // Process each fund individually with transaction safety
  for (const fund of fundsToReset) {
    try {
      await prisma.$transaction(async (tx) => {
        // Calculate carry-over balance for this specific fund
        const carryOverBalance = await totalMonthBalance(fund.id);

        // Validate the balance is a valid number
        if (
          carryOverBalance === null ||
          carryOverBalance === undefined ||
          isNaN(Number(carryOverBalance))
        ) {
          throw new Error(
            `Invalid carry-over balance for fund ${fund.code}: ${carryOverBalance}`,
          );
        }

        // Update the fund's initial balance
        await tx.fundSource.update({
          where: { id: fund.id },
          data: { initialBalance: carryOverBalance },
        });

        // Log individual fund reset
        await tx.logs.create({
          data: {
            userId: 1, // System user
            log: `SYSTEM AUTO-RESET: Fund ${fund.code} reset to ${carryOverBalance}`,
          },
        });
      });

      successCount++;
      console.log(`✅ Reset fund ${fund.code}`);
    } catch (error) {
      console.error(`❌ Failed to reset fund ${fund.code}:`, error);
      errors.push({
        fundId: fund.id,
        fundCode: fund.code,
        error: error.message,
      });
    }
  }

  // Log summary results
  await prisma.logs.create({
    data: {
      userId: 1,
      log: `SYSTEM AUTO-RESET: Reset ${successCount}/${fundsToReset.length} funds (${targets.join(", ")})${errors.length > 0 ? ` - ${errors.length} failures` : ""}`,
    },
  });

  console.log(`🔄 Reset ${successCount}/${fundsToReset.length} funds.`);

  if (errors.length > 0) {
    console.error("Reset errors:", errors);
    // Optionally notify admins about failures
    await notifyRoles(
      ["ADMIN"],
      "Fund Reset Failures",
      `${errors.length} fund(s) failed to reset. Check logs for details.`,
      "ALERT",
    );
  }
};

/**
 * AUTOMATIC LEDGER CREATION
 * Creates monthly ledgers for all active funds
 * Carries over previous ending balance or uses initial balance
 */
const createMonthlyLedgers = async () => {
  const { year, month } = getSystemTimeDetails();

  // Get all active funds
  const activeFunds = await prisma.fundSource.findMany({
    where: { isActive: true },
  });

  if (activeFunds.length === 0) {
    console.log("No active funds found.");
    return;
  }

  let createdCount = 0;
  const errors = [];

  for (const fund of activeFunds) {
    try {
      // Check if ledger already exists
      const exists = await prisma.fundLedger.findUnique({
        where: {
          fundSourceId_year_period: {
            fundSourceId: fund.id,
            year: year,
            period: month,
          },
        },
      });

      if (!exists) {
        await prisma.$transaction(async (tx) => {
          // Calculate start/end of month
          const startDate = new Date(year, month - 1, 1);
          const endDate = new Date(year, month, 0); // Last day of month

          // Get previous ledger's ending balance to carry over
          const prevLedger = await tx.fundLedger.findFirst({
            where: { fundSourceId: fund.id },
            orderBy: [{ year: "desc" }, { period: "desc" }],
          });

          // Use previous ending balance or fall back to initial balance, default to 0
          const startingBalance =
            prevLedger?.endingBalance ?? fund.initialBalance ?? 0;

          // Validate starting balance
          if (isNaN(Number(startingBalance))) {
            throw new Error(
              `Invalid starting balance for fund ${fund.code}: ${startingBalance}`,
            );
          }

          // Create the ledger
          await tx.fundLedger.create({
            data: {
              fundSourceId: fund.id,
              year,
              period: month,
              startDate,
              endDate,
              startingBalance,
              endingBalance: startingBalance,
              status: "OPEN",
            },
          });
        });

        createdCount++;
        console.log(`✅ Created ledger for fund ${fund.code}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create ledger for fund ${fund.code}:`, error);
      errors.push({
        fundId: fund.id,
        fundCode: fund.code,
        error: error.message,
      });
    }
  }

  if (createdCount > 0) {
    console.log(`📊 Created ${createdCount} new monthly ledgers.`);
  } else {
    console.log("All ledgers already exist for this period.");
  }

  if (errors.length > 0) {
    console.error("Ledger creation errors:", errors);
    // Optionally notify admins about failures
    await notifyRoles(
      ["ADMIN"],
      "Ledger Creation Failures",
      `${errors.length} ledger(s) failed to create. Check logs for details.`,
      "ALERT",
    );
  }
};

/**
 * AUDIT NOTIFICATIONS
 * Alerts Admin/Staff that the new month has started.
 */
const sendAuditNotification = async () => {
  const { month, year } = getSystemTimeDetails();
  const monthName = new Date().toLocaleString("default", { month: "long" });

  await notifyRoles(
    ["ADMIN", "STAFF"],
    `Period Open: ${monthName} ${year}`,
    "Monthly maintenance complete. Ledgers created and funds reset where applicable.",
    "INFO",
  );
  console.log("📧 Sent monthly audit notifications.");
};
