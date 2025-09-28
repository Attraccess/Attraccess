ARG NODE_VERSION=22.17.1

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Copy package.json and pnpm-lock.yaml first for better layer caching
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies
RUN corepack enable && corepack prepare && \
    pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN pnpm nx run-many -t build --projects=api,frontend


FROM node:${NODE_VERSION}-alpine

# Set working directory
WORKDIR /app

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

# Expose the API port
EXPOSE 3000

# Start the API using the launch script
CMD ["node", "dist/apps/api/main.js"]
