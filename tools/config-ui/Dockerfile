FROM node:24.19.0-alpine

RUN apk add --no-cache dnsmasq procps

WORKDIR /app

RUN mkdir -p /data /etc/dnsmasq.d /etc/prometheus \
    && echo 'conf-dir=/etc/dnsmasq.d/,*.conf' > /etc/dnsmasq.conf

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY server.js /app/server.js
COPY modules/ /app/modules/
COPY public/index.html /app/public/index.html

EXPOSE 53/udp
EXPOSE 53/tcp
EXPOSE 5380

ENTRYPOINT ["/entrypoint.sh"]
