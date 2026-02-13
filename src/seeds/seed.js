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
    where: { email: "admin@ecash.com" },
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
      email: "admin@ecash.com",
      password: passwordHash,
      role: Role.ADMIN,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@ecash.com" },
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
      email: "staff@ecash.com",
      password: passwordHash,
      role: Role.STAFF,
    },
  });

  const encoder = await prisma.user.upsert({
    where: { email: "user@ecash.com" },
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
      email: "user@ecash.com",
      password: passwordHash,
      role: Role.USER,
    },
  });

  console.log("Users created including default System user.");

  console.log("Logs created.");
  console.log("");
  console.log("Seeding completed successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   System User ID: ${systemUser.id}`);
  console.log(`   Total Users: 4`);
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
