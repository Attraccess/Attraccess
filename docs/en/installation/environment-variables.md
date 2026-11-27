# Environment Variables

<!-- llms-description: Reference of all environment variables that configure Attraccess: required settings, application, logging, database, backup, storage and TLS. -->

All configuration options for Attraccess that can be set via environment variables.

## Required Settings

| Variable              | Description                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SESSION_SECRET` | Secret key for encrypting session data. It also protects the stored reader-pairing keys, so back it up together with the database. Use a random, long value. |
| `ATTRACCESS_URL`      | The URL where users access Attraccess, e.g. `https://attraccess.your-domain.com`                                                                             |

## Application

| Variable                         | Default                  | Description                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ATTRACCESS_URL`                 | –                        | Main application URL. It is an [approved website](settings/security.md#approved-websites).                                                                                                                                                                                             |
| `ATTRACCESS_PUBLIC_INTERNET_URL` | –                        | Public address, if it differs from `ATTRACCESS_URL`. It is an [approved website](settings/security.md#approved-websites). Payment callbacks (SumUp) use **Public Internet URL** under Settings → Application Settings instead.                                                         |
| `ATTRACCESS_FRONTEND_URL`        | –                        | Address of a separately served frontend. It is an [approved website](settings/security.md#approved-websites) and is used for SSO logout returns.                                                                                                                                       |
| `ATTRACCESS_TRUSTED_ORIGINS`     | –                        | Comma-separated list of additional [approved websites](settings/security.md#approved-websites), as exact origins such as `https://portal.example.com`. No wildcards, no paths. Invalid entries are logged and skipped.                                                                 |
| `LOG_LEVELS`                     | `error,warn,log`         | Comma-separated log levels: `error`, `warn`, `log`, `debug`, `verbose`                                                                                                                                                                                                                 |
| `LOG_DESTINATIONS`               | `console`                | Comma-separated registered API log drivers: initially `console`, `file`. Names are trimmed, lowercased and deduplicated.                                                                                                                                                               |
| `LOG_FILE_PATH`                  | `<STORAGE_ROOT>/api.log` | Optional override when selecting `file`; defaults to `api.log` at the storage root (`./storage` when `STORAGE_ROOT` is unset). Explicit overrides must be non-blank; ignored otherwise. Relative paths resolve against the API process working directory; absolute paths are accepted. |
| `TZ`                             | –                        | Time zone, e.g. `Europe/Berlin`                                                                                                                                                                                                                                                        |
| `TRUST_PROXY`                    | –                        | Trusted reverse-proxy hops so auth rate limiting uses the real client IP. `1` = single proxy (nginx/Traefik/Caddy), `2` = CDN + proxy, or a comma-separated list of trusted proxy IPs/CIDRs (or `loopback`, `linklocal`, `uniquelocal`). Unset = trust no proxy.                       |

> [!NOTE]
> `TRUST_PROXY` is **off by default**. Behind a reverse proxy, every request otherwise appears to come from the proxy IP, so auth rate limiting throttles all users together instead of the real attacker. Set it to match your proxy chain (usually `1`). Trusting more hops than actually exist lets clients spoof their IP — see [Security](settings/security.md#reverse-proxies-and-the-real-client-ip). Takes effect after a restart.
>
> It also matters for [reader pairing](attractap/pairing.md): the limits on pairing requests per address use the same client IP. Without `TRUST_PROXY`, all readers behind the proxy share one limit.

## API application logs

```dotenv
LOG_LEVELS=error,warn,log
LOG_DESTINATIONS=console,file
# Optional override: LOG_FILE_PATH=./custom/api.log
```

Without destination configuration, existing deployments keep console-only logging. Fresh local setups copy these active destination entries from `.env.example`: `pnpm serve` appends API logs to `api.log` at the storage root in that worktree as well as printing them. Existing `.env` files are never rewritten. Select `LOG_DESTINATIONS=file` for file-only output, or `console` for console-only output. An empty selection, unknown name or invalid selected-driver option stops startup with a configuration error.

All destinations share the existing Nest 11 `LOG_LEVELS` filter. Explicitly listed levels are enabled, as are levels at least as severe as the most severe listed level. For example, `log` enables `log,warn,error,fatal`, but `debug,error` enables only `debug,error,fatal`; a blank `LOG_LEVELS` disables application entries. `fatal` calls follow Nest's filter but `fatal` is not an accepted configuration name. The file driver creates missing parent directories and appends readable UTF-8 without ANSI codes, keeping earlier entries across restarts. Console retains Nest formatting and routing: errors go to stderr, other levels to stdout. Authentication lines remain compatible with fail2ban.

Configuration changes take effect after restarting the API. Buffered startup logs use the same routing. Graceful shutdown (SIGINT/SIGTERM) flushes pending writes and closes destinations; forced termination cannot guarantee a flush. A destination that fails during initialization or operation is disabled for the rest of the process, with one emergency stderr diagnostic. Healthy destinations continue; if all fail, the API continues without application log delivery. Correct the cause and restart to reopen the destination. Before routing can be configured, startup failures retain console diagnostics.

In containers, give the API write access to the file path and mount its directory if logs must survive container replacement. Rotation, retention, remote drivers, per-driver levels and live reconfiguration are not included. Only API application/framework logs are routed: persisted audit records, opt-in flow recordings, frontend, firmware, companion and dev-launcher output retain their own behavior. Generated `storage/` and `log/` files are gitignored. Developers can [register another transport](developer/logging.md).

## Database

Attraccess stores all data in PostgreSQL. There is no other runtime database: SQLite is only read once when an existing 1.x installation is moved, see [Updating](installation/updating.md#moving-from-sqlite-to-postgresql).

| Variable            | Default    | Description                                                                                                                                                                                                                     |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | –          | **Required.** Connection URL of the PostgreSQL database, e.g. `postgres://user:password@postgres:5432/attraccess`. Percent-encode special characters in the password.                                                           |
| `DATABASE_SSL`      | `off`      | TLS to PostgreSQL: `off`, `require`, `verify-ca` or `verify-full`. `true` and `1` mean `require`; `false` and `0` mean `off`.                                                                                                   |
| `DATABASE_POOL_MAX` | `10`       | Maximum connections in the pool of one API process, an integer from 1 to 500. Keep it below the `max_connections` of the server divided by the number of API instances.                                                         |
| `DATABASE_SCHEMA`   | `public`   | PostgreSQL schema that holds the tables and the migrations table. A plain SQL identifier. A schema other than `public` is created on start when it is missing (the database user needs the `CREATE` privilege on the database). |
| `DATABASE_TYPE`     | `postgres` | Database engine. Only `postgres` is supported. `sqlite` stops the start with a message that links to the [upgrade guide](installation/updating.md); any other value also stops the start.                                       |

A missing or invalid setting stops the start with a clear message that never contains the password. The image does not include PostgreSQL: run it as its own service (all shipped Compose files already contain one, pinned to `postgres:18.6-alpine`). See [Backup & Restore](installation/backup-restore.md) for backing it up.

TLS is configured with `DATABASE_SSL` only. TLS parameters in `DATABASE_URL` (`ssl`, `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `sslpassword`, `sslcompat`) are refused at start, because they would silently override `DATABASE_SSL`. If the server certificate is signed by a private CA, use `verify-ca` or `verify-full` and point `NODE_EXTRA_CA_CERTS` at the CA file (PEM), e.g. `NODE_EXTRA_CA_CERTS=/certs/db-ca.pem` with the file mounted into the container. The session parameters `options` and `application_name` are refused as well: the API sets its own time zone, lock timeout, search path (see `DATABASE_SCHEMA`) and application name.

### PostgreSQL on balena

The balena stack (`docker-compose.balena.yml`) starts a `postgres` service with the user and database `attraccess`. balena cannot build values from other variables, so the stack reads the database settings from `.env.docker-compose`, which ships with the placeholder password `change-me`. **Replace it before the first start** (or before the upgrade that adds PostgreSQL): the `postgres` image fixes the password when it creates the `postgres-data` volume, and changing the variable later has no effect on an existing volume.

Set **both** as balena device variables, with the same password (they override `.env.docker-compose`):

| Variable            | Value                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | A random password, letters and digits only (e.g. `openssl rand -hex 24`).                                |
| `DATABASE_URL`      | `postgres://attraccess:<the same password>@postgres:5432/attraccess`, used by Attraccess and the backup. |

To change the password later:

1. Open a shell in the `postgres` container (balenaCloud dashboard terminal, or `balena ssh <device-uuid> postgres`) and set the new password:

   ```bash
   psql -U attraccess -d attraccess -c "ALTER USER attraccess WITH PASSWORD '<new password>'"
   ```

2. Set `POSTGRES_PASSWORD` and `DATABASE_URL` to the new password. balena restarts the services with the new values.

See [Adding a Database Backend](developer/adding-a-database-backend.md) for the engine seam.

### Backup sidecar (balena)

The balena stack contains a `backup` service that backs up the database and the volumes with restic. It is configured with the variables below, see [Backup & Restore](installation/backup-restore.md#balena-restic-sidecar).

| Variable                                                         | Default             | Description                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_REPOSITORY`                                              | –                   | restic repository, e.g. `s3:s3.amazonaws.com/bucket/attraccess`. Without it no backup runs. Set it as a device variable, not a fleet variable.                                    |
| `BACKUP_PASSWORD`                                                | –                   | Encrypts the repository. Required; without it the backups cannot be read.                                                                                                         |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_*`, …          | –                   | Credentials of the backup target, passed to restic unchanged.                                                                                                                     |
| `BACKUP_SCHEDULE`                                                | `0 3 * * *`         | Cron expression (5 fields); by default every night at 03:00.                                                                                                                      |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY` | `7`, `4`, `6`       | How many daily, weekly and monthly snapshots are kept.                                                                                                                            |
| `BACKUP_HOST`                                                    | `attraccess`        | Name of this installation in the repository. Use one repository per installation; only when devices share one, give each its own `BACKUP_HOST`.                                   |
| `BACKUP_DATABASE_URL`                                            | `DATABASE_URL`      | Database to dump and restore, when it differs from `DATABASE_URL` (other credentials, or libpq TLS parameters such as `?sslmode=require`, which `DATABASE_URL` must not contain). |
| `BACKUP_PG_WAIT_SECONDS`                                         | `120`               | How long a run waits for PostgreSQL before it fails.                                                                                                                              |
| `BACKUP_FORCE`                                                   | –                   | `true` makes every restore replace a non-empty database, like `restore --force`.                                                                                                  |
| `BACKUP_STATE_DIR`                                               | `/var/lib/backup`   | Working directory of the sidecar (the `backup-state` volume): the dump during a run, the restic cache, the lock and the last-success metric.                                      |
| `BACKUP_DATA_DIR`                                                | `/external-storage` | Directory below which the volumes to back up are mounted.                                                                                                                         |

## Storage

| Variable              | Default        | Description                                    |
| --------------------- | -------------- | ---------------------------------------------- |
| `STORAGE_ROOT`        | `/app/storage` | Base directory for all persistent data         |
| `MAX_FILE_SIZE_BYTES` | `10485760`     | Maximum file size for uploads (default: 10 MB) |
| `CACHE_MAX_AGE_DAYS`  | `7`            | How long images stay in cache (days)           |

## License key and email

The license key and the email (SMTP) server are not environment variables. Enter them in the [setup wizard](setup/first-time-setup.md) or under **Settings**; see [Email / SMTP Configuration](setup/smtp-email.md).

## SSL / TLS

| Variable                                | Default | Description                            |
| --------------------------------------- | ------- | -------------------------------------- |
| `SSL_GENERATE_SELF_SIGNED_CERTIFICATES` | `false` | Auto-generate self-signed certificates |
| `SSL_KEY_FILE`                          | –       | Path to SSL private key file           |
| `SSL_CERT_FILE`                         | –       | Path to SSL certificate file           |

> [!TIP]
> For most setups, we recommend a [reverse proxy](installation/ssl-setup.md) for SSL instead of the built-in SSL support.

## Session

| Variable                   | Default             | Description                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SESSION_SECRET`      | –                   | **Required.** Secret key for session encryption                                                                                                                                                                                                                                                                                                                                   |
| `SESSION_COOKIE_MAX_AGE`   | `604800000`         | Maximum session duration in milliseconds (default: 7 days)                                                                                                                                                                                                                                                                                                                        |
| `VALKEY_URL`               | –                   | Connection URL for a Valkey/Redis-compatible session store (e.g. `redis://valkey:6379`). When set, sessions are stored in Valkey with native TTL instead of PostgreSQL — required for horizontal scaling. Falls back to PostgreSQL when unset. Accepts any `ioredis`-compatible URL including `rediss://` (TLS), Redis Cluster, Sentinel, ElastiCache, and Upstash.               |
| `ATTRACCESS_INSTANCE_NAME` | `<hostname>:<PORT>` | Name of this API instance in the Valkey locks and heartbeats of machine starts and stops. Only used with `VALKEY_URL`. Must be unique among instances running at the same time and stay the same across restarts of the same instance; must not contain `\|`. See [Active Sessions on Shared Machines](flows/payloads-variables-templates.md#active-sessions-on-shared-machines). |

> [!NOTE]
> The bundled Docker Compose variants (Balena, Coolify) include a `valkey/valkey:9-alpine` sidecar and set `VALKEY_URL` automatically. For external deployments, point `VALKEY_URL` at your own Valkey/Redis instance.

> [!NOTE]
> When `VALKEY_URL` is set, the API still starts when Valkey cannot be reached (for example while the Valkey container is still starting). It logs a warning, and a `Valkey connection error` line for each reconnect attempt, until Valkey is reachable. Sessions are not moved to PostgreSQL: until Valkey is back, sign-in, requests from signed-in users and API token requests are answered with `503 Service Unavailable`, while public pages keep working. Once Valkey is reachable again, signing in works again, and authorization cache invalidation and the locking of machine starts and stops across API instances resume on their own, without restarting the API.

## Plugins

| Variable                    | Default                | Description                                |
| --------------------------- | ---------------------- | ------------------------------------------ |
| `PLUGIN_DIR`                | `/app/storage/plugins` | Directory for plugins                      |
| `DISABLE_PLUGINS`           | `false`                | Disable the plugin system                  |
| `RESTART_BY_EXIT`           | `false`                | Automatically restart on crash             |
| `ATTRACCESS_PLUGIN_CHANNEL` | `latest`               | Plugin release channel: `latest` or `next` |

`ATTRACCESS_PLUGIN_CHANNEL` is the npm dist-tag the marketplace and plugin installs use by default: `latest` (released plugin versions) or `next` (nightly builds). Official release images use `latest`; the nightly images (`nightly-<sha>`, `nightly-latest`) set `next`, so a nightly host installs the nightly plugin builds and offers newer ones. The channel does not turn [automatic updates](plugins/installing-plugins.md#automatic-updates) on. Set the variable to override the image default; any other value stops the API at startup with a configuration error. See [Installing Plugins](plugins/installing-plugins.md#release-channels).

## Static Files

| Variable                    | Default                   | Description            |
| --------------------------- | ------------------------- | ---------------------- |
| `STATIC_FRONTEND_FILE_PATH` | `/app/dist/apps/frontend` | Path to frontend build |
| `STATIC_DOCS_FILE_PATH`     | `/app/docs`               | Path to documentation  |

> [!NOTE]
> These variables do not normally need to be changed. They are only relevant if you run Attraccess without Docker.

## See Also

- [Docker Compose Installation](installation/docker-compose.md)
- [SSL Setup](installation/ssl-setup.md)
- [Security](settings/security.md)
