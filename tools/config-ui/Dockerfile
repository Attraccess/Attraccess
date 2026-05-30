FROM node:24.15.0-alpine

WORKDIR /app

RUN mkdir -p /data /etc/prometheus

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY server.js /app/server.js
COPY modules/ /app/modules/
COPY public/index.html /app/public/index.html

EXPOSE 5380

ENTRYPOINT ["/entrypoint.sh"]
