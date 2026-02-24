#!/bin/sh
set -e

echo "Running Prisma migrations..."
# Use --schema to bypass prisma.config.ts which eagerly validates DATABASE_URL
# DATABASE_URL is still required as an environment variable at runtime
node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

echo "Running database seed..."
node_modules/.bin/prisma db seed

echo "Starting server..."
exec node src/index.js
