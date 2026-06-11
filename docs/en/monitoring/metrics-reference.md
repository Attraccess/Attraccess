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
| `attraccess_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Duration of HTTP requests in seconds |
| `attraccess_http_requests_total` | Counter | `method`, `route`, `status_code` | Total number of HTTP requests |

**Histogram buckets:** 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

### Example PromQL Queries

```promql
# Request rate per second (last 5 minutes)
rate(attraccess_http_requests_total[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(attraccess_http_request_duration_seconds_bucket[5m]))

# Error rate (5xx responses)
rate(attraccess_http_requests_total{status_code=~"5.."}[5m])
```

## Authentication Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_auth_login_total` | Counter | `method`, `status` | Login attempts (includes unknown-username attempts). `method`: `local` or `sso`. `status`: `success` or `fail` |
| `attraccess_auth_active_sessions` | Gauge | -- | Number of active authenticated sessions |
| `attraccess_auth_sso_login_total` | Counter | `provider_type` | SSO login attempts. `provider_type`: `oidc` or `saml` |
| `attraccess_auth_2fa_usage_total` | Counter | `action` | Two-factor authentication actions |

### Example PromQL Queries

```promql
# Failed logins in the last 5 minutes
sum(increase(attraccess_auth_login_total{status="fail"}[5m]))

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
| `attraccess_resource_usage_sessions_total` | Counter | `action` | Usage sessions started or ended. `action`: `start` or `end` |
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
| `attraccess_attractap_crash_reports_total` | Counter | `reset_reason` | Crash reports received from readers. `reset_reason` is a normalized reset cause (e.g. `PANIC`, `INT_WDT`, `BROWNOUT`, `unknown`) |

### Example PromQL Queries

```promql
# Reader crashes in the last hour, broken down by reset cause
sum by (reset_reason) (increase(attraccess_attractap_crash_reports_total[1h]))

# Alert signal: all readers offline (but some were connected recently)
attraccess_attractap_devices_connected == 0
  and max_over_time(attraccess_attractap_devices_connected[1h]) > 0
```

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

## WebSocket Timing

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_ws_message_duration_seconds` | Histogram | `gateway`, `event`, `status` | Duration of WebSocket message handlers |
| `attraccess_ws_messages_total` | Counter | `gateway`, `event`, `status` | Total WebSocket messages handled |
| `attraccess_ws_connection_duration_seconds` | Histogram | `gateway` | Duration of WebSocket connections |

**Message duration buckets:** 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s
**Connection duration buckets:** 10s, 30s, 1min, 5min, 15min, 1h, 6h, 24h

### Example PromQL Queries

```promql
# p95 message latency by event
histogram_quantile(0.95, sum by (event, le) (rate(attraccess_ws_message_duration_seconds_bucket[5m])))

# Message error rate by event
sum by (event) (rate(attraccess_ws_messages_total{status="error"}[5m]))
```

## Cron Jobs

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_cron_job_duration_seconds` | Histogram | `job_name` | Duration of scheduled job runs |
| `attraccess_cron_job_runs_total` | Counter | `job_name`, `status` | Cron job runs by outcome. `status`: `success` or `failure` |
| `attraccess_cron_job_last_run_timestamp_seconds` | Gauge | `job_name` | Unix timestamp of the most recent run |
| `attraccess_cron_job_last_success_timestamp_seconds` | Gauge | `job_name` | Unix timestamp of the most recent successful run |

**Duration buckets:** 100ms, 500ms, 1s, 5s, 10s, 30s, 1min, 5min, 15min, 30min

**Job names:** `sumup_poll`, `session_cleanup`, `maintenance_evaluator`, `flow_daily_cleanup`, `flow_minute_tick`.

### Example PromQL Queries

```promql
# Time since last successful run (alert if too old)
time() - attraccess_cron_job_last_success_timestamp_seconds

# Cron failure rate
sum by (job_name) (rate(attraccess_cron_job_runs_total{status="failure"}[15m]))
```

## Database

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_db_query_duration_seconds` | Histogram | `entity`, `method` | Duration of database queries (`select`, `insert`, `update`, `delete`, `other`) |
| `attraccess_db_query_errors_total` | Counter | `entity`, `method`, `error_type` | Database query errors |
| `attraccess_db_slow_queries_total` | Counter | `entity`, `method` | Queries exceeding the slow-query threshold |
| `attraccess_db_pool_size` | Gauge | -- | Configured connection pool size |

**Duration buckets:** 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s

All SQL passing through the TypeORM `QueryRunner` is timed -- reads (`find`, `findOne`, `getMany`) and writes alike. Housekeeping statements (`BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, `PRAGMA`) are skipped. The `entity` label is parsed from the SQL `FROM` / `INTO` / `UPDATE` clause; statements that do not match a table fall back to `entity="unknown"`.

**Disabled by default** (high cardinality). Enable via Admin Settings -> Metrics -> Toggles -> Database.

**Slow-query threshold:** queries longer than `0.5s` increment `attraccess_db_slow_queries_total`. Configurable via Admin Settings -> Metrics -> Slow query threshold. Negative or non-numeric values fall back to the default.

### Example PromQL Queries

```promql
# Top 10 slowest entities (p95)
topk(10, histogram_quantile(0.95, sum by (entity, method, le) (rate(attraccess_db_query_duration_seconds_bucket[5m]))))

# Slow query rate
sum by (entity, method) (rate(attraccess_db_slow_queries_total[5m]))
```

## External Calls

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_external_call_duration_seconds` | Histogram | `target`, `operation`, `status` | Duration of outbound calls to external services |
| `attraccess_external_call_errors_total` | Counter | `target`, `operation`, `error_type` | External call errors |

**Duration buckets:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s

**Targets:** `sumup`, `smtp`, `mqtt`, `github`. Operations are bounded enums per target (e.g. `merchant`, `checkout`, `transactions` for SumUp; `send` for SMTP; `publish`, `subscribe` for MQTT).

### Example PromQL Queries

```promql
# External call error rate by target
sum by (target) (rate(attraccess_external_call_errors_total[5m]))

# p95 external call latency
histogram_quantile(0.95, sum by (target, operation, le) (rate(attraccess_external_call_duration_seconds_bucket[5m])))
```

## Server-Sent Events

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_sse_active_connections` | Gauge | `stream` | Active SSE subscribers per stream |
| `attraccess_sse_connection_duration_seconds` | Histogram | `stream` | Duration of SSE connections |
| `attraccess_sse_messages_sent_total` | Counter | `stream` | Total SSE messages sent |

**Connection duration buckets:** 10s, 30s, 1min, 5min, 15min, 1h, 6h, 24h

**Streams:** `resource_usage`, `billing`, `resource_flows`.

## Resource Flows

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `attraccess_flow_execution_duration_seconds` | Histogram | `trigger_type`, `status` | Duration of flow executions |
| `attraccess_flow_node_duration_seconds` | Histogram | `node_type`, `status` | Duration per flow node |
| `attraccess_flow_executions_total` | Counter | `trigger_type`, `status` | Total flow executions |

**Duration buckets:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s, 1min

`trigger_type` and `node_type` are values from the `ResourceFlowNodeType` enum (e.g. `manual.button`, `http.send-request`).

### Example PromQL Queries

```promql
# Flow execution failure rate by trigger
sum by (trigger_type) (rate(attraccess_flow_executions_total{status="failure"}[5m]))

# p95 flow execution duration
histogram_quantile(0.95, sum by (trigger_type, le) (rate(attraccess_flow_execution_duration_seconds_bucket[5m])))
```

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

## Host and Container Metrics

Bundled Coolify and Balena compose deployments scrape standard exporter metrics in addition to the Attraccess API metrics:

| Source | Example Metrics | Description |
|--------|-----------------|-------------|
| `node-exporter` | `node_memory_MemAvailable_bytes`, `node_memory_MemTotal_bytes`, `node_filesystem_avail_bytes`, `node_filesystem_size_bytes` | Host RAM and filesystem capacity |
| `cadvisor` | `container_memory_working_set_bytes`, `container_spec_memory_limit_bytes` | Docker container memory usage and configured limits |

### Example PromQL Queries

```promql
# Host RAM usage ratio
1 - (node_memory_MemAvailable_bytes{job="node-exporter"} / node_memory_MemTotal_bytes{job="node-exporter"})

# Host filesystem usage ratio by mountpoint
1 - (node_filesystem_avail_bytes{job="node-exporter"} / node_filesystem_size_bytes{job="node-exporter"})

# Attraccess container memory usage ratio, when a container memory limit exists
max(
  (
    container_memory_working_set_bytes{job="cadvisor",container_label_com_docker_compose_service="attraccess"}
    /
    (container_spec_memory_limit_bytes{job="cadvisor",container_label_com_docker_compose_service="attraccess"} > 0)
  )
  or
  (
    container_memory_working_set_bytes{job="cadvisor",container_label_io_balena_service_name="attraccess"}
    /
    (container_spec_memory_limit_bytes{job="cadvisor",container_label_io_balena_service_name="attraccess"} > 0)
  )
)
```

## See Also

- [Overview](monitoring/overview.md) -- Monitoring feature overview
- [Setup Guide](monitoring/setup.md) -- Enable the metrics endpoint
- [Prometheus & Grafana](monitoring/prometheus-grafana.md) -- Infrastructure configuration
