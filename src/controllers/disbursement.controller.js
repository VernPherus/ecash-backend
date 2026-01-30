import { prisma } from "../lib/prisma.js";
import { Status } from "../lib/constants.js";
import { createLog } from "../lib/auditLogger.js";
import { findActiveRecord } from "../lib/dbHelpter.js";
import { genLDDAPCode } from "../lib/codeGenerator.js";
import { calculateGross, calculateDeductions } from "../lib/formulas.js";
import { io } from "../lib/socket.js";

/**
 * * GENERATE LDDAP CODE: Generates LDDAP code for lddap entries
 * @returns generated LDDAP code
 */
export const generateLDDAPCode = async (req, res) => {
  try {
    const lddapCode = await genLDDAPCode();

    res.status(200).json({ lddapCode });
  } catch (error) {
    console.log("Error in the genLDDAPCode controller: " + error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * * STORE RECORD: Store disbursement, disbursement items, deductions and calculate funds
 * @param {Object} req - Takes all disbursement data in req.body
 * @param {Object} res - Returns the new disbursement
 * @returns
 */
export const storeRec = async (req, res) => {
  const {
    //* FKs
    payeeId,
    fundsourceId,

    //* Disb Details
    lddapNum,
    checkNum,
    particulars,
    method,
    lddapMethod,
    ageLimit,
    status,

    //* Dates
    dateReceived,
    approvedAt,

    //* Financial
    grossAmount,

    //* References
    acicNum,
    orsNum,
    dvNum,
    uacsCode,
    respCode,

    //* Items
    items = [],
    deductions = [],
  } = req.body;

  const userId = req.user?.id;

  try {
    //* Validation
    if (!payeeId || !fundsourceId) {
      return res
        .status(400)
        .json({ message: "Payee and Fund Source are required." });
    }

    if (!grossAmount) {
      return res.status(400).json({ message: "Gross amount requried" });
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

    //* Calculations
    // Sum up items for Gross Amount
    const calculatedGross = calculateGross(items);

    // Sum up deductions
    const calculatedDeductions = calculateDeductions(deductions);

    // Calculate net amount
    const calculatedNet = calculatedGross - calculatedDeductions;

    //* Create disbursement
    const newDisbursement = await prisma.$transaction(async (tx) => {
      const record = await tx.disbursement.create({
        data: {
          // FK
          payeeId: Number(payeeId),
          fundSourceId: Number(fundsourceId),

          //Main Details
          lddapNum,
          checkNum,
          particulars,
          method,
          lddapMthd: lddapMethod,
          status: status || Status.PAID,
          ageLimit: ageLimit ? Number(ageLimit) : 5,

          // Dates
          dateReceived: new Date(dateReceived),
          approvedAt: approvedAt ? new Date(approvedAt) : null,

          // Financials
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

      return record;
    });

    //* Socket.io implementation
    io.emit("disbursement_updates", { type: "CREATE", data: newDisbursement });

    res.status(201).json(newDisbursement);
  } catch (error) {
    console.log("Error in the storeRec controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * DISPLAY RECORD: Display disbursement records for dashboard
 * Shows disbursement date received, payee, fund, net amount, and status
 * Sample:
 * GET /api/disbursement/display?page=1&limit=10&search=acme&status=PENDING&startDate=2024-01-01
 * TODO: Add socket.io realtime functionality
 * @param {Object} req - Params for page and disbursement limit
 * @param {Object} res - Returns 10 disbursement records in json format
 * @returns
 */
export const displayRec = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { search, status, startDate, method, fundId, endDate } = req.query;

  try {
    // Build where
    const where = {
      deletedAt: null,
    };

    //* Filters
    // Status Filter
    if (status && status !== "all") {
      where.status = status;
    }

    // Method Filter (Exact Match)
    if (method && method !== "all") {
      where.method = method;
    }

    // Fund Source Filter (ID Match)
    if (fundId && fundId !== "all") {
      where.fundSourceId = Number(fundId);
    }

    // Date Range Filter
    if (startDate || endDate) {
      where.dateReceived = {};
      if (startDate) where.dateReceived.gte = new Date(startDate);
      if (endDate) where.dateReceived.lte = new Date(endDate);
    } else {
      // DEFAULT: No dates provided -> Filter for Current Month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0); // Start of the day (00:00:00)

      where.dateReceived = {
        gte: startOfMonth,
      };
    }

    // Search
    if (search) {
      where.OR = [
        // Search Payee Name
        { payee: { name: { contains: search, mode: "insensitive" } } },
        // Search Direct Documents
        { lddapNum: { contains: search, mode: "insensitive" } },
        { checkNum: { contains: search, mode: "insensitive" } },
        // Search inside Related References (ORS/DV)
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

    //*  Execute Query
    const [totalRecords, records] = await prisma.$transaction([
      prisma.disbursement.count({ where }),

      prisma.disbursement.findMany({
        where,
        skip: skip,
        take: limit,
        orderBy: {
          dateReceived: "desc",
        },
        select: {
          id: true,
          dateReceived: true,
          netAmount: true,
          status: true,
          method: true,
          lddapNum: true,
          checkNum: true,

          payee: {
            select: {
              name: true,
            },
          },
          fundSource: {
            select: {
              code: true,
              name: true,
            },
          },
          references: {
            select: {
              orsNum: true,
              dvNum: true,
            },
            take: 1,
          },
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
 * * SHOW RECORD: Show all data in one disbursement, accessed by view disbursement function in dashboard.
 * @param {Object} req - Takes the disbursement id to display
 * @param {Object} res - Returns all disbursement data
 * @returns
 */
export const showRec = async (req, res) => {
  const { id } = req.params;

  try {
    //* Validation
    if (!id) {
      return res.status(400).json({ message: "Disbursement ID is required." });
    }

    //* Get record
    const record = await prisma.disbursement.findUnique({
      where: {
        id: Number(id),
      },
      include: {
        items: true,
        deductions: true,
        payee: true,
        references: true,
        fundSource: { select: { code: true, name: true, description: true } },
      },
    });

    //* Handle non-existent records
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
 * * EDIT RECORD: Edit a record's finances, reference codes, fund source and payee
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const editRec = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const {
    //* FK
    payeeId,
    fundSourceId,

    //* Details
    lddapNum,
    checkNum,
    particulars,
    method,
    lddapMethod,
    dateReceived,
    ageLimit,

    //* Status / approval
    status,
    approvedAt,

    //* References
    acicNum,
    orsNum,
    dvNum,
    uacsCode,
    respCode,

    //* Financials
    items,
    deductions,
  } = req.body;

  try {
    //* Validation

    // Initial fetch to validate status
    const currentRecord = await findActiveRecord(id, {
      items: true,
      deductions: true,
      references: true,
    });

    if (!currentRecord) {
      return res
        .status(404)
        .json({ message: "Disbursement not found or unavailable." });
    }

    //* Recalculations
    let newGross = Number(currentRecord.grossAmount);
    let newTotalDeductions = Number(currentRecord.totalDeductions);
    let itemsUpdateOp = undefined;
    let deductionsUpdateOp = undefined;

    //* Handle Items update
    if (items && Array.isArray(items)) {
      newGross = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

      // Delete old items and create new ones
      itemsUpdateOp = {
        deleteMany: {},
        create: items.map((item) => ({
          description: item.description,
          accountCode: item.accountCode,
          amount: Number(item.amount),
        })),
      };
    }

    //* Handle deductions update
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

    // Calculate new Net
    const newNet = newGross - newTotalDeductions;

    //* Handle Disbursement Update
    const updatedRecord = await prisma.$transaction(async (tx) => {
      // Update Disbursement
      const record = await tx.disbursement.update({
        where: { id: Number(id) },
        data: {
          // Direct Fields
          payeeId: payeeId ? Number(payeeId) : undefined,
          fundSourceId: fundSourceId ? Number(fundSourceId) : undefined,
          lddapNum,
          checkNum,
          particulars,
          method,
          lddapMthd: lddapMethod,
          ageLimit:
            ageLimit != null && ageLimit !== "" ? Number(ageLimit) : undefined,
          dateReceived: dateReceived ? new Date(dateReceived) : undefined,

          // Status / approval
          ...(status != null && { status }),
          ...(approvedAt != null && {
            approvedAt: approvedAt ? new Date(approvedAt) : null,
          }),

          // Financials
          grossAmount: newGross,
          totalDeductions: newTotalDeductions,
          netAmount: newNet,

          // Nested Relations: Items & Deductions
          items: itemsUpdateOp,
          deductions: deductionsUpdateOp,

          // Nested Relations: References
          references: {
            deleteMany: {}, // Clear old references
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

      // Create log
      const financialNote =
        items || deductions
          ? `(Updated net: ${record.netAmount})`
          : `(Details Update)`;

      await createLog(
        tx,
        userId,
        `Edited disbursement #${record.id} - ${record.payee?.name} ${financialNote}`,
      );

      return record;
    });

    // Socket.io
    io.emit("disbusrement_updates", { type: "UPDATE", data: updatedRecord });

    res.status(200).json(updatedRecord);
  } catch (error) {
    console.log("Error in editRec controller: ", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * APPROVE RECORD
 * @param {Object} req - Takes disbursement id to update
 * @param {Object} res
 * @returns
 */
export const approveRec = async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;
  const userId = req.user?.id;

  try {
    //* Validation
    if (!id) {
      return res.status(400).json({ message: "Disbursement ID is required." });
    }

    //* Check status and get record details for logging
    const record = await prisma.disbursement.findUnique({
      where: { id: Number(id) },
      include: {
        payee: { select: { name: true } },
        fundSource: { select: { code: true, name: true } },
      },
    });

    if (!record) {
      return res.status(404).json({ message: "Disbursement not found." });
    }

    //* Status check
    if (record.status === "approved") {
      return res.status(409).json({ message: "Record is already approved." });
    }

    //* Use transaction with logging
    const result = await prisma.$transaction(async (tx) => {
      //* Update disbursement status
      const approvedRecord = await tx.disbursement.update({
        where: { id: Number(id) },
        data: {
          status: "approved",
          approvedAt: new Date(),
        },
        include: {
          payee: { select: { name: true } },
          fundSource: { select: { code: true, name: true } },
          items: true,
          deductions: true,
        },
      });

      //* Create audit log
      if (userId) {
        const logMessage = `APPROVED Disbursement #${id} | Payee: ${record.payee?.name || "N/A"} | Fund: ${record.fundSource?.code || "N/A"} | Net Amount: ₱${Number(record.netAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}${remarks ? ` | Remarks: ${remarks}` : ""}`;

        await tx.logs.create({
          data: {
            userId: userId,
            log: logMessage,
          },
        });
      }

      return approvedRecord;
    });

    // Socket.io
    io.emit("disbursement_updates", { type: "UPDATE", data: result });

    //* Return
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
 * * REMOVE RECORD: Soft deletes disbursement record entry
 * Just adds a deletion date, when deletion date filled, disbursement will not be displayed.
 * @param {Object} req - Takes disbursement id
 * @param {Object} res - Returns action status
 * @returns
 */
export const removeRec = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    // Validation
    const recordToCheck = await prisma.disbursement.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        deletedAt: true,
        payee: { select: { name: true } },
      },
    });

    if (!recordToCheck) {
      return res.status(404).json({ message: "Disbursement Record not found" });
    }

    if (recordToCheck.deletedAt) {
      return res.status(400).json({ message: "Record already deleted." });
    }

    // Perform soft deletion
    await prisma.$transaction(async (tx) => {
      await tx.disbursement.update({
        where: { id: Number(id) },
        data: {
          deletedAt: new Date(),
        },
      });

      // Create log
      const logDescription = `Deleted disbusrement #${id} (${recordToCheck.payee?.name || "Unknown Payee"})`;
      await createLog(tx, userId, logDescription);
    });

    // Socket.io
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
