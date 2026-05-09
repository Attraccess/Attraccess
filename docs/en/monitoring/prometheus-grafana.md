# Prometheus & Grafana Setup

This guide covers how to set up Prometheus and Grafana to collect and visualize Attraccess metrics. Attraccess ships with pre-configured dashboards, datasource provisioning, and a Prometheus scrape config bundled inside the `attraccess` image at `/app/share/monitoring/` — so no repo checkout is required to deploy the stack.

## How the Bundled Monitoring Works

Configs ship inside the `attraccess` image:

```
/app/share/monitoring/
  prometheus/
    prometheus.yml      # Scrape config for the attraccess job
    alerts.yml          # Alerting rules
  grafana/
    provisioning/
      datasources/
        prometheus.yml  # Connects Grafana to Prometheus
      dashboards/
        dashboards.yml  # Dashboard provider config
    dashboards/
      attraccess-overview.json
      node-runtime.json
```

A short-lived `monitoring-init` helper service runs the same image, copies these files into named volumes on stack startup, and exits. Prometheus and Grafana mount those volumes read-only and depend on `monitoring-init` finishing successfully (`service_completed_successfully`). This lets the compose file deploy standalone — operators do not need to clone the repo or maintain a `./monitoring` directory next to their compose file.

## Coolify Deployment

Use [`coolify.docker-compose.yml`](https://github.com/Attraccess/Attraccess/blob/main/coolify.docker-compose.yml) from the repo root. Coolify auto-generates the FQDN routing, Grafana admin user/password, and session secrets via `SERVICE_FQDN_*`, `SERVICE_USER_*`, `SERVICE_PASSWORD_*`, and `SERVICE_BASE64_*` env conventions. After the stack is deployed:

1. Generate a metrics API key in **Attraccess > Settings > Metrics & Monitoring** ([setup guide](monitoring/setup.md))
2. Configure the bearer token in the bundled `prometheus.yml` (see [Setting the Bearer Token](#setting-the-bearer-token) below)
3. Open Grafana at the FQDN Coolify assigned and log in with the auto-generated `SERVICE_USER_GRAFANA` / `SERVICE_PASSWORD_GRAFANA` (visible in the Coolify service env tab)

Datasource and dashboards are provisioned automatically — no manual Grafana configuration required.

## Manual Docker Compose Setup

If you are running outside Coolify, add the following services to your `docker-compose.yml`:

```yaml
services:
  # ... your existing attraccess service ...

  monitoring-init:
    image: ghcr.io/attraccess/attraccess:latest
    restart: 'no'
    entrypoint: ['/bin/sh', '-c']
    command:
      - >
        set -e &&
        cp -rT /app/share/monitoring/prometheus /prometheus-config &&
        cp -rT /app/share/monitoring/grafana/provisioning /grafana-provisioning &&
        cp -rT /app/share/monitoring/grafana/dashboards /grafana-dashboards
    volumes:
      - prometheus-config:/prometheus-config
      - grafana-provisioning:/grafana-provisioning
      - grafana-dashboards:/grafana-dashboards

  prometheus:
    image: prom/prometheus:v3.11.3
    restart: unless-stopped
    expose:
      - '9090'
    volumes:
      - prometheus-config:/etc/prometheus:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
    depends_on:
      monitoring-init:
        condition: service_completed_successfully

  grafana:
    image: grafana/grafana:13.0.1
    restart: unless-stopped
    expose:
      - '3000'
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-attraccess}
    volumes:
      - grafana-provisioning:/etc/grafana/provisioning:ro
      - grafana-dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    depends_on:
      monitoring-init:
        condition: service_completed_successfully

volumes:
  prometheus-config:
  prometheus-data:
  grafana-data:
  grafana-provisioning:
  grafana-dashboards:
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username (only applied on first init — see Troubleshooting) |
| `GRAFANA_ADMIN_PASSWORD` | `attraccess` | Grafana admin password (only applied on first init — see Troubleshooting) |

> [!WARNING]
> Change the default Grafana password before deploying to production.

## Setting the Bearer Token

The bundled `prometheus.yml` ships with the bearer token commented out — Prometheus needs it to authenticate against Attraccess `/api/metrics`.

After your first deploy:

1. Generate a metrics API key in Attraccess (see [setup guide](monitoring/setup.md))
2. Edit `prometheus.yml` inside the `prometheus-config` volume to add the bearer token:

   ```bash
   docker compose exec prometheus sh -c 'apk add --no-cache vi 2>/dev/null; vi /etc/prometheus/prometheus.yml'
   ```

   Or replace the file from the host:

   ```bash
   docker run --rm -v <stack>_prometheus-config:/data -i busybox sh -c \
     'sed -i "s|# bearer_token: .*|bearer_token: \"<your-key>\"|; s|^    # bearer_token|    bearer_token|" /data/prometheus.yml'
   ```

3. Reload Prometheus:

   ```bash
   docker compose exec prometheus wget -qO- --post-data='' http://127.0.0.1:9090/-/reload
   ```

> [!NOTE]
> The `monitoring-init` service overwrites `prometheus.yml` on every stack start, so any manual bearer-token edit is wiped on redeploy. Re-apply it after each deploy until automated env-var templating lands.

### Bundled Scrape Config

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - '/etc/prometheus/alerts.yml'

scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['attraccess:3000']
    scrape_interval: 10s
    # bearer_token: '<your-metrics-api-key>'
```

| Setting | Default | Description |
|---------|---------|-------------|
| `scrape_interval` (job) | `10s` | Per-job scrape interval for the Attraccess job |
| `scrape_interval` (global) | `15s` | Default scrape interval for any other jobs |
| `evaluation_interval` | `15s` | How often Prometheus evaluates recording and alerting rules |

> [!TIP]
> A 10-second scrape interval provides good granularity for most dashboards. Increase it to 30s or 60s if you want to reduce resource usage.

## Grafana Provisioning

The bundled provisioning configures the Prometheus datasource and loads both dashboards on first start. The datasource (`provisioning/datasources/prometheus.yml`):

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    uid: attraccess-prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

The Grafana service uses `service_name: prometheus` for in-network resolution, so no extra config is needed.

## Accessing Grafana

1. Open Grafana in your browser (Coolify: assigned FQDN; manual setup: behind your reverse proxy or `localhost:3000`)
2. Log in with the configured admin credentials
3. Navigate to **Dashboards** > **Attraccess** folder
4. Open the **Attraccess Overview** or **Node Runtime** dashboard

> [!NOTE]
> Behind a reverse proxy, set `GF_SERVER_ROOT_URL` to the full external URL (e.g. `https://grafana.example.com`) — without scheme or with a port suffix, Grafana sets cookies on the wrong domain and login appears to succeed but bounces back. Coolify's `SERVICE_URL_GRAFANA` resolves to the correct value.

## Pre-Built Dashboards

### Attraccess Overview

The main dashboard includes panels for:

| Panel | Description |
|-------|-------------|
| **HTTP Request Rate** | Requests per second broken down by route |
| **HTTP Request Latency** | p50, p95, and p99 response times |
| **HTTP Error Rate** | 4xx and 5xx errors over time |
| **Authentication** | Successful and failed login attempts, SSO usage |
| **Users** | Total registered users and new registrations |
| **Resources** | Total resources and active usage sessions |
| **Resource Usage Duration** | p50 and p95 session durations |
| **Resource Usage Sessions** | Sessions started and ended over time |
| **Connected Devices** | Number of connected Attractap NFC readers |
| **NFC Tap Events** | Tap events over time |
| **Billing Transactions** | Transaction counts by status |
| **Emails Sent** | Email delivery counts |
| **System Overview** | Projects, groups, MQTT servers, overdue maintenance |
| **Maintenance Events** | Maintenance activity by type |

### Node Runtime

The runtime dashboard includes panels for:

| Panel | Description |
|-------|-------------|
| **CPU Usage** | User and system CPU time |
| **Memory Usage** | Heap used, heap total, RSS, external memory |
| **Event Loop Lag** | Current lag and p99 percentile |
| **Active Handles & Requests** | Open handles and pending requests |

## Customising the Bundled Configs

Because the configs live inside the `attraccess` image and are copied into named volumes on every stack start, edits made directly to the volumes (other than the bearer token) are wiped on redeploy. To customise:

- **Scrape config / alert rules**: edit `monitoring/prometheus/*.yml` in your fork or PR and rebuild the image.
- **Dashboards / datasources**: edit `monitoring/grafana/**` in your fork or PR and rebuild.
- **Per-deploy overrides**: extend the compose with a `docker-compose.override.yml` that mounts your own files on top of the named volume mountpoint.

## Exposing Prometheus Externally (Optional)

By default, Prometheus is only exposed internally (no `ports` mapping). If you need direct access for debugging:

```yaml
  prometheus:
    # ...
    ports:
      - '9090:9090'
```

> [!WARNING]
> Do not expose Prometheus to the public internet without authentication. Use a reverse proxy with access control if external access is required.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Prometheus shows target as "DOWN" with `401` | Bearer token missing or wrong — generate a new key in Attraccess and re-apply to `prometheus.yml` in the `prometheus-config` volume, then reload Prometheus |
| Prometheus shows target as "DOWN" with no auth error | Verify the `attraccess` service is reachable from the Prometheus container (network, hostname `attraccess:3000`) |
| No data in Grafana dashboards | Confirm Prometheus is running and scraping. Check the targets page at `http://prometheus:9090/targets` |
| Grafana login bounces back to login page | `GF_SERVER_ROOT_URL` is wrong — must be the full external URL with scheme (`https://...`), no port suffix when behind a reverse proxy |
| Grafana login fails (wrong password) | `GF_SECURITY_ADMIN_PASSWORD` is only applied on first init. After the `grafana-data` volume exists, change the password via `grafana-cli admin reset-admin-password` inside the container or wipe the volume to re-init |
| Dashboards not appearing | Confirm `monitoring-init` exited 0 (`docker compose ps -a monitoring-init`). If not, inspect its logs and rerun the stack |
| Stale metrics after restart | Gauge metrics (like total users) are re-populated from the database on startup. Counter metrics reset to zero on restart -- this is normal Prometheus behaviour |

## See Also

- [Setup Guide](monitoring/setup.md) -- Enable the metrics endpoint
- [Metrics Reference](monitoring/metrics-reference.md) -- Complete list of all metrics
- [Overview](monitoring/overview.md) -- Monitoring feature overview
- [Environment Variables](installation/environment-variables.md) -- All configuration options
