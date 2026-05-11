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

## Native Grafana channels

These integrations are first-class in Grafana — pick the integration in the contact-point editor and fill the fields.

### Email

Email needs SMTP configured on the Grafana container. Set these env vars on the `grafana:` service in your compose file (replace values with your SMTP relay's details):

```yaml
environment:
  - GF_SMTP_ENABLED=true
  - GF_SMTP_HOST=smtp.example.com:587
  - GF_SMTP_USER=alerts@example.com
  - GF_SMTP_PASSWORD=<password>
  - GF_SMTP_FROM_ADDRESS=alerts@example.com
  - GF_SMTP_FROM_NAME=Attraccess Alerts
  - GF_SMTP_STARTTLS_POLICY=MandatoryStartTLS
```

Restart Grafana. Then in the contact-point editor:
- **Integration**: Email
- **Addresses**: comma-separated recipients

### Slack incoming webhook

Create a webhook URL: <https://api.slack.com/messaging/webhooks>.
- **Integration**: Slack
- **Webhook URL**: `https://hooks.slack.com/services/T.../B.../...`
- Leave token/recipient blank if using webhook mode.

### Discord webhook

Channel settings → Integrations → Webhooks → New Webhook → copy URL.
- **Integration**: Discord
- **Webhook URL**: `https://discord.com/api/webhooks/.../...`
- **Use Discord username**: optional
- **Avatar URL**: optional

### Telegram

Create a bot via [@BotFather](https://t.me/BotFather), get the token. Send a message to your bot, then call `https://api.telegram.org/bot<TOKEN>/getUpdates` and find the chat `id`.
- **Integration**: Telegram
- **BOT API Token**: from BotFather
- **Chat ID**: numeric ID from `getUpdates`

### Microsoft Teams

Channel → Connectors → Incoming Webhook → copy URL.
- **Integration**: Microsoft Teams
- **URL**: webhook URL

### PagerDuty

Create a service in PagerDuty with an Events API v2 integration, copy the integration key.
- **Integration**: PagerDuty
- **Integration Key**: from PagerDuty
- **Severity**: defaults to mapping from the `severity` label on the rule (already set by the provisioned rules)

### Pushover

- **Integration**: Pushover
- **API Token**: from <https://pushover.net/apps/build>
- **User Key**: from your Pushover dashboard

### OpsGenie

- **Integration**: OpsGenie
- **API Key**: from OpsGenie integrations tab
- **API URL**: leave blank for default
