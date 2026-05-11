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

## Open-source / maker channels via generic webhook

Pick the **Webhook** integration in the contact-point editor, then use the URL and HTTP method below. Grafana POSTs a JSON body shaped like the [Grafana webhook payload](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/).

Many services accept this directly; for those that need a different shape, a small bridge (e.g., an [Apprise](https://github.com/caronc/apprise) instance, a [Hookshot](https://matrix-org.github.io/matrix-hookshot/latest/) container, or a one-liner reverse proxy) translates the payload.

### ntfy.sh

- **URL**: `https://ntfy.sh/<your-topic>` (self-host or use the public service)
- **HTTP Method**: POST
- **Authorization**: none, or Basic Auth if your ntfy instance requires it
- Body templating: leave default — ntfy displays the JSON as-is in its UI. For prettier output, run ntfy behind a script that pulls `commonAnnotations.summary`.

### Gotify

- **URL**: `https://<gotify-host>/message?token=<app-token>`
- **HTTP Method**: POST
- Body templating: leave default.

### Matrix (via matrix-hookshot)

Hookshot exposes a generic webhook endpoint per room.
- In Hookshot's room admin: create a generic webhook, copy the URL.
- **URL**: hookshot URL
- **HTTP Method**: POST

### Signal (via signal-cli-rest-api)

Run [`signal-cli-rest-api`](https://github.com/bbernhard/signal-cli-rest-api) alongside Grafana. Use the Webhook integration with a small bridge that posts to `/v2/send`. The Grafana payload schema is documented above; a 10-line Node/Python sidecar is typically enough.

### Mattermost

Mattermost incoming webhooks accept Slack-shaped payloads. Either:
- Use the **Slack** integration in Grafana and point its webhook URL at Mattermost (`https://mattermost.example.com/hooks/...`), or
- Use the **Webhook** integration with default body for Mattermost's generic format.

### Rocket.Chat

Rocket.Chat incoming webhooks also accept Slack-shaped payloads — same trick as Mattermost.

### Apprise (catch-all bridge)

[Apprise](https://github.com/caronc/apprise) exposes one HTTP endpoint that fans out to 80+ notification services (Twilio, Pushbullet, XMPP, IRC, etc.).
- **URL**: `https://<apprise-host>/notify/<token>`
- **HTTP Method**: POST

## Testing alerts

Every contact point has a **Test** button in the editor. It sends a synthetic alert through the same path your real alerts would take. Use this to confirm:
- The webhook URL / SMTP credentials are correct
- Your channel renders the message acceptably
- There's no firewall in the way

For an end-to-end test that actually fires a real rule, stop the Attraccess container for more than 2 minutes. `AttractapServiceDown` will fire `critical` and route through your contact point.

## Silences and mute timings

Both live under **Alerting → Silences** and **Alerting → Notification policies → Mute timings**:
- **Silences** are one-off mutes ("don't page me about X for the next 4 hours"). Use during planned maintenance.
- **Mute timings** are recurring windows ("never page on Sundays 02:00–06:00 UTC"). Attach them to the root policy in **Notification policies**.

Neither is provisioned — configure both in the UI as needed.

## Troubleshooting

**Alert fires in Prometheus `/alerts` but not in Grafana**

Most likely the rule failed to load. Check `docker logs grafana | grep provisioning.alerting`. Common causes:
- Datasource UID typo in `rules.yml` — must match the UID in `monitoring/grafana/provisioning/datasources/prometheus.yml` exactly (`attraccess-prometheus`).
- Duplicate rule UID in the Grafana database from a previous run. Wipe the `grafana-data` volume and redeploy.

**Contact-point Test button fails**

- Webhook URL: 401/403 → token wrong. 404 → URL path typo. Connection refused → network/firewall.
- Email: check `docker logs grafana | grep smtp`. The most common failure is `GF_SMTP_STARTTLS_POLICY` mismatching what your relay expects.
- Discord: Discord rate-limits webhooks; a 429 response means slow down.

**"This object is provisioned and read-only" warning in the UI**

The provisioning files ship with `disableProvenance: true` on every item, so this should not appear. If it does, verify the flag is set in your local `rules.yml`/`policies.yml`/`contact-points.yml` and redeploy.

**No notifications during expected outages**

- Check **Alerting → Alert rules** — is the rule firing? If not, the underlying metric may be absent on a fresh install with no traffic yet.
- Check **Alerting → History** for whether Grafana attempted delivery.
- Inspect `docker logs grafana | grep -i alert` for delivery errors.
