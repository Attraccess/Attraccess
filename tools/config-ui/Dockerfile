ARG NODE_VERSION=24.19.0
FROM node:${NODE_VERSION}-alpine

RUN apk add --no-cache dnsmasq procps

WORKDIR /app

RUN mkdir -p /data /etc/dnsmasq.d /etc/prometheus \
    && echo 'conf-dir=/etc/dnsmasq.d/,*.conf' > /etc/dnsmasq.conf

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY server.js http-helpers.js /app/
COPY modules/ /app/modules/
COPY public/ /app/public/

EXPOSE 53/udp
EXPOSE 53/tcp
EXPOSE 5380

ENTRYPOINT ["/entrypoint.sh"]
