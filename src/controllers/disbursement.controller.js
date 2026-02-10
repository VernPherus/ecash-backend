import { prisma } from "../lib/prisma.js";
import { Status } from "../lib/constants.js";
import { createLog } from "../lib/auditLogger.js";
import { findActiveRecord } from "../lib/dbHelpter.js";
import { genLDDAPCode } from "../lib/codeGenerator.js";
import { calculateGross, calculateDeductions } from "../lib/formulas.js";
import { io } from "../lib/socket.js";
import { sendConfirmationEmail } from "../lib/mail.js";
import { broadcastNotification } from "../lib/notification.js";

/**
 * * HELPER: Update Ledger Logic
 * Recalculates the ledger for a specific fund and date (month).
 */
const updateLedger = async (tx, fundSourceId, dateReceived) => {
  if (!fundSourceId || !dateReceived) return;

  const date = new Date(dateReceived);
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

  // Only update if ledger exists and is OPEN
  if (ledger && ledger.status === "OPEN") {
    // 2. Recalculate Total Disbursed (Sum of all PAID disbursements in this period)
    const disbAgg = await tx.disbursement.aggregate({
      _sum: { netAmount: true },
      where: {
        fundSourceId: Number(fundSourceId),
        status: Status.PAID, // Only count PAID records
        dateReceived: {
          gte: ledger.startDate,
          lte: ledger.endDate,
        },
        deletedAt: null,
      },
    });

    const totalDisbursed = Number(disbAgg._sum.netAmount || 0);

    // 3. Recalculate Ending Balance
    // Ending = Starting + Entries - Disbursed
    const endingBalance =
      Number(ledger.startingBalance) +
      Number(ledger.totalEntry) -
      totalDisbursed;

    // 4. Update the ledger
    await tx.fundLedger.update({
      where: { id: ledger.id },
      data: {
        totalDisbursed,
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
 * * GENERATE LDDAP SERIES CODE
 */
export const generateLDDAPCode = async (req, res) => {
  const { date, seriesCode } = req.body;

  try {
    if (!date || !seriesCode) {
      return res.status(400).json({ message: "Date and series code required" });
    }

    const lddapCode = await genLDDAPCode(date, seriesCode);
    res.status(200).json({ lddapCode });
  } catch (error) {
    console.log("Error in the genLDDAPCode controller: " + error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * STORE REQCORD: Validates disbursement input, initiates transaction, creates log, sends notification and email after successful storing
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const storeRec = async (req, res) => {
  const {
    payeeId,
    fundsourceId,
    lddapNum,
    checkNum,
    projectName,
    ncaNum,
    particulars,
    method,
    lddapMethod,
    ageLimit,
    status,
    dateReceived,
    approvedAt,
    grossAmount,
    acicNum,
    orsNum,
    dvNum,
    uacsCode,
    respCode,
    sendMail,
    items = [],
    deductions = [],
  } = req.body;

  const userId = req.user?.id;

  // * Handle boolean flag safely
  const shouldSendMail = String(sendMail) === "true";

  try {
    // 1. Basic Validation
    if (!payeeId || !fundsourceId) {
      return res
        .status(400)
        .json({ message: "Payee and Fund Source are required." });
    }
    if (!grossAmount) {
      return res.status(400).json({ message: "Gross amount required" });
    }
    if (!method) {
      return res
        .status(400)
        .json({ message: "Disbursement method is required." });
    }
    if (!dateReceived) {
      return res.status(400).json({ message: "Date Received is required." });
    }
    if (items.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one item is required." });
    }

    // 2. Uniqueness Check (LDDAP & Check Number)
    const uniqueConditions = [];
    if (lddapNum && String(lddapNum).trim() !== "") {
      uniqueConditions.push({ lddapNum: String(lddapNum).trim() });
    }
    if (checkNum && String(checkNum).trim() !== "") {
      uniqueConditions.push({ checkNum: String(checkNum).trim() });
    }

    if (uniqueConditions.length > 0) {
      const existingRecord = await prisma.disbursement.findFirst({
        where: {
          deletedAt: null, // Only check active records
          OR: uniqueConditions,
        },
      });

      if (existingRecord) {
        const conflictField =
          existingRecord.lddapNum === lddapNum
            ? `LDDAP Number (${lddapNum})`
            : `Check Number (${checkNum})`;
        return res
          .status(409)
          .json({ message: `${conflictField} already exists.` });
      }
    }

    // 3. Calculation
    const calculatedGross = calculateGross(items);
    const calculatedDeductions = calculateDeductions(deductions);
    const calculatedNet = calculatedGross - calculatedDeductions;

    // Determine Status (Default to PAID if not specified)
    const recordStatus = status || Status.PAID;

    // Determine Approved Date
    let finalApprovedAt = approvedAt ? new Date(approvedAt) : null;
    if (recordStatus === Status.PAID && !finalApprovedAt) {
      finalApprovedAt = new Date();
    }

    const newDisbursement = await prisma.$transaction(async (tx) => {
      const record = await tx.disbursement.create({
        data: {
          payeeId: Number(payeeId),
          fundSourceId: Number(fundsourceId),
          lddapNum,
          checkNum,
          projectName,
          ncaNum,
          particulars,
          method,
          lddapMthd: lddapMethod,
          status: recordStatus,
          ageLimit: ageLimit ? Number(ageLimit) : 5,
          dateReceived: new Date(dateReceived),
          approvedAt: finalApprovedAt,
          grossAmount: calculatedGross,
          totalDeductions: calculatedDeductions,
          netAmount: calculatedNet,
          items: {
            create: items.map((item) => ({
              description: item.description,
              accountCode: item.accountCode,
              amount: Number(item.amount),
            })),
          },
          deductions: {
            create: deductions
              .filter(
                (ded) =>
                  ded.deductionType != null &&
                  String(ded.deductionType).trim() !== "" &&
                  ded.amount != null,
              )
              .map((ded) => ({
                deductionType: ded.deductionType.trim(),
                amount: Number(ded.amount),
              })),
          },
          references: {
            create: {
              acicNum: acicNum || "",
              orsNum: orsNum || "",
              dvNum: dvNum || "",
              uacsCode: uacsCode || "",
              respCode: respCode || "",
            },
          },
        },
        include: {
          items: true,
          deductions: true,
          references: true,
          payee: true,
          fundSource: true,
        },
      });

      const refId = record.lddapNum || record.checkNum || `ID#${record.id}`;
      await createLog(
        tx,
        userId,
        `Created disbursement ${refId} for ${record.payee?.name} (Net: ${record.netAmount})`,
      );

      // * UPDATE LEDGER (Only if PAID)
      if (record.status === Status.PAID) {
        await updateLedger(tx, record.fundSourceId, record.dateReceived);
      }

      return record;
    });

    // * Send Confirmation email
    if (
      shouldSendMail &&
      newDisbursement.status === Status.PAID &&
      newDisbursement.payee?.email
    ) {
      const formattedAmount = new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(newDisbursement.netAmount);

      const formattedDate = newDisbursement.approvedAt
        ? new Date(newDisbursement.approvedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

      const referenceNumber =
        newDisbursement.lddapNum ||
        newDisbursement.checkNum ||
        `REF-${newDisbursement.id}`;

      sendConfirmationEmail(newDisbursement.payee.email, {
        payeeName: newDisbursement.payee.name,
        amount: formattedAmount,
        referenceNumber: referenceNumber,
        date: formattedDate,
        purpose: newDisbursement.particulars || "Disbursement Payment",
      }).catch((err) => console.error("Background Email Error:", err));
    }

    // Broadcast Notification
    const refNum =
      newDisbursement.lddapNum ||
      newDisbursement.checkNum ||
      `#${newDisbursement.id}`;
    const payeeName = newDisbursement.payee?.name || "Unknown Payee";

    await broadcastNotification(
      "New Disbursement Created",
      `A new disbursement ${refNum} for ${payeeName} has been encoded.`,
      "INFO",
    );

    io.emit("disbursement_updates", { type: "CREATE", data: newDisbursement });

    res.status(201).json(newDisbursement);
  } catch (error) {
    console.log("Error in the storeRec controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * DISPLAY RECORD
 */
export const displayRec = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { search, status, startDate, method, fundId, endDate } = req.query;

  try {
    const where = { deletedAt: null };

    if (status && status !== "all") where.status = status;
    if (method && method !== "all") where.method = method;
    if (fundId && fundId !== "all") where.fundSourceId = Number(fundId);

    if (startDate || endDate) {
      where.dateReceived = {};
      if (startDate) where.dateReceived.gte = new Date(startDate);
      if (endDate) where.dateReceived.lte = new Date(endDate);
    } else {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      where.dateReceived = { gte: startOfMonth };
    }

    if (search) {
      where.OR = [
        { payee: { name: { contains: search, mode: "insensitive" } } },
        { lddapNum: { contains: search, mode: "insensitive" } },
        { checkNum: { contains: search, mode: "insensitive" } },
        {
          references: {
            some: {
              OR: [
                { orsNum: { contains: search, mode: "insensitive" } },
                { dvNum: { contains: search, mode: "insensitive" } },
                { uacsCode: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    const [totalRecords, records] = await prisma.$transaction([
      prisma.disbursement.count({ where }),
      prisma.disbursement.findMany({
        where,
        skip: skip,
        take: limit,
        orderBy: { dateReceived: "desc" },
        select: {
          id: true,
          dateReceived: true,
          projectName: true,
          netAmount: true,
          status: true,
          method: true,
          lddapNum: true,
          checkNum: true,
          payee: { select: { name: true } },
          fundSource: { select: { code: true, name: true } },
          references: { select: { orsNum: true, dvNum: true }, take: 1 },
        },
      }),
    ]);

    res.status(200).json({
      data: records,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },
    });
  } catch (error) {
    console.log("Error in the displayRec controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * SHOW RECORD
 */
export const showRec = async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) {
      return res.status(400).json({ message: "Disbursement ID is required." });
    }

    const record = await prisma.disbursement.findUnique({
      where: { id: Number(id) },
      include: {
        items: true,
        deductions: true,
        payee: true,
        references: true,
        fundSource: { select: { code: true, name: true, description: true } },
      },
    });

    if (!record) {
      return res.status(404).json({ messaage: "Record not found." });
    }

    res.status(200).json(record);
  } catch (error) {
    console.log("Error in showRec controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * EDIT RECORD
 */
/**
 * * EDIT RECORD
 */
export const editRec = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const {
    payeeId,
    fundSourceId,
    lddapNum,
    checkNum,
    projectName,
    ncaNum,
    particulars,
    method,
    lddapMethod,
    dateReceived,
    ageLimit,
    status,
    approvedAt,
    acicNum,
    orsNum,
    dvNum,
    uacsCode,
    respCode,
    items,
    deductions,
  } = req.body;

  try {
    const currentRecord = await findActiveRecord(id, {
      items: true,
      deductions: true,
      references: true,
    });

    if (!currentRecord) {
      return res.status(404).json({ message: "Disbursement not found." });
    }

    // 1. Uniqueness Check (LDDAP & Check Number)
    // We must check if these exist in OTHER records (not the one we are editing)
    const uniqueConditions = [];
    if (lddapNum && String(lddapNum).trim() !== "") {
      uniqueConditions.push({ lddapNum: String(lddapNum).trim() });
    }
    if (checkNum && String(checkNum).trim() !== "") {
      uniqueConditions.push({ checkNum: String(checkNum).trim() });
    }

    if (uniqueConditions.length > 0) {
      const existingRecord = await prisma.disbursement.findFirst({
        where: {
          deletedAt: null,
          id: { not: Number(id) }, // Exclude current record
          OR: uniqueConditions,
        },
      });

      if (existingRecord) {
        const conflictField =
          existingRecord.lddapNum === lddapNum
            ? `LDDAP Number (${lddapNum})`
            : `Check Number (${checkNum})`;
        return res
          .status(409)
          .json({ message: `${conflictField} already exists.` });
      }
    }

    // 2. Prepare Calculations
    let newGross = Number(currentRecord.grossAmount);
    let newTotalDeductions = Number(currentRecord.totalDeductions);
    let itemsUpdateOp = undefined;
    let deductionsUpdateOp = undefined;

    if (items && Array.isArray(items)) {
      newGross = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      itemsUpdateOp = {
        deleteMany: {},
        create: items.map((item) => ({
          description: item.description,
          accountCode: item.accountCode,
          amount: Number(item.amount),
        })),
      };
    }

    if (deductions && Array.isArray(deductions)) {
      const validDeductions = deductions.filter(
        (ded) =>
          ded.deductionType != null &&
          String(ded.deductionType).trim() !== "" &&
          ded.amount != null,
      );
      newTotalDeductions = validDeductions.reduce(
        (sum, ded) => sum + Number(ded.amount || 0),
        0,
      );
      deductionsUpdateOp = {
        deleteMany: {},
        create: validDeductions.map((ded) => ({
          deductionType: ded.deductionType.trim(),
          amount: Number(ded.amount),
        })),
      };
    }

    const newNet = newGross - newTotalDeductions;

    // 3. Database Transaction
    const updatedRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.disbursement.update({
        where: { id: Number(id) },
        data: {
          payeeId: payeeId ? Number(payeeId) : undefined,
          fundSourceId: fundSourceId ? Number(fundSourceId) : undefined,
          lddapNum,
          checkNum,
          projectName,
          ncaNum,
          particulars,
          method,
          lddapMthd: lddapMethod,
          ageLimit:
            ageLimit != null && ageLimit !== "" ? Number(ageLimit) : undefined,
          dateReceived: dateReceived ? new Date(dateReceived) : undefined,
          ...(status != null && { status }),
          ...(approvedAt != null && {
            approvedAt: approvedAt ? new Date(approvedAt) : null,
          }),
          grossAmount: newGross,
          totalDeductions: newTotalDeductions,
          netAmount: newNet,
          items: itemsUpdateOp,
          deductions: deductionsUpdateOp,
          references: {
            deleteMany: {},
            create: {
              acicNum: acicNum || "",
              orsNum: orsNum || "",
              dvNum: dvNum || "",
              uacsCode: uacsCode || "",
              respCode: respCode || "",
            },
          },
        },
        include: {
          items: true,
          deductions: true,
          references: true,
          payee: true,
          fundSource: true,
        },
      });

      const financialNote =
        items || deductions
          ? `(Updated net: ${record.netAmount})`
          : `(Details Update)`;

      await createLog(
        tx,
        userId,
        `Edited disbursement #${record.id} - ${record.payee?.name} ${financialNote}`,
      );

      // * UPDATE LEDGERS
      // If Date or Fund Source changed, we must update the OLD ledger to remove the amount
      const oldFundId = currentRecord.fundSourceId;
      const oldDate = currentRecord.dateReceived;
      const newFundId = record.fundSourceId;
      const newDate = record.dateReceived;

      const hasChangedContext =
        oldFundId !== newFundId ||
        oldDate.getTime() !== newDate.getTime() ||
        currentRecord.status !== record.status; // e.g. Changed from PAID to PENDING

      if (hasChangedContext) {
        await updateLedger(tx, oldFundId, oldDate);
      }

      // Always update the NEW ledger to add the amount (or update amount)
      await updateLedger(tx, newFundId, newDate);

      return record;
    });

    io.emit("disbusrement_updates", { type: "UPDATE", data: updatedRecord });
    res.status(200).json(updatedRecord);
  } catch (error) {
    console.log("Error in editRec controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * APPROVE RECORD
 */
export const approveRec = async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;
  const userId = req.user?.id;

  try {
    if (!id) {
      return res.status(400).json({ message: "Disbursement ID is required." });
    }

    const record = await prisma.disbursement.findUnique({
      where: { id: Number(id) },
      include: {
        payee: true,
        fundSource: { select: { code: true, name: true } },
      },
    });

    if (!record) {
      return res.status(404).json({ message: "Disbursement not found." });
    }

    if (record.status === Status.PAID) {
      return res
        .status(409)
        .json({ message: "Record is already approved/paid." });
    }

    const result = await prisma.$transaction(async (tx) => {
      // * Set status to PAID so it counts in the ledger
      const approvedRecord = await tx.disbursement.update({
        where: { id: Number(id) },
        data: {
          status: Status.PAID,
          approvedAt: new Date(),
        },
        include: {
          payee: true,
          fundSource: { select: { code: true, name: true } },
          items: true,
          deductions: true,
        },
      });

      if (userId) {
        const logMessage = `APPROVED Disbursement #${id} | Payee: ${
          record.payee?.name || "N/A"
        } | Fund: ${record.fundSource?.code || "N/A"} | Net Amount: ₱${Number(
          record.netAmount,
        ).toLocaleString("en-PH", { minimumFractionDigits: 2 })}${
          remarks ? ` | Remarks: ${remarks}` : ""
        }`;

        await tx.logs.create({
          data: { userId: userId, log: logMessage },
        });
      }

      // * UPDATE LEDGER
      await updateLedger(
        tx,
        approvedRecord.fundSourceId,
        approvedRecord.dateReceived,
      );

      return approvedRecord;
    });

    if (result.payee?.email) {
      const formattedAmount = new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(result.netAmount);

      const formattedDate = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      const referenceNumber =
        result.lddapNum || result.checkNum || `REF-${result.id}`;

      await sendConfirmationEmail(result.payee.email, {
        payeeName: result.payee.name,
        amount: formattedAmount,
        referenceNumber: referenceNumber,
        date: formattedDate,
        purpose: result.particulars || "Disbursement Payment",
      });
    }

    const refNum = result.lddapNum || result.checkNum || `#${result.id}`;
    const payeeName = result.payee?.name || "Unknown Payee";

    await broadcastNotification(
      "Disbursement Approved",
      `Disbursement ${refNum} for ${payeeName} has been approved.`,
      "SUCCESS",
    );

    io.emit("disbursement_updates", { type: "UPDATE", data: result });

    res.status(200).json({
      message: "Disbursement approved successfully.",
      data: result,
    });
  } catch (error) {
    console.log("Error in approveRec controller: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * REMOVE RECORD
 */
export const removeRec = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const recordToCheck = await prisma.disbursement.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        deletedAt: true,
        payee: { select: { name: true } },
        fundSourceId: true,
        dateReceived: true,
        status: true,
      },
    });

    if (!recordToCheck) {
      return res.status(404).json({ message: "Disbursement Record not found" });
    }

    if (recordToCheck.deletedAt) {
      return res.status(400).json({ message: "Record already deleted." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.disbursement.update({
        where: { id: Number(id) },
        data: {
          deletedAt: new Date(),
        },
      });

      const logDescription = `Deleted disbusrement #${id} (${
        recordToCheck.payee?.name || "Unknown Payee"
      })`;
      await createLog(tx, userId, logDescription);

      // * UPDATE LEDGER
      // Only needed if the deleted record was PAID/Active
      if (recordToCheck.status === Status.PAID) {
        await updateLedger(
          tx,
          recordToCheck.fundSourceId,
          recordToCheck.dateReceived,
        );
      }
    });

    io.emit("disbursement_updates", { type: "UPDATE" });

    res.status(200).json({
      message: "Disbursement record removed successfully.",
      id: Number(id),
    });
  } catch (error) {
    console.log("Error in removeRec controller: " + error.message);
    return res.status(500).json({ message: "Internal server error." });
  }
};
