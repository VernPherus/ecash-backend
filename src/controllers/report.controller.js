import { prisma } from "../lib/prisma.js";
import ExcelJS from "exceljs";
import { startOfMonth, endOfMonth } from "date-fns";
import { buildDebitReport, buildCheckReport } from "../lib/reportGenerator.js"; // Import the helper
import { Status } from "../lib/constants.js";

/**
 * * GENERATE DEBIT REPORT (ADA)
 * Generates "Report of Advice to Debit Account Issued"
 * Filter: Method = LDDAP
 * GET /api/reports/debit?year=2026&month=01&fundId=1
 */
export const generateDebitReport = async (req, res) => {
  const { year, month, fundId } = req.query;

  try {
    //* Validation
    if (!year || !month || !fundId) {
      return res
        .status(400)
        .json({ message: "Year, Month, and Fund ID are required." });
    }

    //* Define Date Range
    const startDate = startOfMonth(new Date(Number(year), Number(month) - 1));
    const endDate = endOfMonth(new Date(Number(year), Number(month) - 1));

    //* Fetch Fund
    const fund = await prisma.fundSource.findUnique({
      where: { id: Number(fundId) },
    });

    if (!fund)
      return res.status(404).json({ message: "Fund Source not found." });

    //* Fetch Disbursements (LDDAP Only)
    const disbursements = await prisma.disbursement.findMany({
      where: {
        fundSourceId: Number(fundId),
        method: "LDDAP", // Strict filter for Debit Report
        status: { in: [Status.PAID, Status.CANCELLED] }, // Ensure only valid records
        dateReceived: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        payee: true,
        items: true,
        references: true,
      },
      orderBy: {
        dateReceived: "asc",
      },
    });

    //* Initialize Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Debit Report");

    //* Call Helper to Format Excel
    // We pass data objects so the helper stays pure
    const reportData = {
      startDate,
      endDate,
      fund,
      disbursements,
      reportNumber: `${year}-${month}`,
    };

    buildDebitReport(worksheet, reportData);

    //* Send Response
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=DebitReport-${fund.code}-${year}-${month}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.log("Error generating debit report:", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};

/**
 * * GENERATE CHECK REPORT (RCI)
 * Generates "Report of Checks Issued"
 * Filter: Method = CHECK
 * GET /api/reports/check?year=2026&month=01&fundId=1
 */
export const generateCheckReport = async (req, res) => {
  const { year, month, fundId } = req.query;

  try {
    //* Validation
    if (!year || !month || !fundId) {
      return res
        .status(400)
        .json({ message: "Year, Month, and Fund ID are required." });
    }

    //* Define Date Range
    const startDate = startOfMonth(new Date(Number(year), Number(month) - 1));
    const endDate = endOfMonth(new Date(Number(year), Number(month) - 1));

    //* Fetch Fund
    const fund = await prisma.fundSource.findUnique({
      where: { id: Number(fundId) },
    });

    if (!fund)
      return res.status(404).json({ message: "Fund Source not found." });

    //* Fetch Disbursements (CHECK Only)
    const disbursements = await prisma.disbursement.findMany({
      where: {
        fundSourceId: Number(fundId),
        method: "CHECK", // Strict filter for Check Report
        status: { in: [Status.PAID, Status.CANCELLED] },
        dateReceived: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        payee: true,
        items: true,
        references: true,
      },
      orderBy: {
        dateReceived: "asc", // Order by date, then usually serial if needed
      },
    });

    //* Initialize Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Check Report");

    //* Call Helper to Format Excel
    const reportData = {
      startDate,
      endDate,
      fund,
      disbursements,
      reportNumber: `${year}-${month}-002`, // Example report numbering
    };

    buildCheckReport(worksheet, reportData);

    //* Send Response
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=CheckReport-${fund.code}-${year}-${month}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.log("Error generating check report:", error.message);
    res.status(500).json({ message: "Internal server error." });
  }
};
