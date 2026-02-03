import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { createLog } from "./auditLogger.js";
import { notifyRoles } from "./notification.js";
import { getActiveResetTargets, getSystemTimeDetails } from "./time.js";
import { totalMonthBalance } from "./formulas.js";

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
};

/** --------------------------------------------------------
 *  *LOGIC
 *  --------------------------------------------------------
 */

/**
 * AUTOMATIC FUND RESET
 * @returns
 */
const performFundReset = async () => {
  const targets = getActiveResetTargets(); // Returns ["MONTHLY", "QUARTERLY", etc.] based on date

  if (targets.length === 0) return;

  const fundsToReset = await prisma.fundSource.findMany({
    where: {
      isActive: true,
      reset: { in: targets },
    },
  });

  if (fundsToReset.length > 0) {
    // Deactivate/Reset funds
    await prisma.fundSource.updateMany({
      where: { id: { in: fundsToReset.map((f) => f.id) } },
      data: { initialBalance: 0, isActive: false }, // Or however you define "reset"
    });

    // Log it as System
    await prisma.logs.create({
      data: {
        userId: 1, // Assuming ID 1 is Super Admin, or create a specific SYSTEM user
        log: `SYSTEM AUTO-RESET: Reset ${fundsToReset.length} funds (${targets.join(", ")})`,
      },
    });

    console.log(`🔄 Reset ${fundsToReset.length} funds.`);
  }
};

/**
 * AUTOMATIC LEDGER CREATION
 */
const createMonthlyLedgers = async () => {
  const { year, month } = getSystemTimeDetails();

  // Get all active funds that aren't pending reset
  const activeFunds = await prisma.fundSource.findMany({
    where: { isActive: true },
  });

  let createdCount = 0;

  for (const fund of activeFunds) {
    // Check if ledger exists
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
      // Calculate start/end of month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month

      // Get previous ledger's ending balance to carry over
      const prevLedger = await prisma.fundLedger.findFirst({
        where: { fundSourceId: fund.id },
        orderBy: [{ year: "desc" }, { period: "desc" }],
      });

      const startingBalance = prevLedger
        ? prevLedger.endingBalance
        : fund.initialBalance;

      await prisma.fundLedger.create({
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
      createdCount++;
    }
  }

  if (createdCount > 0) {
    console.log(`Created ${createdCount} new monthly ledgers.`);
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
  console.log("🔔 Sent monthly audit notifications.");
};
