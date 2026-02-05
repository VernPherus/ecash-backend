import { prisma } from "../lib/prisma.js";
import { createLog } from "../lib/auditLogger.js";

/**
 * * CREATE LEDGER: Initialize a new ledger for a fund source
 * @param {object} req
 * @param {object} res
 */
export const createLedger = async (req, res) => {
  const { fundSourceId, year, period, startDate, endDate, startingBalance } =
    req.body;
  const userId = req.user?.id;

  try {
    // Validation
    if (!fundSourceId || !year || !period || !startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Missing required ledger fields." });
    }

    // Check if ledger already exists for this period
    const existing = await prisma.fundLedger.findUnique({
      where: {
        fundSourceId_year_period: {
          fundSourceId: Number(fundSourceId),
          year: Number(year),
          period: Number(period),
        },
      },
    });

    if (existing) {
      return res
        .status(409)
        .json({ message: "Ledger for this period already exists." });
    }

    const newLedger = await prisma.$transaction(async (tx) => {
      const ledger = await tx.fundLedger.create({
        data: {
          fundSourceId: Number(fundSourceId),
          year: Number(year),
          period: Number(period),
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          startingBalance: Number(startingBalance || 0),
          endingBalance: Number(startingBalance || 0), // Initial state
        },
        include: { fundSource: { select: { code: true } } },
      });

      await createLog(
        tx,
        userId,
        `Opened new ledger for ${ledger.fundSource.code} - Period ${period}/${year}`,
      );
      return ledger;
    });

    res.status(201).json(newLedger);
  } catch (error) {
    console.error("Error in createLedger:", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * UPDATE LEDGER: Update balances and status (Open/Closed)
 * @param {object} req
 * @param {object} res
 */
export const updateLedger = async (req, res) => {
  const { id } = req.params;
  const { totalEntry, totalDisbursed, status } = req.body;
  const userId = req.user?.id;

  try {
    const currentLedger = await prisma.fundLedger.findUnique({
      where: { id: Number(id) },
    });

    if (!currentLedger) {
      return res.status(404).json({ message: "Ledger not found." });
    }

    // Calculate Ending Balance
    const entry =
      totalEntry !== undefined
        ? Number(totalEntry)
        : Number(currentLedger.totalEntry);
    const disb =
      totalDisbursed !== undefined
        ? Number(totalDisbursed)
        : Number(currentLedger.totalDisbursed);
    const ending = Number(currentLedger.startingBalance) + entry - disb;

    const updatedLedger = await prisma.$transaction(async (tx) => {
      const ledger = await tx.fundLedger.update({
        where: { id: Number(id) },
        data: {
          totalEntry: entry,
          totalDisbursed: disb,
          endingBalance: ending,
          status: status || currentLedger.status,
        },
      });

      await createLog(
        tx,
        userId,
        `Updated ledger #${id} balance (Ending: ${ending})`,
      );
      return ledger;
    });

    res.status(200).json(updatedLedger);
  } catch (error) {
    console.error("Error in updateLedger:", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * DISABLE/CLOSE LEDGER: Set status to CLOSED
 * @param {object} req
 * @param {object} res
 */
export const disableLedger = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const closedLedger = await prisma.$transaction(async (tx) => {
      const ledger = await tx.fundLedger.update({
        where: { id: Number(id) },
        data: { status: "CLOSED" },
      });

      await createLog(tx, userId, `Closed/Disabled ledger #${id}`);
      return ledger;
    });

    res
      .status(200)
      .json({ message: "Ledger closed successfully.", data: closedLedger });
  } catch (error) {
    console.error("Error in disableLedger:", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * GET LEDGERS: Fetch all ledgers or specific fund ledgers with pagination
 * @param {object} req
 * @param {object} res
 */
export const getLedgers = async (req, res) => {
  const { fundId, year } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 12;
  const skip = (page - 1) * limit;

  try {
    const where = {};
    if (fundId) where.fundSourceId = Number(fundId);
    if (year) where.year = Number(year);

    const [total, data] = await prisma.$transaction([
      prisma.fundLedger.count({ where }),
      prisma.fundLedger.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ year: "desc" }, { period: "desc" }],
        include: {
          fundSource: { select: { code: true, name: true } },
        },
      }),
    ]);

    res.status(200).json({
      data,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error in getLedgers:", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};
