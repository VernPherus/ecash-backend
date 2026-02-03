import { format } from "date-fns";

/**
 * * FORMAT: REPORT OF ADVICE TO DEBIT ACCOUNT ISSUED (ADA)
 * Replicates the layout of Appendix 13 from debit.pdf
 */
export const buildDebitReport = (worksheet, data) => {
  const { startDate, endDate, fund, disbursements, reportNumber } = data;

  //* --- SETUP COLUMNS & WIDTHS ---
  worksheet.columns = [
    { key: "date", width: 12 }, // A
    { key: "ada", width: 20 }, // B
    { key: "dv", width: 15 }, // C
    { key: "ors", width: 15 }, // D
    { key: "rcc", width: 15 }, // E
    { key: "payee", width: 30 }, // F
    { key: "uacs", width: 15 }, // G
    { key: "nature", width: 40 }, // H
    { key: "amount", width: 18 }, // I
  ];

  //* --- HEADER SECTION ---

  // Row 1: Appendix Label
  worksheet.mergeCells("H1:I1");
  const appendixCell = worksheet.getCell("H1");
  appendixCell.value = "Appendix 13";
  appendixCell.font = { italic: true, size: 10 };
  appendixCell.alignment = { horizontal: "right" };

  // Row 3: Title
  worksheet.mergeCells("A3:I3");
  const titleCell = worksheet.getCell("A3");
  titleCell.value = "REPORT OF ADVICE TO DEBIT ACCOUNT ISSUED";
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center" };

  // Row 4: Period
  worksheet.mergeCells("A4:I4");
  const periodCell = worksheet.getCell("A4");
  periodCell.value = `Period Covered: ${format(startDate, "MMMM dd")} to ${format(endDate, "MMMM dd, yyyy")}`;
  periodCell.font = { bold: true, size: 11 };
  periodCell.alignment = { horizontal: "center" };

  // Row 6-8: Meta Data
  worksheet.getCell("A6").value =
    `Entity Name: Department of Science and Technology - Region 1`;
  worksheet.getCell("A7").value = `Fund Cluster: ${fund.code} - ${fund.name}`;
  worksheet.getCell("A8").value =
    `Bank Name/Account No.: ${fund.description || "LBP MDS ACCOUNT"}`;

  worksheet.getCell("H6").value = `Report No.: ${reportNumber}`;
  worksheet.getCell("H7").value = `Sheet No.:`; // To be filled manually or logically if multipage

  // --- TABLE HEADERS ---
  const headerRowIdx = 10;
  const headers = [
    "Date",
    "ADA\nSerial No.",
    "DV/Payroll\nNo.",
    "ORS/BURS No.",
    "Responsibility\nCenter Code",
    "Payee",
    "UACS Object\nCode",
    "Nature of Payment",
    "Amount",
  ];

  const headerRow = worksheet.getRow(headerRowIdx);
  headerRow.values = headers;
  headerRow.height = 30;

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // --- 4. DATA POPULATION ---
  let currentRowIdx = headerRowIdx + 1;
  let totalAmount = 0;

  disbursements.forEach((d) => {
    // Determine UACS: Try Reference first, fallback to items
    const uacs =
      d.references?.[0]?.uacsCode ||
      d.items.map((i) => i.accountCode).join(", ");

    // Determine Refs
    const adaNo = d.lddapNum || "";
    const dvNo = d.references?.[0]?.dvNum || "";
    const orsNo = d.references?.[0]?.orsNum || "";
    const respCode = d.references?.[0]?.respCode || "";

    const rowValues = [
      d.dateReceived ? format(new Date(d.dateReceived), "MM/dd/yyyy") : "", // Date
      adaNo, // ADA
      dvNo, // DV
      orsNo, // ORS
      respCode, // RCC
      d.payee?.name || "", // Payee
      uacs, // UACS
      d.particulars || "", // Nature
      Number(d.netAmount), // Amount
    ];

    const row = worksheet.getRow(currentRowIdx);
    row.values = rowValues;
    row.height = 20;

    // Styling
    row.eachCell((cell, colNum) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle", wrapText: true };

      // Align Amount Right
      if (colNum === 9) {
        cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
      // Align Dates/Codes Center
      if (colNum <= 5 || colNum === 7) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    });

    totalAmount += Number(d.netAmount);
    currentRowIdx++;
  });

  //* --- FOOTER (TOTAL) ---
  const footerRow = worksheet.getRow(currentRowIdx);
  footerRow.getCell(8).value = "GRAND TOTAL";
  footerRow.getCell(8).font = { bold: true };
  footerRow.getCell(8).alignment = { horizontal: "right" };

  const totalCell = footerRow.getCell(9);
  totalCell.value = totalAmount;
  totalCell.numFmt = "#,##0.00";
  totalCell.font = { bold: true };
  totalCell.alignment = { horizontal: "right" };
  totalCell.border = { top: { style: "thin" }, bottom: { style: "double" } };

  //* --- CERTIFICATION ---
  const certStartRow = currentRowIdx + 3;

  worksheet.mergeCells(`A${certStartRow}:I${certStartRow}`);
  const certTitle = worksheet.getCell(`A${certStartRow}`);
  certTitle.value = "CERTIFICATION";
  certTitle.font = { bold: true, size: 12 };
  certTitle.alignment = { horizontal: "center" };

  worksheet.mergeCells(`A${certStartRow + 1}:I${certStartRow + 2}`);
  const certText = worksheet.getCell(`A${certStartRow + 1}`);
  certText.value = `I hereby certify on my official oath that the above is a true statement of all ADAs issued by me during the period stated above for which ADA Nos. ${disbursements[0]?.lddapNum || "..."} to ${disbursements[disbursements.length - 1]?.lddapNum || "..."} inclusive, were actually issued by me in the amounts shown thereon.`;
  certText.alignment = { horizontal: "center", wrapText: true };

  //* Signature Block
  const sigRow = certStartRow + 5;
  worksheet.mergeCells(`D${sigRow}:F${sigRow}`);
  const sigName = worksheet.getCell(`D${sigRow}`);
  sigName.value = "VENUS P. ANDAYA"; 
  sigName.font = { bold: true, underline: true };
  sigName.alignment = { horizontal: "center" };

  worksheet.mergeCells(`D${sigRow + 1}:F${sigRow + 1}`);
  const sigRole = worksheet.getCell(`D${sigRow + 1}`);
  sigRole.value = "Administrative Officer V / Cashier III";
  sigRole.alignment = { horizontal: "center" };

  worksheet.mergeCells(`D${sigRow + 2}:F${sigRow + 2}`);
  const sigDate = worksheet.getCell(`D${sigRow + 2}`);
  sigDate.value = format(new Date(), "MMMM dd, yyyy");
  sigDate.alignment = { horizontal: "center" };
};

/**
 * 
 */
export const buildCheckReport = (worksheet, data) => {

}