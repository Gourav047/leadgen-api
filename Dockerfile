# =============================================================================
# Stage 1: Build
# Installs all deps (including devDeps), generates Prisma client, compiles TS
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npx prisma generate
RUN npm run build

# =============================================================================
# Stage 2: Production runner
# Slim image with only production deps + compiled output
# =============================================================================
FROM node:20-alpine AS runner

# curl is required for the HEALTHCHECK command
RUN apk add --no-cache curl

WORKDIR /app

# Install production-only dependencies
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy compiled application from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma generated client engine (written by prisma generate in builder stage)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy schema + migrations (needed for prisma migrate deploy at startup)
COPY prisma ./prisma

# Create logs directory before dropping to non-root user
RUN mkdir -p /app/logs && chown node:node /app/logs

# Run as non-root — node:20-alpine ships with a built-in 'node' user (uid 1000)
USER node

EXPOSE 9000

# Health check uses the /health endpoint (Prisma SELECT 1 indicator from @nestjs/terminus)
# --start-period=60s gives migrations time to complete before checks fire
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:9000/health || exit 1

# Run migrations (idempotent) then start the compiled app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
