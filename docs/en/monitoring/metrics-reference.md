# Metrics Reference

This page lists all metrics exposed by Attraccess at the `/api/metrics` endpoint. Metrics use the [Prometheus exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/).

## Metric Types

| Type | Description |
|------|-------------|
| **Counter** | A value that only goes up (e.g. total requests). Resets to zero on restart |
| **Gauge** | A value that can go up or down (e.g. active sessions). Restored from database on restart |
| **Histogram** | Samples observations into configurable buckets (e.g. request duration) |

## HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Duration of HTTP requests in seconds |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total number of HTTP requests |

**Histogram buckets:** 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

### Example PromQL Queries

```promql
# Request rate per second (last 5 minutes)
rate(http_requests_total[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate (5xx responses)
rate(http_requests_total{status_code=~"5.."}[5m])
```

## Authentication Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_auth_login_total` | Counter | `method`, `status` | Login attempts. `method`: `local` or `sso`. `status`: `success` or `failure` |
| `attraccess_auth_active_sessions` | Gauge | -- | Number of active authenticated sessions |
| `attraccess_auth_sso_login_total` | Counter | `provider_type` | SSO login attempts. `provider_type`: `oidc` or `saml` |
| `attraccess_auth_2fa_usage_total` | Counter | `action` | Two-factor authentication actions |

### Example PromQL Queries

```promql
# Failed login rate
rate(attraccess_auth_login_total{status="failure"}[5m])

# SSO vs local login comparison
sum by (method) (rate(attraccess_auth_login_total{status="success"}[1h]))
```

## User Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_users_total` | Gauge | -- | Total number of registered users |
| `attraccess_users_registered_total` | Counter | -- | Cumulative number of user registrations |

## Resource Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_resources_total` | Gauge | -- | Total number of resources |
| `attraccess_resource_usage_sessions_active` | Gauge | -- | Currently active usage sessions |
| `attraccess_resource_usage_sessions_total` | Counter | `action` | Usage sessions started or ended. `action`: `started` or `ended` |
| `attraccess_resource_usage_duration_seconds` | Histogram | -- | Duration of completed usage sessions |
| `attraccess_resource_groups_total` | Gauge | -- | Total number of resource groups |
| `attraccess_resource_introductions_total` | Counter | -- | Completed resource introductions (safety briefings) |
| `attraccess_resource_maintenance_total` | Counter | `type` | Maintenance events by type |
| `attraccess_resource_maintenance_overdue` | Gauge | -- | Number of resources with overdue maintenance |

**Usage duration histogram buckets:** 1min, 5min, 10min, 30min, 1h, 2h, 4h, 8h

### Example PromQL Queries

```promql
# Active usage sessions right now
attraccess_resource_usage_sessions_active

# Median session duration
histogram_quantile(0.5, rate(attraccess_resource_usage_duration_seconds_bucket[24h]))

# Resources with overdue maintenance
attraccess_resource_maintenance_overdue > 0
```

## Attractap Device Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_attractap_devices_connected` | Gauge | -- | Number of connected Attractap NFC readers |
| `attraccess_attractap_nfc_taps_total` | Counter | -- | Total NFC tap events |
| `attraccess_attractap_firmware_updates_total` | Counter | -- | Total firmware update events |

## Billing Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_billing_transactions_total` | Counter | `status` | Billing transactions by status |
| `attraccess_billing_transaction_amount` | Histogram | -- | Transaction amounts |

**Transaction amount histogram buckets:** 1, 5, 10, 25, 50, 100, 250, 500, 1000

## Infrastructure Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_projects_total` | Gauge | -- | Total number of projects |
| `attraccess_mqtt_servers_total` | Gauge | -- | Total configured MQTT servers |
| `attraccess_mqtt_servers_healthy` | Gauge | -- | Number of healthy MQTT servers |
| `attraccess_plugins_loaded` | Gauge | -- | Number of loaded plugins |
| `attraccess_email_sent_total` | Counter | `status` | Emails sent by delivery status |
| `attraccess_websocket_connections_active` | Gauge | -- | Active WebSocket connections |

## Node.js Runtime Metrics

These are standard metrics collected automatically by the [prom-client](https://github.com/siimon/prom-client) library:

| Metric | Type | Description |
|--------|------|-------------|
| `process_cpu_user_seconds_total` | Counter | CPU time spent in user mode |
| `process_cpu_system_seconds_total` | Counter | CPU time spent in system mode |
| `process_resident_memory_bytes` | Gauge | Resident set size (RSS) |
| `nodejs_heap_size_total_bytes` | Gauge | Total V8 heap size |
| `nodejs_heap_size_used_bytes` | Gauge | Used V8 heap size |
| `nodejs_external_memory_bytes` | Gauge | V8 external memory |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag in seconds |
| `nodejs_active_handles_total` | Gauge | Number of active libuv handles |
| `nodejs_active_requests_total` | Gauge | Number of active libuv requests |

### Example PromQL Queries

```promql
# CPU usage rate
rate(process_cpu_user_seconds_total[5m]) + rate(process_cpu_system_seconds_total[5m])

# Memory usage in MB
nodejs_heap_size_used_bytes / 1024 / 1024

# Event loop lag
nodejs_eventloop_lag_seconds
```

## See Also

- [Overview](monitoring/overview.md) -- Monitoring feature overview
- [Setup Guide](monitoring/setup.md) -- Enable the metrics endpoint
- [Prometheus & Grafana](monitoring/prometheus-grafana.md) -- Infrastructure configuration
