# Monitoring & Metrics

Attraccess includes built-in monitoring support using **Prometheus** for metrics collection and **Grafana** for visualization. This gives you real-time insight into how your makerspace is being used, system health, and operational performance.

## What You Get

| Area | What's Monitored |
|------|-----------------|
| **HTTP Traffic** | Request rates, latency percentiles (p50/p95/p99), error rates |
| **Authentication** | Login attempts, SSO usage, active sessions |
| **Users** | Total users, new registrations |
| **Resources** | Active usage sessions, session durations, introductions completed |
| **Maintenance** | Maintenance events, overdue maintenance alerts |
| **Attractap Devices** | Connected NFC readers, tap events, firmware updates |
| **Billing** | Transaction counts and amounts |
| **Infrastructure** | MQTT server health, WebSocket connections, email delivery, plugin status |
| **Node.js Runtime** | CPU usage, memory (heap/RSS), event loop lag |

## How It Works

1. Attraccess exposes a `/api/metrics` endpoint in Prometheus format
2. Prometheus scrapes this endpoint at a configurable interval
3. Grafana queries Prometheus and displays the data in pre-built dashboards

```
Attraccess ──(/api/metrics)──> Prometheus ──(queries)──> Grafana
```

## Pre-Built Dashboards

Attraccess ships with two Grafana dashboards, ready to use out of the box:

- **Attraccess Overview** -- Application metrics including request rates, authentication, resource usage, billing, devices, and more
- **Node Runtime** -- System-level metrics including CPU, memory, event loop lag, and active handles

## Security

The metrics endpoint is protected by an API key. Prometheus authenticates using a Bearer token. No metrics data is exposed without a valid key.

## Getting Started

1. [Enable the metrics endpoint and generate an API key](monitoring/setup.md)
2. [Configure Prometheus and Grafana](monitoring/prometheus-grafana.md)
3. [Explore the available metrics](monitoring/metrics-reference.md)

## See Also

- [Setup Guide](monitoring/setup.md) -- Enable metrics and generate API keys
- [Prometheus & Grafana](monitoring/prometheus-grafana.md) -- Configuration and Docker Compose setup
- [Metrics Reference](monitoring/metrics-reference.md) -- Complete list of all metrics
