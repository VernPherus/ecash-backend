import { prisma } from "../lib/prisma.js";
import { getSystemTimeDetails } from "./time.js";

/**
 * Fund and financial calculation helpers.
 * Centralized logic for totals, balances, and utilization.
 */

/**
 * Sum of initial balances across funds (total allocation).
 * @param {Array<{ initialBalance?: number | string }>} funds
 * @returns {number}
 */
export function totalAllocation(funds) {
  if (!Array.isArray(funds)) return 0;
  return funds.reduce((sum, f) => sum + Number(f?.initialBalance ?? 0), 0);
}

/**
 * Remaining balance after deductions.
 * @param {number | string} initialBalance
 * @param {number | string} totalSpent
 * @returns {number}
 */
export function remainingBalance(initialBalance, totalSpent) {
  return Number(initialBalance ?? 0) - Number(totalSpent ?? 0);
}

/**
 * Utilization rate (percent used).
 * @param {number | string} totalSpent
 * @param {number | string} initialBalance
 * @returns {number} 0–100+
 */
export function utilizationRate(totalSpent, initialBalance) {
  const init = Number(initialBalance ?? 0);
  if (init <= 0) return 0;
  return (Number(totalSpent ?? 0) / init) * 100;
}

/**
 * GRAND TOTAL
 * @param {Array} disbursements
 * @returns
 */
export const grandTotal = async (disbursements) => {
  //Calculate grand total from all disbursement net amounts

  return ""; //grand total
};

/**
 * CALCLUTAED GROSS
 * @param {Array} items
 */
export const calculateGross = (items) => {
  if (!Array.isArray(items)) return 0;

  return items.reduce((sum, item) => {
    return sum + Number(item.amount || 0);
  }, 0);
};

/**
 * CALCULATE DEDUCTIONS
 * @param {Array} deductions
 * @returns
 */
export const calculateDeductions = (deductions) => {
  if (!Array.isArray(deductions)) return 0;

  return deductions.reduce((sum, ded) => {
    return sum + Number(ded.amount || 0);
  }, 0);
};

/**
 * TOTAL NCA
 * Computes total Notice of Cash Allocation.
 * Polymorphic: Can take an array of entries (synchronous sum) OR a month (async DB fetch).
 * @param {Array|number} input - Array of entry objects OR month number (1-12)
 * @returns {Promise<number>|number}
 */
export const totalNCA = async (fundId, input) => {
  // 1. Handle Array Input (Synchronous helper usage)
  if (Array.isArray(input)) {
    return input.reduce((sum, entry) => {
      return sum + Number(entry.amount || 0);
    }, 0);
  }

  // 2. Handle Month/Date Input (Database usage)
  const { year, month: currentMonth } = getSystemTimeDetails();
  const targetMonth = input || currentMonth;

  // Construct date range for the month
  const startDate = new Date(year, targetMonth - 1, 1);
  const endDate = new Date(year, targetMonth, 0, 23, 59, 59, 999);

  // Sum Fund Entries (Additions)
  const entriesAgg = await prisma.fundEntry.aggregate({
    _sum: { amount: true },
    where: {
      id: fundId,
      createdAt: { gte: startDate, lte: endDate },
      deletedAt: null,
    },
  });

  // Sum New Fund Sources Initial Balances (if they count as NCA for that month)
  const fundsAgg = await prisma.fundSource.aggregate({
    _sum: { initialBalance: true },
    where: {
      id: fundId,
      createdAt: { gte: startDate, lte: endDate },
      isActive: true,
      deletedAt: null,
    },
  });

  const totalEntries = Number(entriesAgg._sum.amount || 0);
  const totalInitials = Number(fundsAgg._sum.initialBalance || 0);

  return totalEntries + totalInitials;
};

/**
 * TOTAL DISBURSEMENTS
 * Gets the net amount of all PAID disbursements within the month.
 * @param {number} [month] - Month number (1-12). Defaults to system month.
 * @returns {Promise<number>}
 */
export const totalDisb = async (fundId, month) => {
  const { year, month: currentMonth } = getSystemTimeDetails();
  const targetMonth = month || currentMonth;

  const startDate = new Date(year, targetMonth - 1, 1);
  const endDate = new Date(year, targetMonth, 0, 23, 59, 59, 999);

  const aggregations = await prisma.disbursement.aggregate({
    _sum: { netAmount: true },
    where: {
      id: fundId,
      dateReceived: { gte: startDate, lte: endDate }, // Using dateReceived for financial reporting
      status: "PAID", // Only count actual spent money
      deletedAt: null,
    },
  });

  return Number(aggregations._sum.netAmount || 0);
};

/**
 * TOTAL MONTH BALANCE
 * NCA (Income) - Disbursements (Expenses) for the month.
 * @param {number} [month]
 * @returns {Promise<number>}
 */
export const totalMonthBalance = async (fundId, month) => {
  const nca = await totalNCA(fundId, month);
  const disb = await totalDisb(fundId, month);
  return nca - disb;
};

/**
 * CASH UTILIZATION RATE
 * (Total Disbursements / Total NCA) * 100
 * @param {number} [month]
 * @returns {Promise<number>}
 */
export const cashUtilization = async (fundId, month) => {
  const nca = await totalNCA(fundId, month);
  const disb = await totalDisb(fundId, month);

  if (nca === 0) return 0; // Prevent division by zero

  // Utilization is typically (Expenses / Allocation) * 100
  return (disb / nca) * 100;
};
