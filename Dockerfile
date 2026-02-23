# ─────────────────────────────────────────────
#  Stage 1: Builder
#  - Install all deps (including devDeps for prisma CLI)
#  - Generate Prisma client (prisma.config.ts is auto-loaded by Prisma 7.x
#    even with --schema, so we pass a dummy DATABASE_URL build arg to satisfy
#    the eager env() call — generate never connects to a real database)
# ─────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./
COPY prisma/ ./prisma/

# Install all deps (devDeps needed for prisma CLI)
RUN npm install

# Copy full source
COPY . .

# Prisma 7.x auto-loads prisma.config.ts and calls env("DATABASE_URL") eagerly.
# We provide a dummy URL via ARG so the config validator is satisfied.
# generate never opens a real DB connection, so the value does not matter.
ARG DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
RUN node_modules/.bin/prisma generate --schema=prisma/schema.prisma

# ─────────────────────────────────────────────
#  Stage 2: Production
# ─────────────────────────────────────────────
FROM node:24-bookworm-slim AS production

WORKDIR /app

# Copy package manifest and install production deps only
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source (includes src/generated/prisma — the generated client)
# schema.prisma sets: output = "../src/generated/prisma"
COPY --from=builder /app/src ./src

# Copy prisma schema + migrations (needed for migrate deploy at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# Copy entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=5001

EXPOSE 5001

ENTRYPOINT ["./docker-entrypoint.sh"]
