ARG NODE_VERSION=24.19.0
FROM node:${NODE_VERSION}-alpine

# Create unprivileged user for runtime
RUN addgroup -S appuser && adduser -S -G appuser -h /app appuser

WORKDIR /app

# Copy script only (no dependencies needed beyond Node 24+ which has fetch)
COPY update-hetzner.js /usr/local/bin/update-hetzner.js

RUN chown appuser:appuser /usr/local/bin/update-hetzner.js

ENV HETZNER_RECORD_NAME="@" \
    HETZNER_TTL="300" \
    HETZNER_INTERVAL_SECONDS="900"

USER appuser

CMD ["node", "/usr/local/bin/update-hetzner.js"]


