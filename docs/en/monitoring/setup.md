# Monitoring Setup

This guide explains how to enable the metrics endpoint in Attraccess and generate the API key that Prometheus uses to scrape metrics.

## Prerequisites

- Administrator permissions in Attraccess

## Enabling Metrics

1. Open **Settings** in the sidebar
2. Select the **Monitoring** section
3. Click **Generate API Key**
4. Copy the displayed API key and store it securely

> [!WARNING]
> The API key is shown only once. If you lose it, you must generate a new one. Generating a new key invalidates the previous key.

## Metrics Endpoint

Once enabled, Attraccess exposes metrics at:

```
GET /api/metrics
```

### Authentication

The endpoint accepts the API key in two ways:

| Method | Example |
|--------|---------|
| **Bearer token** (recommended) | `Authorization: Bearer <your-api-key>` |
| **Query parameter** | `/api/metrics?api_key=<your-api-key>` |

### Testing the Endpoint

You can verify the endpoint is working with curl:

```bash
curl -H "Authorization: Bearer <your-api-key>" https://your-attraccess-url/api/metrics
```

You should see Prometheus-formatted metrics output like:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/resources",status_code="200"} 42
...
```

## Managing the API Key

| Action | How |
|--------|-----|
| **Generate** | Settings > Monitoring > Generate API Key |
| **Regenerate** | Settings > Monitoring > Regenerate API Key (invalidates the old key) |
| **Remove** | Settings > Monitoring > Remove API Key (disables the endpoint) |

> [!NOTE]
> Removing the API key disables the metrics endpoint entirely. Prometheus will no longer be able to scrape metrics until a new key is generated.

## Next Steps

- [Configure Prometheus & Grafana](monitoring/prometheus-grafana.md) to start collecting and visualizing metrics
- [View all available metrics](monitoring/metrics-reference.md)

## See Also

- [Overview](monitoring/overview.md) -- What monitoring offers
- [Prometheus & Grafana](monitoring/prometheus-grafana.md) -- Infrastructure setup
- [Metrics Reference](monitoring/metrics-reference.md) -- Complete metrics list
