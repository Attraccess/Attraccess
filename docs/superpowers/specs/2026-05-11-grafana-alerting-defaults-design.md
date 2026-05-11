# Grafana Alerting Defaults — Design

Date: 2026-05-11
Status: Approved (pending user review of this spec)
Owners: Jan Jaap

## Problem

Attraccess ships Prometheus alert rules in `monitoring/prometheus/alerts.yml`, but the bundled Grafana stack has no alert routing wired up. When a rule fires, the user gets no notification — alerts surface only in the Prometheus `/alerts` page and in the synthetic `ALERTS` metric. There is also no Alertmanager in the bundled stack.

Operators who want notifications today must:

1. Decide between Alertmanager and Grafana Unified Alerting
2. Recreate the existing Prometheus rules in Grafana's UI by hand
3. Configure a contact point and notification policy from scratch

This is enough friction that most installs end up with no alerting at all.

## Goal

Give operators a working alert pipeline in roughly five minutes:

- Alert rules load automatically on first boot
- A default notification policy already routes everything to a known-name receiver
- Documentation walks them through creating one contact point in the Grafana UI for the channel of their choice, covering both native and webhook-based integrations

## Non-goals

- Replacing or removing `monitoring/prometheus/alerts.yml` (still used by anyone running classic Alertmanager outside this stack)
- Provisioning Alertmanager (out of scope; users who want it can run it themselves)
- Shipping per-channel secrets or auto-discovering SMTP relays
- On-call schedules, escalation policies, or paging integrations beyond what Grafana supports out of the box

## Approach

Use Grafana Unified Alerting (already part of the bundled Grafana 13 image). Provision rules and policy via files baked into the image; leave contact-point secrets to the operator via the Grafana UI.

### Components

#### 1. Ported alert rules

New file `monitoring/grafana/provisioning/alerting/rules.yml`.

Schema follows Grafana's alerting provisioning format (`apiVersion: 1`, `groups[].rules[]`). Each rule mirrors a rule in `monitoring/prometheus/alerts.yml`:

| Prometheus rule              | Grafana rule (same name, same expr) |
| ---------------------------- | ----------------------------------- |
| `AttractapServiceDown`       | `AttractapServiceDown`              |
| `HighHttpErrorRate`          | `HighHttpErrorRate`                 |
| `HighRequestLatency`         | `HighRequestLatency`                |
| `ScrapeFailures`             | `ScrapeFailures`                    |
| `HighFailedLoginRate`        | `HighFailedLoginRate`               |
| `OverdueMaintenance`         | `OverdueMaintenance`                |

All rules query the provisioned `Prometheus` datasource (UID `attraccess-prometheus`). Folder: `Attraccess Alerts`. Severity labels preserved. Annotations preserved. The `for` duration on each rule is unchanged.

`monitoring/prometheus/alerts.yml` stays in the tree unchanged. It is consumed by the bundled Prometheus, and by any external Alertmanager users may layer in.

#### 2. Notification policy

New file `monitoring/grafana/provisioning/alerting/policies.yml`.

Single root route:

```yaml
apiVersion: 1
policies:
  - orgId: 1
    receiver: attraccess-default
    group_by: [alertname, severity]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

These intervals match Alertmanager's defaults closely enough to feel familiar without being noisy. No nested routes.

#### 3. Placeholder contact point

New file `monitoring/grafana/provisioning/alerting/contact-points.yml`.

Single receiver named `attraccess-default`, type `email`, with no addresses configured. The intent is:

- Grafana validates the policy → receiver reference at boot
- The receiver exists but does nothing until the operator edits it
- Operators can either edit `attraccess-default` in the UI (recommended) or create a different contact point and re-point the policy to it

Provisioned objects can be edited in the UI when `disableProvenance: true` is set on each object (Grafana 11+). All three new files — `rules.yml`, `policies.yml`, `contact-points.yml` — will set this flag on every object so operators are never blocked by "provisioned, read-only" warnings.

#### 4. Documentation

Two new files, mirroring the existing structure:

- `docs/en/monitoring/alerting.md`
- `docs/de/monitoring/alerting.md`

Sections:

1. **How alerts flow** — short conceptual overview of rules → policy → contact point
2. **Quickstart** — pick one channel, ~5 min walkthrough using the default policy
3. **Native Grafana channels** — copy-paste-ready field values for each:
   - Email (with SMTP env var hints for `GF_SMTP_*`)
   - Slack incoming webhook
   - Discord webhook
   - Telegram bot
   - Microsoft Teams
   - PagerDuty
   - Pushover
   - OpsGenie
4. **Open-source / maker channels via generic webhook** — payload format hints for:
   - ntfy.sh
   - Gotify
   - Matrix (via matrix-hookshot)
   - Signal (via `signal-cli-rest-api`)
   - Mattermost
   - Rocket.Chat
   - Apprise (catch-all bridge)
5. **Testing alerts** — using Grafana's "Test" button on a contact point
6. **Silences and mute timings** — short pointer to the UI features, not a deep dive
7. **Troubleshooting** — common failure modes:
   - Rule fires in Prometheus `/alerts` but not in Grafana → datasource UID mismatch or rule failed to load
   - Contact-point test fails → channel-specific (webhook URL wrong, SMTP auth, Discord rate limits)
   - SMTP errors → `GF_SMTP_*` env vars not wired
   - "Provisioned, cannot edit" → `disableProvenance` not set

Also update `docs/{en,de}/monitoring/overview.md` to mention alerting and link to the new page. Both languages get the same content, written separately rather than machine-translated, matching the existing pattern.

#### 5. Init container

The `monitoring-init` container already does:

```sh
cp -rT /app/share/monitoring/grafana/provisioning /grafana-provisioning
```

Because the new files live under `monitoring/grafana/provisioning/alerting/`, they are picked up automatically. No init-container changes required.

#### 6. Compose hint

Add a comment near the `grafana:` service in both `docker-compose.yml` (Coolify) and `docker-compose.dev.yml` (or equivalent dev compose) noting that alerts are configured in the Grafana UI and pointing at the docs. Optionally add commented-out `GF_SMTP_*` env stubs for operators who want email out of the box.

### File tree (new + modified)

```
monitoring/
  grafana/
    provisioning/
      alerting/                           (new dir)
        rules.yml                         (new)
        policies.yml                      (new)
        contact-points.yml                (new)

docs/
  en/monitoring/
    alerting.md                           (new)
    overview.md                           (modified: link to alerting.md)
  de/monitoring/
    alerting.md                           (new)
    overview.md                           (modified: link to alerting.md)

docker-compose.yml                        (modified: comment + optional SMTP stubs)
docker-compose.dev.yml                    (modified: same as above, if applicable)
```

## Data flow

```
Prometheus scrapes Attraccess every 10s
        │
        ▼
Grafana datasource "Prometheus" (uid: attraccess-prometheus)
        │
        ▼
Grafana evaluates rules from /etc/grafana/provisioning/alerting/rules.yml
        │
        ▼
Firing alerts → notification policy from policies.yml
        │
        ▼
Receiver "attraccess-default" from contact-points.yml
        │
        ▼ (operator-configured)
Email / Slack / Discord / Telegram / webhook / …
```

## Validation strategy

Manual smoke test on a real deployment (the Attraktor stack, in particular, since it's the install that prompted this work):

1. Pull image with these changes; redeploy stack
2. Open Grafana → Alerting → Alert rules → confirm 6 rules visible in "Attraccess Alerts" folder
3. Open Notification policies → confirm root policy routes to `attraccess-default`
4. Edit `attraccess-default` → set email addresses or replace with a Discord webhook
5. Click "Test" on the contact point → confirm notification arrives
6. Force a failure to trigger a rule (e.g., stop Attraccess for >2 min) → confirm `AttractapServiceDown` fires and notification reaches the configured channel

No automated tests. The Grafana provisioning is YAML config; failure modes are caught at Grafana boot time (config errors appear in `docker logs grafana` and prevent the rules from loading).

## Open questions

None at design time. Channel-specific quirks (e.g., Discord rate limits, Telegram bot creation flow) will be researched during the docs-writing step rather than pre-decided here.

## Rollout

Single PR. No migration. Operators upgrading get new rules + policy on next image pull and Grafana restart. Existing Alertmanager users are unaffected — their config still consumes `monitoring/prometheus/alerts.yml`.
