FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Build tools for tsc/webpack if needed
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Pin pnpm to lockfile version (prevents surprises)
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install dev deps but skip postinstall scripts (avoids @swc/core segfault)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build
COPY . .
RUN pnpm nx run-many --target=build --projects=api,frontend

# ---- runtime ----
FROM node:20-bullseye-slim AS runtime
WORKDIR /app

# Same pnpm version in runtime
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install only production deps (no dev deps like @swc/core)
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist/apps/api ./dist/apps/api
COPY --from=builder /app/dist/apps/frontend ./dist/apps/frontend
COPY --from=builder /app/docs ./docs

# If your API serves static assets from these paths, set envs (optional)
# ENV STATIC_FRONTEND_FILE_PATH=/app/dist/apps/frontend
# ENV STATIC_DOCS_FILE_PATH=/app/docs

EXPOSE 3000
CMD ["node", "dist/apps/api/main.js"]