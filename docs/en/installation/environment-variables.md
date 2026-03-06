# Environment Variables

All configuration options for Attraccess that can be set via environment variables.

## Required Settings

| Variable | Description |
|----------|-------------|
| `AUTH_SESSION_SECRET` | Secret key for encrypting session data. Use a random, long value. |
| `ATTRACCESS_URL` | The URL where users access Attraccess, e.g. `https://attraccess.your-domain.com` |

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `ATTRACCESS_URL` | `http://localhost:3000` | Main application URL |
| `ATTRACCESS_PUBLIC_INTERNET_URL` | – | Public URL for external callbacks (e.g. SumUp payments). Only needed if different from `ATTRACCESS_URL`. |
| `LOG_LEVELS` | `error,warn,log` | Comma-separated log levels: `error`, `warn`, `log`, `debug`, `verbose` |
| `LICENSE_KEY` | – | Attraccess license key |
| `TZ` | – | Time zone, e.g. `Europe/Berlin` |

## Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_ROOT` | `/app/storage` | Base directory for all persistent data |
| `MAX_FILE_SIZE_BYTES` | `10485760` | Maximum file size for uploads (default: 10 MB) |
| `CACHE_MAX_AGE_DAYS` | `7` | How long images stay in cache (days) |

## Email (SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_SERVICE` | `SMTP` | Email service: `SMTP` or `Outlook365` |
| `SMTP_HOST` | `localhost` | SMTP server hostname |
| `SMTP_PORT` | `1025` | SMTP port |
| `SMTP_SECURE` | `false` | Enable TLS encryption (`true`/`false`) |
| `SMTP_USER` | – | SMTP username |
| `SMTP_PASS` | – | SMTP password |
| `SMTP_FROM` | – | Sender email address |

> [!NOTE]
> When using `Outlook365`, host, port and secure are set automatically (`smtp.office365.com`, port `587`). You only need to provide username, password and sender address.

## SSL / TLS

| Variable | Default | Description |
|----------|---------|-------------|
| `SSL_GENERATE_SELF_SIGNED_CERTIFICATES` | `false` | Auto-generate self-signed certificates |
| `SSL_KEY_FILE` | – | Path to SSL private key file |
| `SSL_CERT_FILE` | – | Path to SSL certificate file |

> [!TIP]
> For most setups, we recommend a [reverse proxy](installation/ssl-setup.md) for SSL instead of the built-in SSL support.

## Session

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SESSION_SECRET` | – | **Required.** Secret key for session encryption |
| `SESSION_COOKIE_MAX_AGE` | `604800000` | Maximum session duration in milliseconds (default: 7 days) |

## Plugins

| Variable | Default | Description |
|----------|---------|-------------|
| `PLUGIN_DIR` | `/app/storage/plugins` | Directory for plugins |
| `DISABLE_PLUGINS` | `false` | Disable the plugin system |
| `RESTART_BY_EXIT` | `false` | Automatically restart on crash |

## Static Files

| Variable | Default | Description |
|----------|---------|-------------|
| `STATIC_FRONTEND_FILE_PATH` | `/app/dist/apps/frontend` | Path to frontend build |
| `STATIC_DOCS_FILE_PATH` | `/app/docs` | Path to documentation |

> [!NOTE]
> These variables do not normally need to be changed. They are only relevant if you run Attraccess without Docker.

## See Also

- [Docker Compose Installation](installation/docker-compose.md)
- [SSL Setup](installation/ssl-setup.md)
- [Security](settings/security.md)
