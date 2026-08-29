FROM node:24-bookworm-slim AS build
WORKDIR /workspace
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm nx build wago-cc100-runtime

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --uid 10001 runtime && mkdir -p /var/lib/attraccess-wago
COPY --from=build /workspace/dist/apps/wago-cc100-runtime ./
COPY --from=build /workspace/apps/plugins/wago/cc100-runtime/manifest.json ./manifest.json
RUN chown -R runtime:runtime /app /var/lib/attraccess-wago
USER runtime
VOLUME ["/var/lib/attraccess-wago"]
CMD ["node", "main.js"]
