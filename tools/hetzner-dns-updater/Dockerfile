FROM node:24.13.0-alpine

WORKDIR /app

# Copy script only (no dependencies needed beyond Node 20+ which has fetch)
COPY update-hetzner.js /usr/local/bin/update-hetzner.js

ENV HETZNER_RECORD_NAME="@" \
    HETZNER_TTL="300" \
    HETZNER_INTERVAL_SECONDS="900"

CMD ["node", "/usr/local/bin/update-hetzner.js"]


