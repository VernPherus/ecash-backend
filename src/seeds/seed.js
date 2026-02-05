import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

import {
  Role,
  Method,
  PayeeType,
  LddapMethod,
  Status,
  Reset,
} from "../lib/constants.js";

import bcrypt from "bcryptjs";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

//* Helper to generate a random date between start and end
function getRandomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

//* Helper to get random integer
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

//* Generate random code for references
const genCode = (prefix) =>
  `${prefix}-${getRandomInt(2024, 2025)}-${getRandomInt(1000, 9999)}`;

async function main() {
  console.log("Starting database seed...");

  //* --- Create Users ---
  const passwordHash = await bcrypt.hash("password123", 10);

  // Default System User for Automated Logs
  // Using raw SQL to ensure id = 1 for scheduler compatibility
  await prisma.$executeRaw`
    INSERT INTO tb_users (id, username, first_name, last_name, email, password, role, created_at, updated_at)
    VALUES (1, 'system_internal', 'System', 'Internal', 'system@fundwatch.com', ${passwordHash}, 'ADMIN', NOW(), NOW())
    ON CONFLICT (email) DO UPDATE 
    SET username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        role = EXCLUDED.role,
        updated_at = NOW()
  `;

  const systemUser = await prisma.user.findUnique({
    where: { email: "system@fundwatch.com" },
  });

  console.log(`System user created/updated with ID: ${systemUser.id}`);

  // Reset sequence to ensure next auto-generated ID is > 1
  await prisma.$executeRaw`
    SELECT setval(pg_get_serial_sequence('tb_users', 'id'), GREATEST(1, (SELECT MAX(id) FROM tb_users)))
  `;

  const admin = await prisma.user.upsert({
    where: { email: "admin@fundwatch.com" },
    update: {
      username: "admin_user",
      firstName: "Super",
      lastName: "Admin",
      role: Role.ADMIN,
    },
    create: {
      username: "admin_user",
      firstName: "Super",
      lastName: "Admin",
      email: "admin@fundwatch.com",
      password: passwordHash,
      role: Role.ADMIN,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "approver@fundwatch.com" },
    update: {
      username: "approver_staff",
      firstName: "Finance",
      lastName: "Manager",
      role: Role.STAFF,
    },
    create: {
      username: "approver_staff",
      firstName: "Finance",
      lastName: "Manager",
      email: "approver@fundwatch.com",
      password: passwordHash,
      role: Role.STAFF,
    },
  });

  const encoder = await prisma.user.upsert({
    where: { email: "encoder@fundwatch.com" },
    update: {
      username: "encoder_user",
      firstName: "User",
      lastName: "View",
      role: Role.USER,
    },
    create: {
      username: "encoder_user",
      firstName: "User",
      lastName: "View",
      email: "encoder@fundwatch.com",
      password: passwordHash,
      role: Role.USER,
    },
  });

  console.log("Users created including default System user.");

  //* --- Create Fund Sources ---
  const fund1 = await prisma.fundSource.upsert({
    where: { code: "GF-101" },
    update: {
      name: "Regular Agency Fund",
      description: "General Fund for regular agency operations (PS & MODE)",
      initialBalance: 5000000.0,
      reset: Reset.NONE,
    },
    create: {
      code: "GF-101",
      name: "Regular Agency Fund",
      description: "General Fund for regular agency operations (PS & MODE)",
      initialBalance: 5000000.0,
      reset: Reset.NONE,
    },
  });

  const fund2 = await prisma.fundSource.upsert({
    where: { code: "F-184" },
    update: {
      name: "MDS Trust Fund",
      initialBalance: 1500000.0,
      reset: Reset.MONTHLY,
    },
    create: {
      code: "F-184",
      name: "MDS Trust Fund",
      initialBalance: 1500000.0,
      reset: Reset.MONTHLY,
    },
  });

  // Handle fund entries separately to work with upsert
  const existingEntries = await prisma.fundEntry.findMany({
    where: { fundSourceId: fund2.id },
  });

  if (existingEntries.length === 0) {
    await prisma.fundEntry.createMany({
      data: [
        {
          fundSourceId: fund2.id,
          name: "NCA - 101",
          amount: 3000000.0,
        },
        {
          fundSourceId: fund2.id,
          name: "NCA - 102",
          amount: 2000000.0,
        },
      ],
    });
    console.log("Fund entries created for MDS Trust Fund.");
  }

  const funds = [fund1, fund2];
  console.log("Fund Sources created/updated.");

  //* --- Create Initial Ledgers for Each Fund ---
  console.log("Creating initial ledgers...");

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed

  // Calculate start and end dates for current month
  const ledgerStartDate = new Date(currentYear, currentMonth - 1, 1);
  const ledgerEndDate = new Date(currentYear, currentMonth, 0); // Last day of current month

  let ledgersCreated = 0;

  for (const fund of funds) {
    try {
      // Check if ledger already exists for this fund/year/period
      const existingLedger = await prisma.fundLedger.findUnique({
        where: {
          fundSourceId_year_period: {
            fundSourceId: fund.id,
            year: currentYear,
            period: currentMonth,
          },
        },
      });

      if (!existingLedger) {
        await prisma.fundLedger.create({
          data: {
            fundSourceId: fund.id,
            year: currentYear,
            period: currentMonth,
            startDate: ledgerStartDate,
            endDate: ledgerEndDate,
            startingBalance: fund.initialBalance,
            endingBalance: fund.initialBalance,
            totalEntry: 0,
            totalDisbursed: 0,
            status: "OPEN",
          },
        });
        ledgersCreated++;
        console.log(
          `  ✓ Created ledger for ${fund.code} (${currentYear}-${String(currentMonth).padStart(2, "0")})`,
        );
      } else {
        console.log(
          `  ⊘ Ledger already exists for ${fund.code} (${currentYear}-${String(currentMonth).padStart(2, "0")})`,
        );
      }
    } catch (error) {
      console.error(
        `  ✗ Failed to create ledger for ${fund.code}:`,
        error.message,
      );
    }
  }

  console.log(`Created ${ledgersCreated} initial ledger(s).`);

  //* --- Create Payees ---
  const payeesData = [
    {
      name: "Acme Office Supplies",
      address: "123 Business St, City Center",
      tinNum: "123-456-789-000",
      bankName: "Landbank",
      accountNumber: "1111-2222-33",
      contactPerson: "John Doe",
      type: PayeeType.SUPPLIER,
    },
    {
      name: "BuildRight Construction",
      address: "45 Industrial Ave, West Sector",
      tinNum: "987-654-321-000",
      bankName: "BDO",
      accountNumber: "5555-6666-77",
      contactPerson: "Jane Smith",
      type: PayeeType.SUPPLIER,
    },
    {
      name: "John Doe",
      address: "99 Utility Road",
      type: PayeeType.EMPLOYEE,
      remarks: "",
    },
    {
      name: "TechSolutions Inc",
      address: "88 Cyberzone, IT Park",
      bankName: "BPI",
      accountNumber: "9988-7766-55",
      type: PayeeType.EMPLOYEE,
    },
  ];

  const payees = [];
  for (const p of payeesData) {
    const existing = await prisma.payee.findFirst({ where: { name: p.name } });
    if (!existing) {
      const payee = await prisma.payee.create({ data: p });
      payees.push(payee);
    } else {
      payees.push(existing);
    }
  }

  console.log("Payees created.");

  //* Create Disbursements
  const today = new Date();
  const thisMonth = new Date();
  thisMonth.setDate(1);

  let lddapCreated = 0;
  let lddapFailed = 0;

  // --- LDDAP Method (10 Items) ---
  console.log("Creating LDDAP disbursements...");
  for (let i = 1; i <= 10; i++) {
    try {
      const randomFund = funds[getRandomInt(0, funds.length - 1)];
      const randomPayee = payees[getRandomInt(0, payees.length - 1)];
      const randomDate = getRandomDate(thisMonth, today);

      const gross = getRandomInt(10000, 50000);
      const tax = gross * 0.05;
      const net = gross - tax;

      const isOnline = i % 2 === 0;
      const lddapMethod = isOnline ? LddapMethod.ONLINE : LddapMethod.MANUAL;

      await prisma.disbursement.create({
        data: {
          payeeId: randomPayee.id,
          fundSourceId: randomFund.id,
          method: Method.LDDAP,
          lddapMthd: lddapMethod,
          lddapNum: genCode("LDDAP"),
          dateReceived: randomDate,
          grossAmount: gross,
          totalDeductions: tax,
          netAmount: net,
          particulars: `Payment for services (LDDAP ${lddapMethod}) - Batch ${i}`,
          status: Status.PAID,
          approvedAt: new Date(),
          references: {
            create: {
              acicNum: genCode("ACIC"),
              orsNum: genCode("ORS"),
              dvNum: genCode("DV"),
              uacsCode: `5-02-${getRandomInt(10, 99)}-${getRandomInt(100, 999)}`,
              respCode: `19-001-03-${getRandomInt(100, 999)}`,
            },
          },
          items: {
            create: [
              {
                description: "Generic Service",
                amount: gross,
                accountCode: "5-02-99-990",
              },
            ],
          },
          deductions: {
            create: [{ deductionType: "Tax (5%)", amount: tax.toFixed(2) }],
          },
        },
      });
      lddapCreated++;
    } catch (error) {
      console.error(`Failed to create LDDAP disbursement ${i}:`, error.message);
      lddapFailed++;
    }
  }

  console.log(
    `Created ${lddapCreated}/10 LDDAP disbursements (${lddapFailed} failed)`,
  );

  let checkCreated = 0;
  let checkFailed = 0;

  // --- CHECK Method (10 Items) ---
  console.log("Creating CHECK disbursements...");
  for (let i = 1; i <= 10; i++) {
    try {
      const randomFund = funds[getRandomInt(0, funds.length - 1)];
      const randomPayee = payees[getRandomInt(0, payees.length - 1)];
      const randomDate = getRandomDate(thisMonth, today);

      const gross = getRandomInt(5000, 20000);
      await prisma.disbursement.create({
        data: {
          payeeId: randomPayee.id,
          fundSourceId: randomFund.id,
          method: Method.CHECK,
          checkNum: genCode("CHK"),
          dateReceived: randomDate,
          grossAmount: gross,
          totalDeductions: 0,
          netAmount: gross,
          particulars: `Payment via Check - Batch ${i}`,
          status: Status.PAID,
          approvedAt: new Date(),
          references: {
            create: {
              acicNum: "N/A",
              orsNum: genCode("ORS"),
              dvNum: genCode("DV"),
              uacsCode: `5-02-${getRandomInt(10, 99)}-${getRandomInt(100, 999)}`,
              respCode: `19-001-03-${getRandomInt(100, 999)}`,
            },
          },
          items: {
            create: [
              {
                description: "Supply Purchase",
                amount: gross,
                accountCode: "5-02-03-010",
              },
            ],
          },
        },
      });
      checkCreated++;
    } catch (error) {
      console.error(`Failed to create CHECK disbursement ${i}:`, error.message);
      checkFailed++;
    }
  }

  console.log(
    `Created ${checkCreated}/10 CHECK disbursements (${checkFailed} failed)`,
  );

  //* --- Create Dummy Logs ---
  await prisma.logs.createMany({
    data: [
      {
        userId: systemUser.id,
        log: "System initialized and seeded by default user",
      },
      { userId: encoder.id, log: "Created disbursement DV-2024-01-001" },
      { userId: staff.id, log: "Approved disbursement DV-2024-01-005" },
      { userId: admin.id, log: "Updated Fund Source GF-101 balance" },
    ],
  });

  console.log("Logs created.");
  console.log("");
  console.log("Seeding completed successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   System User ID: ${systemUser.id}`);
  console.log(`   Total Users: 4`);
  console.log(`   Total Funds: ${funds.length}`);
  console.log(`   Total Ledgers: ${ledgersCreated}`);
  console.log(`   Total Payees: ${payees.length}`);
  console.log(`   Total Disbursements: ${lddapCreated + checkCreated}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
