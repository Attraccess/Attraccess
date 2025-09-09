# Multi-stage Dockerfile for Nx monorepo
# This Dockerfile is intended to be built using the build.sh script 
# which will read Node version from .nvmrc

# Define ARG before FROM so it can be used in FROM
ARG NODE_VERSION=20.10.0

# Single-stage Dockerfile that only copies pre-built artifacts
FROM node:${NODE_VERSION}-alpine

# Set working directory
WORKDIR /app

# Copy the pre-built application (these will be built in the CI pipeline)
COPY ./dist/apps/api ./dist/apps/api
COPY ./dist/apps/frontend ./dist/apps/frontend
COPY ./docs ./docs

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml

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

# Expose the API port
EXPOSE 3000

# Start the API using the launch script
CMD ["node", "dist/apps/api/main.js"]
