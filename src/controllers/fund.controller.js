import { prisma } from "../lib/prisma.js";
import { createLog } from "../lib/auditLogger.js";
import { LedgerStatus, Reset, Status } from "../lib/constants.js";
import {
  totalDisb,
  totalMonthBalance,
  cashUtilization,
  totalNCA,
} from "../lib/formulas.js";
import { getSystemTimeDetails } from "../lib/time.js";

/**
 * * NEW FUND: Create fund source and initializes the fund ledger
 * @param {object} req
 * @param {object} res
 * @returns
 */
export const newFund = async (req, res) => {
  const { code, seriesCode, name, initialBalance, description, reset } = req.body;
  const userId = req.user?.id;

  try {
    //* Validation
    if (!code || !name || !seriesCode) {
      return res
        .status(400)
        .json({ message: "Fund Code, Name, and Series Code are required." });
    }

    //* Check for duplicates
    const existingFund = await prisma.fundSource.findUnique({
      where: { code: code },
    });

    if (existingFund) {
      return res.status(409).json({ message: "Fund code already exists" });
    }

    //* Create fund source
    const savedFund = await prisma.$transaction(async (tx) => {
      // Create fund
      const fund = await tx.fundSource.create({
        data: {
          code,
          seriesCode,
          name,
          initialBalance: initialBalance || 0,
          description,
          reset: reset || Reset.NONE,
        },
      });

      // Dates for ledger
      const { year, month } = getSystemTimeDetails();
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      // Create initial ledger
      await tx.fundLedger.create({
        data: {
          fundSourceId: fund.id,
          year: year,
          period: month,
          startDate: startDate,
          endDate: endDate,
          startingBalance: fund.initialBalance,
          endingBalance: fund.initialBalance,
          totalEntry: 0,
          totalDisbursed: 0,
          status: LedgerStatus.OPEN,
        },
      });

      // Create log
      await createLog(
        tx,
        userId,
        `Create new Fund Source: ${fund.code} - ${fund.name} with initial ledger`,
      );

      return fund;
    });
    res.status(201).json({ message: "New fund created.", savedFund });
  } catch (error) {
    console.log("Error in newFund controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * NEW ENTRY
 * @param {*} req
 * @param {*} res
 */
export const newEntry = async (req, res) => {
  const { sourceId, name, amount } = req.body;
  const userId = req.user?.id;

  try {
    // Validation
    if (!sourceId || !name || !amount) {
      return res.status(500).json({ message: "All fields required" });
    }

    // Create entry
    const newEntry = await prisma.$transaction(async (tx) => {
      const fund = await tx.fundSource.findUnique({
        where: { id: Number(sourceId) },
        select: { code: true },
      });

      if (!fund) {
        throw new Error("Fund source not found");
      }
      // Create entry
      const entry = await tx.fundEntry.create({
        data: {
          fundSourceId: Number(sourceId),
          name: name,
          amount: Number(amount),
        },
        include: {
          fundSource: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      });

      // Create log
      await createLog(
        tx,
        userId,
        `Added allocation entry "${entry.name}" (${entry.amount}) to fund ${entry.fundSource?.code}`,
      );

      return entry;
    });

    res.status(201).json({
      message: "New fund entry created successfully",
      data: newEntry,
    });
  } catch (error) {
    console.log("Error in newEntry controller: " + error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * DISPLAY FUND: Displays all disbusrements
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const displayFund = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";

  try {
    // Dynamic Where Clause for Search
    const where = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    // Transaction to get count and data efficiently
    const [totalRecords, funds] = await prisma.$transaction([
      prisma.fundSource.count({ where }),
      prisma.fundSource.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: "asc" },
        include: {
          // Optional: Include disbursement count for UI cues
          _count: { select: { disbursements: true } },
        },
      }),
    ]);

    res.status(200).json({
      data: funds,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },
    });
  } catch (error) {
    console.log("Error in displayFund controller: ", error.message);
    res.status(400).json({ message: "Internal server error." });
  }
};

/**
 * DISPLAY FUND STATS: Displays fund statistics on all funds
 * @param {*} params
 */
export const displayFundStats = async (req, res) => {
  const { month } = req.body;

  try {
    if (!month) {
      return res.status(400).json({ message: "Month field required" });
    }

    // Get all active funds
    const fundIds = await prisma.fundSource.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    // Store fundId and their statistics
    const stats = await Promise.all(
      fundIds.map(async (fund) => {
        const totalEntries = await totalNCA(fund.id, month);
        const totalDisbursement = await totalDisb(fund.id, month);
        const totalMonthly = await totalMonthBalance(fund.id, month);
        const totalCashUtil = await cashUtilization(fund.id, month);

        return {
          fundId: fund.id,
          totalEntries,
          totalDisbursement,
          totalMonthly,
          totalCashUtil,
        };
      }),
    );

    res.status(200).json({
      stats,
    });
  } catch (error) {
    console.log("Error in the displayFundStats controller: ", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * DISPLAY FUND DASHBOARD: Displays the total amount of each disbursement, a total amount of all disbnursements combined, this is for a card display in the dashboard
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const displayFundDashboard = async (req, res) => {
  try {
    // Fetch active funds
    const funds = await prisma.fundSource.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        initialBalance: true,
        disbursements: {
          where: { status: Status.PAID },
          select: { netAmount: true },
        },
      },
    });

    // Calculate individual fund stats
    const fundStats = funds.map((fund) => {
      const totalSpent = fund.disbursements.reduce(
        (sum, d) => sum + Number(d.netAmount),
        0,
      );
      const initialBalance = Number(fund.initialBalance);
      const remaining = initialBalance - totalSpent;

      // Calculate percentage used
      const utilization =
        initialBalance > 0
          ? ((totalSpent / initialBalance) * 100).toFixed(1)
          : 0;

      return {
        id: fund.id,
        code: fund.code,
        name: fund.name,
        initialBalance,
        totalSpent,
        remaining,
        utilizationRate: Number(utilization),
      };
    });

    const globalTotals = fundStats.reduce(
      (acc, curr) => ({
        totalBudget: acc.totalBudget + curr.initialBalance,
        totalSpent: acc.totalSpent + curr.totalSpent,
        totalRemaining: acc.totalRemaining + curr.remaining,
      }),
      { totalBudget: 0, totalSpent: 0, totalRemaining: 0 },
    );

    res.status(200).json({
      funds: fundStats,
      totals: globalTotals,
    });
  } catch (error) {
    console.log(
      "Error in the displayFundDashbaord controller: " + error.message,
    );
    return res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * DISPLAY ENTRY: Displays all entries
 * @param {object} req
 * @param {object} res
 */
export const displayEntry = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { fundId } = req.query;

  try {
    // Filter by specific fund if provided
    const where = fundId ? { fundSourceId: Number(fundId) } : {};

    const [totalRecords, entries] = await prisma.$transaction([
      prisma.fundEntry.count({ where }),
      prisma.fundEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          fundSource: {
            select: { code: true, name: true },
          },
        },
      }),
    ]);

    res.status(200).json({
      data: entries,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },
    });
  } catch (error) {
    console.log("Error in the displayEntry controller: " + error.message);
    return res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * SHOW FUND
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const showFund = async (req, res) => {
  const { id: fundID } = req.params;

  try {
    // Fetch fund entries with paid disbursements
    const fund = await prisma.fundSource.findUnique({
      where: {
        id: Number(fundID),
      },
      include: {
        fundEntries: true,
        disbursements: {
          where: { status: Status.PAID },
          select: { netAmount: true },
        },
        _count: {
          select: { disbursements: true },
        },
      },
    });

    if (!fund) {
      return res.status(404).json({ message: "Fund source not found." });
    }

    // Calculations
    const totalSpent = fund.disbursements.reduce(
      (sum, record) => sum + Number(record.netAmount),
      0,
    );
    const initialBalance = Number(fund.initialBalance);
    const remainingBalance = initialBalance - totalSpent;

    // Format response
    const { disbursements, ...fundData } = fund;

    res.status(200).json({
      ...fundData,
      stats: {
        initialBalance,
        remainingBalance,
        utilizationRate:
          initialBalance > 0
            ? ((totalSpent / initialBalance) * 100).toFixed(1)
            : 0,
      },
    });
  } catch (error) {
    console.log("Error in showFund controller: " + error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * RESET FUND: "Closes" funds based on their reset setting (Monthly/Yearly)
 * Sets initialBalance to 0 and isActive to false to archive them.
 * GET /api/funds/reset?force=true
 * @param {*} req
 * @param {*} res
 */
export const resetFund = async (req, res) => {
  const userId = req.user?.id;
  const force = req.query.force === "true";
  try {
    const today = new Date();

    const currentTime = getSystemTimeDetails();

    // Determine date conditions
    const isFirstDayOfMonth = currentTime.isStartOfMonth;
    const isFirstDayOfYear = currentTime.isStartofYear;

    // Update
    const result = await prisma.$transaction(async (tx) => {
      const fundsToReset = await tx.fundSource.findMany({
        where: {
          isActive: true,
          reset: { in: resetTargets },
        },
        select: { id: true, code: true },
      });

      if (fundsToReset.length === 0) {
        return { count: 0, codes: [] };
      }

      await tx.fundSource.updateMany({
        where: {
          id: { in: fundsToReset.map((f) => f.id) },
        },
        data: {
          isActive: false,
          initialBalance: 0,
        },
      });

      const codes = fundsToReset.map((f) => f.code).join(", ");
      await createLog(
        tx,
        userId,
        `System Reset: Archived/Zeroed ${fundsToReset.length} funds due to end of period (${codes})`,
      );

      return { count: fundsToReset.length, codes };
    });

    res.status(200).json({
      message: "Fund reset process completed.",
      processed: result.count,
      funds: result.codes,
      resetTypes: resetTargets,
    });
  } catch (error) {
    console.log("Error in the resetFund controller: " + error.message);
    return res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * EDIT FUND: Change fund code, name, initialBalance and description
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const editFund = async (req, res) => {
  const { id } = req.params;
  const { code, seriesCode, name, initialBalance, description, reset } = req.body;
  const userId = req.user?.id;

  try {
    //* Validation
    if (!id) {
      return res.status(400).json({ message: "Fund ID is required." });
    }

    // Check if fund exists
    const currentFund = await prisma.fundSource.findUnique({
      where: { id: Number(id) },
    });

    if (!currentFund) {
      return res.status(404).json({ message: "Fund source not found." });
    }

    // Check for duplicate code
    if (code && code !== currentFund.code) {
      const duplicate = await prisma.fundSource.findUnique({
        where: { code: code },
      });
      if (duplicate) {
        return res.status(409).json({ message: "Fund code already exists." });
      }
    }

    //* Update fund:
    const updatedFundSource = await prisma.$transaction(async (tx) => {
      // Perform Update
      const fund = await tx.fundSource.update({
        where: {
          id: Number(id),
        },
        data: {
          code,
          seriesCode,
          name,
          initialBalance:
            initialBalance !== undefined ? Number(initialBalance) : undefined,
          description,
          reset: reset || undefined,
        },
      });

      // Sync ledger
      if (initialBalance !== undefined) {
        const { year, month } = getSystemTimeDetails();

        // Find the ledger for the current period
        const currentLedger = await tx.fundLedger.findUnique({
          where: {
            fundSourceId_year_period: {
              fundSourceId: Number(id),
              year: year,
              period: month,
            },
          },
        });

        // If a ledger exists for this month, update it to reflect the new initial balance
        if (currentLedger) {
          const newStarting = Number(initialBalance);
          // Recalculate Ending Balance: Starting + Income - Expenses
          const newEnding =
            newStarting +
            Number(currentLedger.totalEntry) -
            Number(currentLedger.totalDisbursed);

          await tx.fundLedger.update({
            where: { id: currentLedger.id },
            data: {
              startingBalance: newStarting,
              endingBalance: newEnding,
            },
          });
        }
      }

      // Create Log
      const changeNote =
        code !== currentFund.code
          ? `(Renamed ${currentFund.code} to ${code})`
          : `(${fund.code})`;

      await createLog(tx, userId, `Updated Fund Source details ${changeNote}`);

      return fund;
    });

    res.status(200).json({
      message: "Fund updated successfully.",
      data: updatedFundSource,
    });
  } catch (error) {
    console.log("Error in the editFund controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * DEACTIVATE FUND
 * @param {object} req
 * @param {object} res
 * @returns
 */
export const deactivateFund = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    // Validations
    const fundToCheck = await prisma.fundSource.findUnique({
      where: { id: Number(id) },
    });

    if (!fundToCheck) {
      return res.status(404).json({ message: "Fund source not found." });
    }

    if (fundToCheck.deletedAt) {
      return res
        .status(400)
        .json({ message: "Fund is already deactivated/deleted." });
    }

    // Transaction:
    await prisma.$transaction(async (tx) => {
      // Soft Delete and Set Inactive
      await tx.fundSource.update({
        where: { id: Number(id) },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      // Create Audit Log
      await createLog(
        tx,
        userId,
        `Deactivated Fund Source: ${fundToCheck.code} - ${fundToCheck.name}`,
      );
    });

    res.status(200).json({
      message: "Fund source deactivated successfully.",
      id: Number(id),
    });
  } catch (error) {
    console.log("Error in deactivateFund controller: " + error.message);
    return res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * DELETE ENTRY
 * @param {*} req
 * @param {*} res
 */
export const deleteEntry = async (req, res) => {
  const { entryId } = req.params;
  const userId = req.user?.id;

  try {
    //* Validations
    const entryToCheck = await prisma.fundEntry.findUnique({
      where: { id: Number(entryId) },
      include: {
        fundSource: { select: { code: true } },
      },
    });

    if (!entryToCheck) {
      return res.status(404).json({ message: "Fund entry not found." });
    }

    if (entryToCheck.deletedAt) {
      return res.status(400).json({ message: "Entry is already deleted." });
    }

    // Transaction
    await prisma.$transaction(async (tx) => {
      // Soft Delete
      await tx.fundEntry.update({
        where: { id: Number(entryId) },
        data: { deletedAt: new Date() },
      });

      // Create Audit log:
      const logMessage = `Deleted allocation entry "${entryToCheck.name}"(${entryToCheck.amount}) from Fund ${entryToCheck.fundSource?.code}`;
      await createLog(tx, userId, logMessage);
    });

    res.status(200).json({
      message: "Fund entry deleted successfully.",
      id: Number(entryId),
    });
  } catch (error) {
    console.log("Error in the deleteEntry controller: " + error.message);
    return res.status(500).json({ message: "Internal server error." });
  }
};
