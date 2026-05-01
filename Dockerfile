# ── Build stage: compile native modules (better-sqlite3) ──
FROM node:18-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Production stage ──
FROM node:18-alpine

# better-sqlite3 needs libstdc++ at runtime; tzdata gives the container
# real timezone data so TZ=Africa/Johannesburg actually resolves to SAST.
RUN apk add --no-cache libstdc++ tzdata git \
 && cp /usr/share/zoneinfo/Africa/Johannesburg /etc/localtime \
 && echo "Africa/Johannesburg" > /etc/timezone

# python/make/g++ are needed only when the in-app updater runs
# `npm install --production` against a bind-mounted source tree, since
# better-sqlite3 may need to recompile native bindings.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY package.json ./
COPY server/ ./server/
COPY client/ ./client/
# Signature images used for per-user email signatures.
# The folder can also be bind-mounted at runtime to add/replace files
# without rebuilding the image (see docker-compose.yml).
COPY signatures/ ./signatures/

# Persistent data layout — mirrors the host's /crm-data tree so a single
# bind-mount (-v /crm-data:/crm-data) puts the DB, uploads and reports in
# the same locations both inside and outside the container.
RUN mkdir -p /crm-data/server/db /crm-data/client/uploads /crm-data/client/reports

# Environment defaults (override via .env or docker-compose)
ENV NODE_ENV=production \
    TZ=Africa/Johannesburg \
    PORT=3000 \
    DB_PATH=/crm-data/server/db/inexpro.db \
    UPLOAD_PATH=/crm-data/client/uploads \
    REPORTS_PATH=/crm-data/client/reports \
    DOCKER=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/auth/me || exit 1

CMD ["node", "server/app.js"]
