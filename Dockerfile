# ── Build stage: compile native modules (better-sqlite3) ──
FROM node:18-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json* ./
# Build better-sqlite3 from source (instead of accepting whatever
# prebuilt blob `prebuild-install` would download). On ARM64 hosts the
# prebuild lookup sometimes resolves to an x64 musl binary, producing
# `Exec format error` at runtime. Building from source guarantees the
# native module matches the actual CPU + libc of this layer.
ENV npm_config_build_from_source=true
RUN npm ci --omit=dev

# ── Production stage ──
FROM node:18-alpine

# better-sqlite3 needs libstdc++ at runtime; tzdata gives the container
# real timezone data so TZ=Africa/Johannesburg actually resolves to SAST.
RUN apk add --no-cache libstdc++ tzdata git \
 && cp /usr/share/zoneinfo/Africa/Johannesburg /etc/localtime \
 && echo "Africa/Johannesburg" > /etc/timezone

# python/make/g++ are kept in the runtime image so the in-app updater
# (Admin → Settings → System Update) can run `npm install --production`
# after pulling a new tagged release without needing a separate build
# stage. They add ~80 MB to the image; remove if you never use in-app
# updates and only deploy via `docker compose build`.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY package.json ./
COPY package-lock.json* ./
COPY server/ ./server/
COPY client/ ./client/
COPY scripts/ ./scripts/

# .git is needed in the runtime image so the in-app updater
# (Admin → Settings → System Update) can run `git fetch` / `git checkout`
# against tagged releases. Without it, the updater reports "Project is
# not a git checkout — updates disabled.". Adds a few MB to the image.
COPY .git/ ./.git/

# Configure git so the in-app updater can perform fetch/checkout cleanly.
# `safe.directory` avoids "dubious ownership" rejections when /app is
# owned by root inside the container; the user/email are placeholders so
# any internal git operations have an identity.
RUN git config --global --add safe.directory /app \
 && git config --global user.email "container@inexpro.local" \
 && git config --global user.name  "Inexpro CRM Container"
# Per-user email signature images live here. The folder is gitignored
# (signatures may contain PII), so we just create an empty dir in the
# image. Mount your own at runtime via docker-compose if you have
# signature files, or upload them through the admin UI.
RUN mkdir -p /app/signatures

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

# Healthcheck: hit the SPA shell at `/` rather than an authed API endpoint.
# `/api/auth/me` returns 401 when unauthenticated, and busybox `wget`
# treats 4xx as a non-zero exit, so the container would thrash-loop as
# "unhealthy". `/` always returns 200 (the index.html SPA bootstrap)
# whenever the server is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null || exit 1

# CMD: ensure the persistent data dirs exist before opening the SQLite
# DB. The /crm-data bind mount on a fresh server is empty, masking the
# `RUN mkdir` performed during the image build, so we recreate the tree
# at runtime against the (now-mounted) volume. Then exec node so PID 1
# is the server process and signals propagate cleanly.
CMD ["sh", "-c", "mkdir -p \"$(dirname \"$DB_PATH\")\" \"$UPLOAD_PATH\" \"$REPORTS_PATH\" && exec node server/app.js"]
