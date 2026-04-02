FROM node:24.13.0-alpine

# Install dnsmasq DNS server (no dependencies needed beyond Node 24+ which has fetch)
RUN apk add --no-cache dnsmasq

RUN addgroup -S appuser && adduser -S -G appuser -h /app appuser

WORKDIR /app

RUN mkdir -p /data /etc/dnsmasq.d \
    && echo 'conf-dir=/etc/dnsmasq.d/,*.conf' > /etc/dnsmasq.conf \
    && chown -R appuser:appuser /data /etc/dnsmasq.d

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY server.js /app/server.js
COPY public/index.html /app/public/index.html

RUN chown -R appuser:appuser /app

EXPOSE 53/udp
EXPOSE 53/tcp
EXPOSE 5380

ENTRYPOINT ["/entrypoint.sh"]
