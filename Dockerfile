ARG NODE_VERSION=24.19.0
ARG NODE_VERSION_NAME=trixie

FROM node:${NODE_VERSION}-${NODE_VERSION_NAME} AS builder

# System deps required for native Node modules and tooling
# - python3/py3-pip: node-gyp and Python-based tooling
# - python3-setuptools: provides the distutils shim on Python 3.12+; sqlite3's
#   pinned node-gyp 8 imports distutils when compiling from source (the
#   fallback when the prebuild download fails)
# - build-base (make, g++, etc.): compile native deps when prebuilds are unavailable
# - libstdc++: runtime for some native modules (e.g., sharp)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    python3-setuptools \
    build-essential \
    libstdc++6 \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json, lockfile, patches (required for pnpm patchedDependencies), and .npmrc first for better layer caching
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ patches/

# Install dependencies (Corepack resolves pnpm from root package.json packageManager)
RUN corepack enable && pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application. The Attractap firmware is NOT built here (no ESP-IDF
# in this image — build_firmwares.py skips itself); CI pre-builds it into
# apps/attractap/firmware/firmware_output/ before invoking docker build, and
# the api build bundles it into its assets.
RUN pnpm nx run-many -t build --projects=api,frontend

# Fail loudly if the image would ship without any firmware — an empty manifest
# breaks OTA updates and the /api/attractap/firmwares endpoint (ATT-715).
RUN node -e "const f = require('/app/dist/apps/api/assets/attractap-firmwares/firmwares.json'); if (!f.firmwares.length) { console.error('No Attractap firmwares bundled. Build them first: cd apps/attractap/firmware && python3 build_firmwares.py (requires ESP-IDF v5.5)'); process.exit(1); }"

# Strip stray pnpm config Nx copies into generated dist package.json files;
# pnpm 10 only respects pnpm.overrides / pnpm.onlyBuiltDependencies at the workspace root.
RUN node -e "for (const p of ['dist/apps/api/package.json','dist/apps/api-swagger/package.json']) { const fs = require('fs'); if (!fs.existsSync(p)) continue; const j = JSON.parse(fs.readFileSync(p, 'utf8')); delete j.pnpm; fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); }"

# pnpm 10 errors on unused patches during deploy; @swc-node/register and
# ts-api-utils are dev-only tools absent from the API's production dep tree.
# Strip them from both pnpm-lock.yaml (patchedDependencies block) and from the
# root package.json so pnpm deploy sees no stale patch declarations.
RUN node -e "const fs=require('fs'); let l=fs.readFileSync('pnpm-lock.yaml','utf8'); const pivot='\nimporters:'; const [hdr,rest]=l.split(pivot); const cleaned=hdr.replace(/\n  '@swc-node\/register@[^']+':(?:\n    [^\n]+)*/g,'').replace(/\n  ts-api-utils@[^\n:]+:(?:\n    [^\n]+)*/g,''); fs.writeFileSync('pnpm-lock.yaml',cleaned+pivot+rest);" && \
    node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); const d=p.pnpm.patchedDependencies; for (const k of Object.keys(d)) if (k.startsWith('@swc-node/register@') || k.startsWith('ts-api-utils@')) delete d[k]; fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"

# pnpm 10's new deploy requires a workspace shared lockfile; --ignore-workspace
# strips that, so use --legacy for the self-contained dist/apps/api package.
RUN pnpm --ignore-workspace --filter ./dist/apps/api deploy --legacy --prod /app/deploy/api
RUN cd /app/deploy/api && npm rebuild bcrypt sqlite3


FROM node:${NODE_VERSION}-${NODE_VERSION_NAME}

ARG APP_UID=10001
ARG APP_GID=10001

# Create unprivileged user for runtime with fixed UID/GID
RUN groupadd -g ${APP_GID} appuser && useradd -u ${APP_UID} -g ${APP_GID} -m -d /app -s /usr/sbin/nologin appuser

# Set working directory
WORKDIR /app

# Minimal runtime libs for native Node modules and privilege drop.
# python3 + esp-coredump are required for server-side coredump symbolication.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    gosu \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install esp-coredump plus the ESP GDB binaries it shells out to for Xtensa
# (ESP32/S2/S3) and RISC-V (ESP32-C3/C6/H2) coredumps. The GDB tarballs come
# straight from Espressif's binutils-gdb releases (PlatformIO, which used to
# fetch them, is no longer part of the firmware toolchain).
ARG ESP_GDB_VERSION=16.2_20250324
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir esp-coredump && \
    mkdir -p /opt/esp-gdb && cd /opt/esp-gdb && \
    arch="$(uname -m)"; case "$arch" in aarch64|arm64) gdb_arch=aarch64-linux-gnu ;; *) gdb_arch=x86_64-linux-gnu ;; esac && \
    curl -fsSL -o xtensa-gdb.tar.gz "https://github.com/espressif/binutils-gdb/releases/download/esp-gdb-v${ESP_GDB_VERSION}/xtensa-esp-elf-gdb-${ESP_GDB_VERSION}-${gdb_arch}.tar.gz" && \
    curl -fsSL -o riscv-gdb.tar.gz "https://github.com/espressif/binutils-gdb/releases/download/esp-gdb-v${ESP_GDB_VERSION}/riscv32-esp-elf-gdb-${ESP_GDB_VERSION}-${gdb_arch}.tar.gz" && \
    tar -xzf xtensa-gdb.tar.gz && tar -xzf riscv-gdb.tar.gz && \
    rm -f xtensa-gdb.tar.gz riscv-gdb.tar.gz
ENV PATH="/opt/venv/bin:/opt/esp-gdb/xtensa-esp-elf-gdb/bin:/opt/esp-gdb/riscv32-esp-elf-gdb/bin:${PATH}"
ENV ESP_COREDUMP_CMD=/opt/venv/bin/esp-coredump
ENV ESP_COREDUMP_XTENSA_GDB=/opt/esp-gdb/xtensa-esp-elf-gdb/bin/xtensa-esp32-elf-gdb
ENV ESP_COREDUMP_RISCV_GDB=/opt/esp-gdb/riscv32-esp-elf-gdb/bin/riscv32-esp-elf-gdb

# Copy the pre-built application (these will be built in the CI pipeline)
COPY --from=builder /app/dist dist
COPY --from=builder /app/docs docs
COPY --from=builder /app/deploy/api /app/dist/apps/api

# Bundle sidecar configs (Prometheus rules, Grafana provisioning, dashboards)
# so they can be copied into shared volumes by a monitoring-init container.
COPY --from=builder /app/monitoring /app/share/monitoring

# Set environment variable to tell API about frontend location
ENV NODE_ENV=production
ENV STATIC_FRONTEND_FILE_PATH=/app/dist/apps/frontend

# Set environment variable to tell API about docs location
ENV STATIC_DOCS_FILE_PATH=/app/docs

# Set environment variable to tell API about plugins location
RUN mkdir -p /app/storage/plugins
ENV STORAGE_ROOT=/app/storage
ENV PLUGIN_DIR=/app/storage/plugins

# Back to app root for consistent starting dir
WORKDIR /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose the API port
EXPOSE 3000

# Entrypoint runs as root to chown empty storage on first run, then drops to appuser
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/apps/api/main.js"]
