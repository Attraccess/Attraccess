ARG NODE_VERSION=24.15.0
ARG NODE_VERSION_NAME=trixie

FROM node:${NODE_VERSION}-${NODE_VERSION_NAME} AS builder

# System deps required for native Node modules and tooling
# - python3/py3-pip: node-gyp and Python-based tooling
# - build-base (make, g++, etc.): compile native deps when prebuilds are unavailable
# - libstdc++: runtime for some native modules (e.g., sharp)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    build-essential \
    libstdc++6 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Optional: ESP tooling often used by firmware-related scripts
# Create a virtual environment to avoid PEP 668 restrictions on Alpine
RUN python3 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN pip install --upgrade pip && \
    pip install platformio esptool

WORKDIR /app

# Copy package.json, lockfile, patches (required for pnpm patchedDependencies), and .npmrc first for better layer caching
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ patches/

# Install dependencies (Corepack resolves pnpm from root package.json packageManager)
RUN corepack enable && pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN pnpm nx run-many -t build --projects=api,frontend

# Strip stray pnpm config Nx copies into generated dist package.json files;
# pnpm 10 only respects pnpm.overrides / pnpm.onlyBuiltDependencies at the workspace root.
RUN node -e "for (const p of ['dist/apps/api/package.json','dist/apps/api-swagger/package.json']) { const fs = require('fs'); if (!fs.existsSync(p)) continue; const j = JSON.parse(fs.readFileSync(p, 'utf8')); delete j.pnpm; fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); }"

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
# (ESP32/S2/S3) and RISC-V (ESP32-C3/C6/H2) coredumps.
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir esp-coredump platformio && \
    mkdir -p /opt/platformio && \
    PLATFORMIO_HOME_DIR=/opt/platformio /opt/venv/bin/platformio pkg install --global --tool platformio/tool-xtensa-esp-elf-gdb && \
    PLATFORMIO_HOME_DIR=/opt/platformio /opt/venv/bin/platformio pkg install --global --tool platformio/tool-riscv32-esp-elf-gdb
ENV PLATFORMIO_HOME_DIR=/opt/platformio
ENV PATH="/opt/venv/bin:/opt/platformio/packages/tool-xtensa-esp-elf-gdb/bin:/opt/platformio/packages/tool-riscv32-esp-elf-gdb/bin:${PATH}"
ENV ESP_COREDUMP_CMD=/opt/venv/bin/esp-coredump
ENV ESP_COREDUMP_XTENSA_GDB=/opt/platformio/packages/tool-xtensa-esp-elf-gdb/bin/xtensa-esp32-elf-gdb
ENV ESP_COREDUMP_RISCV_GDB=/opt/platformio/packages/tool-riscv32-esp-elf-gdb/bin/riscv32-esp-elf-gdb

# Copy the pre-built application (these will be built in the CI pipeline)
COPY --from=builder /app/dist dist
COPY --from=builder /app/docs docs
COPY --from=builder /app/deploy/api /app/dist/apps/api

# Bundle sidecar configs (Prometheus rules, Grafana provisioning, dashboards)
# so they can be copied into shared volumes by a monitoring-init container.
COPY --from=builder /app/monitoring /app/share/monitoring

# Set environment variable to tell API about frontend location
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
