openssl s_client -showcerts -connect attraccess.apps.janjaap.de:443 < /dev/null 2>/dev/null | awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' > data/cert/websocket_org.pem
