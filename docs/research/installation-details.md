# Installation Research

## Docker Image
- Multi-stage build: Node 24.13 on Debian Trixie
- Runtime: lightweight Node image with unprivileged user (appuser UID:10001)
- Port: 3000

## Environment Variables
| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| AUTH_SESSION_SECRET | - | YES | Session encryption secret |
| ATTRACCESS_URL | http://localhost:3000 | YES | URL users access |
| ATTRACCESS_PUBLIC_INTERNET_URL | - | No | Public callback URL (SumUp etc.) |
| STORAGE_ROOT | /app/storage | No | Persistent data directory |
| PLUGIN_DIR | /app/storage/plugins | No | Plugin directory |
| MAX_FILE_SIZE_BYTES | 10485760 | No | Max upload size (10MB) |
| CACHE_MAX_AGE_DAYS | 7 | No | Image cache retention |
| LOG_LEVELS | error,warn,log | No | Comma-separated log levels |
| LICENSE_KEY | - | Yes | License key |
| SMTP_SERVICE | SMTP | No | SMTP or Outlook365 |
| SMTP_HOST | localhost | No | SMTP server host |
| SMTP_PORT | 1025 | No | SMTP port |
| SMTP_USER | - | No | SMTP username |
| SMTP_PASS | - | No | SMTP password |
| SMTP_FROM | - | No | Sender email |
| SMTP_SECURE | false | No | Use TLS for SMTP |
| SSL_GENERATE_SELF_SIGNED_CERTIFICATES | false | No | Auto-generate self-signed certs |
| SSL_KEY_FILE | - | No | Path to SSL private key |
| SSL_CERT_FILE | - | No | Path to SSL certificate |
| STATIC_DOCS_FILE_PATH | /app/docs | No | Docs directory path |
| STATIC_FRONTEND_FILE_PATH | /app/dist/apps/frontend | No | Frontend build path |
| RESTART_BY_EXIT | false | No | Auto-restart on crash |
| DISABLE_PLUGINS | false | No | Disable plugin system |
| SESSION_COOKIE_MAX_AGE | 604800000 | No | Session max age (7 days ms) |

## Storage Structure
```
/app/storage/
├── attraccess.sqlite    (Database)
├── cache/               (Image cache)
├── cdn/                 (CDN assets)
├── plugins/             (Plugins)
└── *.pem, *.key         (SSL certs if auto-generated)
```

## Static Serving
- /docs → docs folder
- /cdn → storage/cdn
- / → frontend build

## First-Time Setup
Available when no users exist. 4 steps:
1. App Settings (URL, license key)
2. SMTP Settings (email config)
3. Create Admin User (username, email, password)
4. Email Verification (check inbox)
