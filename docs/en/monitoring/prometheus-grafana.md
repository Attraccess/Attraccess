# Prometheus & Grafana Setup

This guide covers how to set up Prometheus and Grafana to collect and visualize Attraccess metrics. Attraccess ships with pre-configured dashboards, datasource provisioning, and a Prometheus scrape config bundled inside the `attraccess` image at `/app/share/monitoring/` — so no repo checkout is required to deploy the stack.

## How the Bundled Monitoring Works

Configs ship inside the `attraccess` image:

```
/app/share/monitoring/
  prometheus/
    prometheus.yml      # Scrape config for the attraccess job
  grafana/
    provisioning/
      datasources/
        prometheus.yml  # Connects Grafana to Prometheus
      alerting/         # Grafana-managed alert rules + Pushover routing
      dashboards/
        dashboards.yml  # Dashboard provider config
    dashboards/
      attraccess-overview.json
      node-runtime.json
```

A short-lived `monitoring-init` helper service runs the same image, copies these files into named volumes on stack startup, and exits. Prometheus and Grafana mount those volumes read-only and depend on `monitoring-init` finishing successfully (`service_completed_successfully`). This lets the compose file deploy standalone — operators do not need to clone the repo or maintain a `./monitoring` directory next to their compose file.

## Coolify Deployment

Use [`coolify.docker-compose.yml`](https://github.com/Attraccess/Attraccess/blob/main/coolify.docker-compose.yml) from the repo root. Coolify auto-generates the FQDN routing and session secrets via `SERVICE_FQDN_*`, `SERVICE_URL_*`, and `SERVICE_BASE64_*` env conventions. After the stack is deployed:

1. Generate a metrics API key in **Attraccess > Settings > Metrics & Monitoring** ([setup guide](monitoring/setup.md)) and copy it (the value is shown only once)
2. In Coolify, add `PROMETHEUS_METRICS_API_KEY=<your-key>` as a service environment variable, then redeploy the stack — `monitoring-init` injects the bearer token into the Prometheus config on every start (see [Setting the Bearer Token](#setting-the-bearer-token) below)
3. Open Grafana at the FQDN Coolify assigned and log in with `admin` / `admin`. Grafana forces a password change on first login. To pre-set credentials, override `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` in the Coolify env tab before the first deploy.

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
    environment:
      - PROMETHEUS_METRICS_API_KEY=${PROMETHEUS_METRICS_API_KEY:-}
    command:
      - >
        set -e &&
        cp -rT /app/share/monitoring/prometheus /prometheus-config &&
        if [ -n "$$PROMETHEUS_METRICS_API_KEY" ]; then
          sed -i "s|# bearer_token: '<your-metrics-api-key>'|bearer_token: '$$PROMETHEUS_METRICS_API_KEY'|" /prometheus-config/prometheus.yml;
        fi &&
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
| `PROMETHEUS_METRICS_API_KEY` | _(unset)_ | Bearer token Prometheus uses to scrape Attraccess. When set, `monitoring-init` injects it into `prometheus.yml`. Leave unset on first deploy, then mint a key in Attraccess and add it. |

> [!WARNING]
> Change the default Grafana password before deploying to production.

## Setting the Bearer Token

The bundled `prometheus.yml` ships with the bearer token commented out — Prometheus needs it to authenticate against Attraccess `/api/metrics`. Because Attraccess only displays the metrics API key once at creation, the workflow is one-way: mint the key in the Attraccess UI, then push it into the stack as an environment variable.

1. Deploy the stack without `PROMETHEUS_METRICS_API_KEY`. Attraccess starts; Prometheus scrapes will return `401` until step 3 — that is expected.
2. In **Attraccess > Settings > Metrics & Monitoring**, generate a metrics API key and copy it (the value is shown only once).
3. Set `PROMETHEUS_METRICS_API_KEY=<your-key>` as an environment variable on the stack:
   - **Coolify**: add it in the service env tab and trigger a redeploy.
   - **Manual compose**: add it to your `.env` file (or export it in the shell), then `docker compose up -d --force-recreate monitoring-init prometheus`.
4. On startup, `monitoring-init` runs:

   ```sh
   sed -i "s|# bearer_token: '<your-metrics-api-key>'|bearer_token: '$PROMETHEUS_METRICS_API_KEY'|" /prometheus-config/prometheus.yml
   ```

   Prometheus then mounts the rewritten config read-only and authenticates successfully.

> [!NOTE]
> `monitoring-init` runs on every stack start and re-templates the file from the bundled image, so the bearer token is reapplied automatically as long as `PROMETHEUS_METRICS_API_KEY` stays set. Rotating the key requires minting a new one in Attraccess, updating the env var, and redeploying.

### Bundled Scrape Config

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['attraccess:3000']
    scrape_interval: 10s
    # bearer_token: '<your-metrics-api-key>'
```

> [!NOTE]
> Alerting is managed entirely by Grafana (see `grafana/provisioning/alerting`), so Prometheus does not load any `rule_files`.

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

### Host and Container Metrics

The bundled Coolify and Balena compose stacks also run:

| Exporter | Purpose |
|----------|---------|
| **node-exporter** | Host RAM and filesystem usage |
| **cAdvisor** | Docker container CPU and memory usage |

Operational memory alerts use host/container memory metrics. V8 heap usage remains on the Node Runtime dashboard as an application diagnostic, but it is not used as the primary "server is running out of RAM" warning because V8 can run close to its current heap allocation while the host still has plenty of free memory.

## Customising the Bundled Configs

Because the configs live inside the `attraccess` image and are copied into named volumes on every stack start, edits made directly to the volumes (other than the bearer token) are wiped on redeploy. To customise:

- **Scrape config / alert rules**: edit `monitoring/prometheus/*.yml` in your fork or PR and rebuild the image.
- **Dashboards / datasources**: edit `monitoring/grafana/**` in your fork or PR and rebuild.
- **Per-deploy overrides**: extend the compose with a `docker-compose.override.yml` that mounts your own files on top of the named volume mountpoint.

The Grafana provisioning and dashboard volumes are treated as Attraccess-managed. On stack startup, Attraccess removes stale managed files before copying the current bundled files. When an alert rule UID existed in the previous bundled rules but no longer exists in the current bundle, startup also writes a temporary Grafana `deleteRules` provisioning file so removed Attraccess-managed alerts are deleted from Grafana.

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
| Prometheus shows target as "DOWN" with `401` | Bearer token missing or wrong — set `PROMETHEUS_METRICS_API_KEY` to the value generated in Attraccess and redeploy the stack so `monitoring-init` re-templates the config |
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
