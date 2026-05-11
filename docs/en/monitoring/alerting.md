# Alerting

Attraccess ships Grafana alert rules pre-provisioned. Once you set up one contact point, you start receiving notifications when something is wrong.

## How alerts flow

```
Prometheus metrics
      │
      ▼
Grafana alert rule (ships pre-provisioned)
      │
      ▼
Notification policy (ships pre-provisioned)
      │
      ▼
Contact point  ──►  Email / Slack / Discord / Telegram / webhook / …
(YOU configure this)
```

- **Alert rules** evaluate Prometheus queries on a schedule. Six rules ship by default — service down, high error rate, high latency, scrape failures, failed login spikes, overdue maintenance.
- **Notification policy** decides which contact point an alert goes to. A single default policy routes everything to a receiver named `attraccess-default`.
- **Contact point** is the channel — Slack webhook, email address, Discord webhook, etc. You configure this in the Grafana UI.

## Quickstart (5 minutes)

1. Open Grafana (`/grafana` on your Attraccess host) and log in as an admin.
2. Go to **Alerting → Contact points**.
3. Click the pencil icon on `attraccess-default`.
4. Change **Integration** to your preferred channel (Email, Slack, Discord, Telegram, etc.).
5. Fill in the channel-specific fields. The per-channel sections below have copy-paste-ready field values.
6. Click **Test** — if the notification arrives, you're done. If not, see the troubleshooting section.
7. Save.

That's it — all six pre-provisioned rules now route to your channel.
