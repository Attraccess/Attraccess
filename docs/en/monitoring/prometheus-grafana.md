# Prometheus & Grafana Setup

This guide covers how to set up Prometheus and Grafana to collect and visualize Attraccess metrics. Attraccess ships with pre-configured dashboards and provisioning files so you can get started quickly.

## Docker Compose Configuration

Add the following services to your `docker-compose.yml`:

```yaml
services:
  # ... your existing attraccess service ...

  prometheus:
    image: prom/prometheus:v3.4.0
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

  grafana:
    image: grafana/grafana:11.6.0
    restart: unless-stopped
    expose:
      - '3001'
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-attraccess}
      - GF_SERVER_HTTP_PORT=3001
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana

volumes:
  prometheus-config:
  prometheus-data:
  grafana-data:
```

### Environment Variables

Set these in your `.env` file or `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | `attraccess` | Grafana admin password |

> [!WARNING]
> Change the default Grafana password before deploying to production.

## Prometheus Configuration

Create the file `monitoring/prometheus/prometheus.yml`:

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
    bearer_token: '<your-metrics-api-key>'
```

Replace `<your-metrics-api-key>` with the API key you generated in the [setup guide](monitoring/setup.md).

### Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `scrape_interval` | `10s` | How often Prometheus scrapes the Attraccess metrics endpoint |
| `evaluation_interval` | `15s` | How often Prometheus evaluates recording and alerting rules |
| `storage.tsdb.retention.time` | `30d` | How long metrics data is retained |

> [!TIP]
> A 10-second scrape interval provides good granularity for most dashboards. Increase it to 30s or 60s if you want to reduce resource usage.

## Grafana Provisioning

Attraccess includes provisioning files that automatically configure Grafana with the correct datasource and dashboards. These are located in the `monitoring/grafana/` directory:

```
monitoring/grafana/
  provisioning/
    datasources/
      prometheus.yml      # Connects Grafana to Prometheus
    dashboards/
      dashboards.yml      # Dashboard provider configuration
  dashboards/
    attraccess-overview.json   # Main application dashboard
    node-runtime.json          # Node.js runtime dashboard
```

No manual Grafana configuration is needed -- the provisioning files handle everything automatically.

### Datasource Configuration

The included datasource configuration (`monitoring/grafana/provisioning/datasources/prometheus.yml`):

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

## Accessing Grafana

Once the services are running:

1. Open Grafana in your browser (default port `3001`)
2. Log in with the admin credentials you configured
3. Navigate to **Dashboards** > **Attraccess** folder
4. Open the **Attraccess Overview** or **Node Runtime** dashboard

> [!NOTE]
> If you are using a reverse proxy (like Nginx Proxy Manager), create a proxy host pointing to the Grafana service on port 3001.

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
| Prometheus shows target as "DOWN" | Verify the API key in `prometheus.yml` matches the key generated in Attraccess. Check that the `attraccess` service is reachable from the Prometheus container |
| No data in Grafana dashboards | Confirm Prometheus is running and scraping successfully. Check Prometheus targets page at `http://prometheus:9090/targets` |
| Grafana login fails | Check the `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` environment variables |
| Dashboards not appearing | Verify the volume mounts for `monitoring/grafana/provisioning` and `monitoring/grafana/dashboards` are correct |
| Stale metrics after restart | Gauge metrics (like total users) are re-populated from the database on startup. Counter metrics reset to zero on restart -- this is normal Prometheus behavior |

## See Also

- [Setup Guide](monitoring/setup.md) -- Enable the metrics endpoint
- [Metrics Reference](monitoring/metrics-reference.md) -- Complete list of all metrics
- [Overview](monitoring/overview.md) -- Monitoring feature overview
- [Environment Variables](installation/environment-variables.md) -- All configuration options
