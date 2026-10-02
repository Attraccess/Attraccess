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
| `LOG_DESTINATIONS` | `console` | Comma-separated registered API log drivers: initially `console`, `file`. Names are trimmed, lowercased and deduplicated. |
| `LOG_FILE_PATH` | – | Required non-blank path when selecting `file`; ignored otherwise. Relative paths resolve against the API process working directory; absolute paths are accepted. |
| `LICENSE_KEY` | – | Attraccess license key |
| `TZ` | – | Time zone, e.g. `Europe/Berlin` |
| `TRUST_PROXY` | – | Trusted reverse-proxy hops so auth rate limiting uses the real client IP. `1` = single proxy (nginx/Traefik/Caddy), `2` = CDN + proxy, or a comma-separated list of trusted proxy IPs/CIDRs (or `loopback`, `linklocal`, `uniquelocal`). Unset = trust no proxy. |

> [!NOTE]
> `TRUST_PROXY` is **off by default**. Behind a reverse proxy, every request otherwise appears to come from the proxy IP, so auth rate limiting throttles all users together instead of the real attacker. Set it to match your proxy chain (usually `1`). Trusting more hops than actually exist lets clients spoof their IP — see [Security](settings/security.md#reverse-proxies-and-the-real-client-ip). Takes effect after a restart.

## API application logs

```dotenv
LOG_LEVELS=error,warn,log
LOG_DESTINATIONS=console,file
LOG_FILE_PATH=./log/api.log
```

Without destination configuration, existing deployments keep console-only logging. Fresh local setups copy these active destination entries from `.env.example`: `pnpm serve` appends API logs to `./log/api.log` in that worktree as well as printing them. Existing `.env` files are never rewritten. Select `LOG_DESTINATIONS=file` for file-only output, or `console` for console-only output. An empty selection, unknown name or invalid selected-driver option stops startup with a configuration error.

All destinations share the existing Nest 11 `LOG_LEVELS` filter. Explicitly listed levels are enabled, as are levels at least as severe as the most severe listed level. For example, `log` enables `log,warn,error,fatal`, but `debug,error` enables only `debug,error,fatal`; a blank `LOG_LEVELS` disables application entries. `fatal` calls follow Nest's filter but `fatal` is not an accepted configuration name. The file driver creates missing parent directories and appends readable UTF-8 without ANSI codes, keeping earlier entries across restarts. Console retains Nest formatting and routing: errors go to stderr, other levels to stdout. Authentication lines remain compatible with fail2ban.

Configuration changes take effect after restarting the API. Buffered startup logs use the same routing. Graceful shutdown (SIGINT/SIGTERM) flushes pending writes and closes destinations; forced termination cannot guarantee a flush. A destination that fails during initialization or operation is disabled for the rest of the process, with one emergency stderr diagnostic. Healthy destinations continue; if all fail, the API continues without application log delivery. Correct the cause and restart to reopen the destination. Before routing can be configured, startup failures retain console diagnostics.

In containers, give the API write access to the file path and mount its directory if logs must survive container replacement. Rotation, retention, remote drivers, per-driver levels and live reconfiguration are not included. Only API application/framework logs are routed: persisted audit records, opt-in flow recordings, frontend, firmware, companion and dev-launcher output retain their own behavior. Generated `log/` files are gitignored. Developers can [register another transport](developer/logging.md).

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
| `VALKEY_URL` | – | Connection URL for a Valkey/Redis-compatible session store (e.g. `redis://valkey:6379`). When set, sessions are stored in Valkey with native TTL instead of SQLite — required for horizontal scaling. Falls back to SQLite when unset. Accepts any `ioredis`-compatible URL including `rediss://` (TLS), Redis Cluster, Sentinel, ElastiCache, and Upstash. |

> [!NOTE]
> The bundled Docker Compose variants (Balena, Coolify) include a `valkey/valkey:8-alpine` sidecar and set `VALKEY_URL` automatically. For external deployments, point `VALKEY_URL` at your own Valkey/Redis instance.

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
