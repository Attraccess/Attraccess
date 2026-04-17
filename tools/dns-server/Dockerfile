FROM node:24.15.0-alpine

# Install dnsmasq DNS server (no dependencies needed beyond Node 24+ which has fetch)
# Root is required: dnsmasq binds to privileged port 53
RUN apk add --no-cache dnsmasq

WORKDIR /app

RUN mkdir -p /data /etc/dnsmasq.d \
    && echo 'conf-dir=/etc/dnsmasq.d/,*.conf' > /etc/dnsmasq.conf

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY server.js /app/server.js
COPY public/index.html /app/public/index.html

EXPOSE 53/udp
EXPOSE 53/tcp
EXPOSE 5380

ENTRYPOINT ["/entrypoint.sh"]
