FROM alpine:3.20

RUN apk add --no-cache curl jq iproute2

WORKDIR /app
COPY update-hetzner.sh /usr/local/bin/update-hetzner
RUN chmod +x /usr/local/bin/update-hetzner

ENV HETZNER_RECORD_NAME="@" \
    HETZNER_TTL="300" \
    HETZNER_INTERVAL_SECONDS="900"

CMD ["/usr/local/bin/update-hetzner"]


