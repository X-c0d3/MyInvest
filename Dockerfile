# syntax=docker/dockerfile:1
# MyInvest production image: Next.js standalone server + SQLite on a mounted volume.
#   docker compose up -d --build        (see docker-compose.yml and README "Deploy บน VPS")

ARG NODE_VERSION=22

# ---- dependencies ----
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries for linux x64/arm64 (glibc and musl). Without
# --ignore-scripts npm sees its binding.gyp and tries to compile it with node-gyp, which needs
# python/make/g++ and is unnecessary.
RUN npm ci --ignore-scripts

# ---- build ----
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3004 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/app/data/myinvest.db

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The tracer only keeps the build machine's prebuilt binary; ship the whole package so the
# image runs on either CPU architecture.
COPY --from=build --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# The database lives on a volume; the app creates the file and runs migrations on first start.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3004/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
