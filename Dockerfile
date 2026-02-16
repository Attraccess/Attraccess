ARG NODE_VERSION=24.13.0
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

# Install dependencies
RUN corepack enable && corepack prepare && \
    pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN pnpm nx run-many -t build --projects=api,frontend


FROM node:${NODE_VERSION}-alpine

ARG APP_UID=10001
ARG APP_GID=10001

# Create unprivileged user for runtime with fixed UID/GID
RUN addgroup -g ${APP_GID} -S appuser && adduser -u ${APP_UID} -S -G appuser -h /app appuser

# Set working directory
WORKDIR /app

# Minimal runtime libs for native Node modules and su-exec for privilege drop
RUN apk add --no-cache libstdc++ su-exec

# Copy the pre-built application (these will be built in the CI pipeline)
COPY --from=builder /app/dist/apps/api dist/apps/api
COPY --from=builder /app/dist/apps/frontend dist/apps/frontend
COPY --from=builder /app/docs docs

# Set environment variable to tell API about frontend location
ENV STATIC_FRONTEND_FILE_PATH=/app/dist/apps/frontend

# Set environment variable to tell API about docs location
ENV STATIC_DOCS_FILE_PATH=/app/docs

# Set environment variable to tell API about plugins location
RUN mkdir -p /app/storage/plugins
ENV STORAGE_ROOT=/app/storage
ENV PLUGIN_DIR=/app/storage/plugins

# Install dependencies directly from the Nx-generated package.json
WORKDIR /app/dist/apps/api
RUN corepack enable && corepack prepare && \
    pnpm install # --frozen-lockfile (not enabled frozen lockfile since nx is fucking up the lockfile)

# Back to app root for consistent starting dir
WORKDIR /app

COPY package.json package.json
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose the API port
EXPOSE 3000

# Entrypoint runs as root to chown empty storage on first run, then drops to appuser
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/apps/api/main.js"]
