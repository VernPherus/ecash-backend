import { getSystemTimeDetails } from "../lib/time.js";
import {
  performFundReset,
  createMonthlyLedgers,
  sendAuditNotification,
} from "../lib/scheduler.js";
import { createLog } from "../lib/auditLogger.js";
import { prisma } from "../lib/prisma.js";

export const getServerTime = async (req, res) => {
  try {
    const timeDetails = getSystemTimeDetails();
    res.status(200).json(timeDetails);
  } catch (error) {
    console.log("Error in getServerTime controller: " + error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * RUN MONTHLY MAINTENANCE
 * Manually triggers the monthly maintenance tasks (Fund Reset, Ledger Creation, Notifs)
 * Accessible only by ADMINs via route configuration
 * @param {*} req
 * @param {*} res
 */
export const runMonthlyMaintenance = async (req, res) => {
  const userId = req.user?.id;

  try {
    console.log(
      `[Manual Trigger] Monthly Maintenance started by User ID: ${userId}`,
    );

    // 1. Reset Funds (if applicable based on current date/reset settings)
    // Note: This relies on the current system date to determine if it matches the reset target (Monthly/Quarterly/Yearly)
    await performFundReset();

    // 2. Create Ledgers for the current month
    // If ledgers already exist for this month, the function safely skips them
    await createMonthlyLedgers();

    // 3. Send Audit Notifications
    await sendAuditNotification();

    // 4. Log the manual intervention
    await createLog(
      prisma,
      userId,
      "Manually executed System Monthly Maintenance (Fund Reset, Ledgers, Notifications)",
    );

    res.status(200).json({
      message: "Monthly maintenance tasks executed successfully.",
    });
  } catch (error) {
    console.log("Error in runMonthlyMaintenance controller: " + error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
