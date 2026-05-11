# Grafana Alerting Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pre-provisioned Grafana alert rules, a default notification policy, and a placeholder contact point so operators can wire up notifications by editing one channel in the Grafana UI, plus bilingual docs that walk them through every supported channel.

**Architecture:** Add three YAML files under `monitoring/grafana/provisioning/alerting/`. The existing `monitoring-init` container already copies the whole `provisioning/` directory into the Grafana volume, so no init-script change is needed. Keep the Prometheus-format `monitoring/prometheus/alerts.yml` untouched — it stays the source of truth for anyone running classic Alertmanager. Add EN + DE docs and a comment hint in the three compose files.

**Tech Stack:** Grafana 13 Unified Alerting provisioning (YAML, `apiVersion: 1`), Markdown docs in `docs/{en,de}/monitoring/`, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-05-11-grafana-alerting-defaults-design.md`

---

## Pre-flight

- [ ] **Confirm starting branch**

  ```bash
  git status
  git rev-parse --abbrev-ref HEAD
  ```

  Expected: clean working tree on `feat/grafana-alerting-defaults` (created during spec commit). If on a different branch, switch:

  ```bash
  git checkout feat/grafana-alerting-defaults
  ```

---

## Task 1: Provision alert rules

**Files:**
- Create: `monitoring/grafana/provisioning/alerting/rules.yml`

**Background:** Grafana Unified Alerting rules are expressed as a chain of refs: a Prometheus instant query (refId `A`), a reduce expression to collapse it to a single value (refId `B`), and a threshold expression that decides firing (refId `C`). The rule's `condition` points at `C`. We port each of the six rules in `monitoring/prometheus/alerts.yml` using this pattern. Server-side expressions use the synthetic datasource UID `__expr__`. Each object sets `isPaused: false` and the rule references the existing Prometheus datasource UID `attraccess-prometheus` provisioned in `monitoring/grafana/provisioning/datasources/prometheus.yml`.

- [ ] **Step 1: Create the alerting dir and the rules file with all six rules**

```yaml
# /Users/jappy/.t3/worktrees/Attraccess/t3code-b9d591bd/monitoring/grafana/provisioning/alerting/rules.yml
apiVersion: 1

groups:
  - orgId: 1
    name: attraccess
    folder: Attraccess Alerts
    interval: 1m
    rules:
      - uid: attraccess-service-down
        title: AttractapServiceDown
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: attraccess-prometheus
            model:
              datasource:
                type: prometheus
                uid: attraccess-prometheus
              editorMode: code
              expr: up{job="attraccess"}
              instant: true
              intervalMs: 1000
              maxDataPoints: 43200
              range: false
              refId: A
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              expression: A
              reducer: last
              refId: B
              type: reduce
          - refId: C
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              conditions:
                - evaluator:
                    params: [1]
                    type: lt
                  operator:
                    type: and
                  query:
                    params: [C]
                  reducer:
                    params: []
                    type: last
                  type: query
              expression: B
              refId: C
              type: threshold
        for: 2m
        annotations:
          summary: Attraccess service is down
          description: The Attraccess API has been unreachable for more than 2 minutes.
        labels:
          severity: critical
        isPaused: false
        noDataState: Alerting
        execErrState: Error

      - uid: attraccess-high-http-error-rate
        title: HighHttpErrorRate
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: attraccess-prometheus
            model:
              datasource:
                type: prometheus
                uid: attraccess-prometheus
              editorMode: code
              expr: sum(rate(attraccess_http_requests_total{job="attraccess", status_code=~"5.."}[5m])) / sum(rate(attraccess_http_requests_total{job="attraccess"}[5m]))
              instant: true
              intervalMs: 1000
              maxDataPoints: 43200
              range: false
              refId: A
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              expression: A
              reducer: last
              refId: B
              type: reduce
          - refId: C
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              conditions:
                - evaluator:
                    params: [0.05]
                    type: gt
                  operator:
                    type: and
                  query:
                    params: [C]
                  reducer:
                    params: []
                    type: last
                  type: query
              expression: B
              refId: C
              type: threshold
        for: 5m
        annotations:
          summary: High HTTP 5xx error rate
          description: More than 5% of HTTP requests are returning 5xx errors over the last 5 minutes.
        labels:
          severity: warning
        isPaused: false
        noDataState: NoData
        execErrState: Error

      - uid: attraccess-high-request-latency
        title: HighRequestLatency
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: attraccess-prometheus
            model:
              datasource:
                type: prometheus
                uid: attraccess-prometheus
              editorMode: code
              expr: histogram_quantile(0.95, sum(rate(attraccess_http_request_duration_seconds_bucket{job="attraccess"}[5m])) by (le))
              instant: true
              intervalMs: 1000
              maxDataPoints: 43200
              range: false
              refId: A
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              expression: A
              reducer: last
              refId: B
              type: reduce
          - refId: C
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              conditions:
                - evaluator:
                    params: [2]
                    type: gt
                  operator:
                    type: and
                  query:
                    params: [C]
                  reducer:
                    params: []
                    type: last
                  type: query
              expression: B
              refId: C
              type: threshold
        for: 5m
        annotations:
          summary: High request latency (p95 > 2s)
          description: The 95th percentile request latency has exceeded 2 seconds for the last 5 minutes.
        labels:
          severity: warning
        isPaused: false
        noDataState: NoData
        execErrState: Error

      - uid: attraccess-scrape-failures
        title: ScrapeFailures
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: attraccess-prometheus
            model:
              datasource:
                type: prometheus
                uid: attraccess-prometheus
              editorMode: code
              expr: up{job="attraccess"}
              instant: true
              intervalMs: 1000
              maxDataPoints: 43200
              range: false
              refId: A
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              expression: A
              reducer: last
              refId: B
              type: reduce
          - refId: C
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              conditions:
                - evaluator:
                    params: [1]
                    type: lt
                  operator:
                    type: and
                  query:
                    params: [C]
                  reducer:
                    params: []
                    type: last
                  type: query
              expression: B
              refId: C
              type: threshold
        for: 5m
        annotations:
          summary: Prometheus scrape failures
          description: Prometheus has been unable to scrape the Attraccess metrics endpoint for 5 minutes.
        labels:
          severity: warning
        isPaused: false
        noDataState: Alerting
        execErrState: Error

      - uid: attraccess-high-failed-login-rate
        title: HighFailedLoginRate
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: attraccess-prometheus
            model:
              datasource:
                type: prometheus
                uid: attraccess-prometheus
              editorMode: code
              expr: sum(rate(attraccess_auth_login_total{job="attraccess", status="fail"}[5m]))
              instant: true
              intervalMs: 1000
              maxDataPoints: 43200
              range: false
              refId: A
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              expression: A
              reducer: last
              refId: B
              type: reduce
          - refId: C
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              conditions:
                - evaluator:
                    params: [1]
                    type: gt
                  operator:
                    type: and
                  query:
                    params: [C]
                  reducer:
                    params: []
                    type: last
                  type: query
              expression: B
              refId: C
              type: threshold
        for: 5m
        annotations:
          summary: High rate of failed login attempts
          description: More than 1 failed login attempt per second over the last 5 minutes.
        labels:
          severity: warning
        isPaused: false
        noDataState: NoData
        execErrState: Error

      - uid: attraccess-overdue-maintenance
        title: OverdueMaintenance
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: attraccess-prometheus
            model:
              datasource:
                type: prometheus
                uid: attraccess-prometheus
              editorMode: code
              expr: attraccess_resource_maintenance_overdue{job="attraccess"}
              instant: true
              intervalMs: 1000
              maxDataPoints: 43200
              range: false
              refId: A
          - refId: B
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              expression: A
              reducer: last
              refId: B
              type: reduce
          - refId: C
            datasourceUid: __expr__
            relativeTimeRange:
              from: 0
              to: 0
            model:
              datasource:
                type: __expr__
                uid: __expr__
              conditions:
                - evaluator:
                    params: [0]
                    type: gt
                  operator:
                    type: and
                  query:
                    params: [C]
                  reducer:
                    params: []
                    type: last
                  type: query
              expression: B
              refId: C
              type: threshold
        for: 1h
        annotations:
          summary: Resources with overdue maintenance
          description: '{{ $values.B.Value }} resources have overdue maintenance.'
        labels:
          severity: warning
        isPaused: false
        noDataState: NoData
        execErrState: Error
```

  Notes for the implementing engineer:
  - All six rules use refId chain `A` (Prometheus instant query) → `B` (reduce last) → `C` (threshold). `condition: C` declares the firing condition.
  - `noDataState: Alerting` for the "service down" rules (we want to know if scraping itself stops). `NoData` for the rest (don't fire just because the metric series doesn't exist yet on a fresh install).
  - For `OverdueMaintenance`, the original Prometheus template `{{ $value }}` becomes `{{ $values.B.Value }}` — Grafana's templating addresses values by refId, not by the implicit Prometheus value.

- [ ] **Step 2: Verify YAML syntax**

  ```bash
  cd /Users/jappy/.t3/worktrees/Attraccess/t3code-b9d591bd
  python3 -c "import yaml; yaml.safe_load(open('monitoring/grafana/provisioning/alerting/rules.yml'))" && echo "YAML OK"
  ```

  Expected output: `YAML OK`. If it errors, fix the YAML (most likely indentation) and rerun.

- [ ] **Step 3: Commit**

  ```bash
  git add monitoring/grafana/provisioning/alerting/rules.yml
  git commit -m "$(cat <<'EOF'
  feat(alerting): provision Grafana alert rules ported from prometheus/alerts.yml

  All six rules in monitoring/prometheus/alerts.yml are now also loaded into Grafana
  on boot via provisioning, using the existing attraccess-prometheus datasource. The
  Prometheus-format file stays in place for users running classic Alertmanager.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Provision the default notification policy

**Files:**
- Create: `monitoring/grafana/provisioning/alerting/policies.yml`

- [ ] **Step 1: Write the file**

  ```yaml
  # /Users/jappy/.t3/worktrees/Attraccess/t3code-b9d591bd/monitoring/grafana/provisioning/alerting/policies.yml
  apiVersion: 1

  policies:
    - orgId: 1
      receiver: attraccess-default
      group_by:
        - alertname
        - severity
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
  ```

- [ ] **Step 2: Verify YAML syntax**

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('monitoring/grafana/provisioning/alerting/policies.yml'))" && echo "YAML OK"
  ```

  Expected output: `YAML OK`.

- [ ] **Step 3: Commit**

  ```bash
  git add monitoring/grafana/provisioning/alerting/policies.yml
  git commit -m "$(cat <<'EOF'
  feat(alerting): provision default notification policy routing to attraccess-default

  Root route groups firing alerts by alertname + severity and sends them to the
  receiver named 'attraccess-default'. Intervals (30s wait, 5m group, 4h repeat)
  mirror Alertmanager's defaults so operators upgrading from a classic stack see
  familiar pacing.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Provision the placeholder contact point

**Files:**
- Create: `monitoring/grafana/provisioning/alerting/contact-points.yml`

**Background:** The receiver named `attraccess-default` must exist so the policy in Task 2 validates at boot. We ship a single email receiver pointing at the RFC 2606 reserved domain `example.invalid` so it never delivers. The doc tells operators to edit this receiver in the UI (Grafana 11+ allows editing provisioned objects when `disableProvenance: true` is set on each provisioned item).

- [ ] **Step 1: Write the file**

  ```yaml
  # /Users/jappy/.t3/worktrees/Attraccess/t3code-b9d591bd/monitoring/grafana/provisioning/alerting/contact-points.yml
  apiVersion: 1

  contactPoints:
    - orgId: 1
      name: attraccess-default
      receivers:
        - uid: attraccess-default-email
          type: email
          disableResolveMessage: false
          settings:
            addresses: alerts@example.invalid
            singleEmail: false
  ```

- [ ] **Step 2: Verify YAML syntax**

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('monitoring/grafana/provisioning/alerting/contact-points.yml'))" && echo "YAML OK"
  ```

  Expected output: `YAML OK`.

- [ ] **Step 3: Commit**

  ```bash
  git add monitoring/grafana/provisioning/alerting/contact-points.yml
  git commit -m "$(cat <<'EOF'
  feat(alerting): provision placeholder attraccess-default contact point

  Empty email receiver so the default policy validates at boot. Operators are
  expected to edit it in the Grafana UI (Alerting > Contact points) to point at
  their channel of choice.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Local smoke test of provisioning

**Goal:** Boot the local dev stack (`docker-compose.yml`) and verify Grafana loads the three new provisioning files without errors.

- [ ] **Step 1: Stop any running stack and recreate**

  ```bash
  docker compose -f docker-compose.yml down monitoring-init grafana prometheus
  docker compose -f docker-compose.yml up -d --force-recreate monitoring-init prometheus grafana
  ```

  Expected: `monitoring-init` runs to completion (exit 0), `prometheus` and `grafana` come up.

- [ ] **Step 2: Inspect Grafana logs for provisioning errors**

  ```bash
  docker compose -f docker-compose.yml logs grafana 2>&1 | grep -iE "provisioning.alerting|level=error|alert rule"
  ```

  Expected: lines like `msg="starting to provision alerting"` followed by `msg="finished to provision alerting"`. No `level=error` lines. If errors appear (e.g., "invalid rule: condition refers to non-existent ref"), fix the offending YAML in `rules.yml`/`policies.yml`/`contact-points.yml`.

- [ ] **Step 3: Verify rules visible in UI**

  Open `http://localhost:3001` (or wherever Grafana is mapped). Log in. Go to **Alerting → Alert rules**. Expected: folder `Attraccess Alerts` shows six rules: `AttractapServiceDown`, `HighHttpErrorRate`, `HighRequestLatency`, `ScrapeFailures`, `HighFailedLoginRate`, `OverdueMaintenance`. State of each will be `Normal` or `NoData` depending on whether the underlying metric exists yet.

- [ ] **Step 4: Verify policy + contact point**

  In Grafana: **Alerting → Notification policies**. Expected: root policy shows `Contact point: attraccess-default`, group by `alertname, severity`, intervals as specified.

  **Alerting → Contact points**. Expected: `attraccess-default` listed.

- [ ] **Step 5: If anything failed, fix and re-run Step 1-4 before commit**

  Pay particular attention to:
  - "condition refers to non-existent ref" → typo in `refId`
  - "datasource not found" → ensure datasource UID matches `attraccess-prometheus` exactly
  - "duplicate uid" → rule UID collides with one already in the Grafana DB; rename or wipe the volume

- [ ] **Step 6: No commit at this task — smoke test is read-only**

---

## Task 5: Add hint comment to local dev compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Find the `grafana:` service block**

  ```bash
  grep -n "^  grafana:" docker-compose.yml
  ```

  Note the line number for the next step.

- [ ] **Step 2: Add a hint comment immediately under `grafana:`**

  Use the Edit tool with `old_string` matching the first line of the `grafana:` block as it exists in the file (`  grafana:` plus the next line for context) and insert a comment line. Read the file first to get the exact context.

  Conceptually, the result should look like:

  ```yaml
    grafana:
      # Alert rules ship pre-provisioned. Configure delivery in the Grafana UI:
      # Alerting > Contact points > edit "attraccess-default". See docs/en/monitoring/alerting.md.
      image: ...
  ```

- [ ] **Step 3: Verify the file still parses**

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml'))" && echo "YAML OK"
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add docker-compose.yml
  git commit -m "$(cat <<'EOF'
  chore(compose): point operators at the new alerting docs from docker-compose.yml

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: Add hint comment to Coolify compose

**Files:**
- Modify: `coolify.docker-compose.yml`

- [ ] **Step 1: Read the file to find the `grafana:` service block**

  Read `coolify.docker-compose.yml` and locate the `grafana:` service. Note the exact `image:` line that follows it.

- [ ] **Step 2: Insert the same comment block under `grafana:`**

  ```yaml
    grafana:
      # Alert rules ship pre-provisioned. Configure delivery in the Grafana UI:
      # Alerting > Contact points > edit "attraccess-default". See docs/en/monitoring/alerting.md.
      image: ...
  ```

- [ ] **Step 3: Verify YAML parse**

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('coolify.docker-compose.yml'))" && echo "YAML OK"
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add coolify.docker-compose.yml
  git commit -m "$(cat <<'EOF'
  chore(compose): point operators at the new alerting docs from the Coolify compose

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Add hint comment to services compose

**Files:**
- Modify: `services.docker-compose.yml`

- [ ] **Step 1: Same edit as Tasks 5 and 6** — read the file, find `grafana:`, insert the comment block under it.

- [ ] **Step 2: Verify YAML parse**

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('services.docker-compose.yml'))" && echo "YAML OK"
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add services.docker-compose.yml
  git commit -m "$(cat <<'EOF'
  chore(compose): point operators at the new alerting docs from services.docker-compose.yml

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 8: Write the English alerting doc — concept overview + quickstart

**Files:**
- Create: `docs/en/monitoring/alerting.md`

This task creates the file with the first two sections only. Subsequent tasks append additional sections to the same file to keep each task bite-sized.

- [ ] **Step 1: Create the file with concept + quickstart**

  ```markdown
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
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/en/monitoring/alerting.md
  git commit -m "$(cat <<'EOF'
  docs(alerting): add EN alerting page with concept overview and quickstart

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 9: EN doc — native Grafana channels

**Files:**
- Modify: `docs/en/monitoring/alerting.md`

- [ ] **Step 1: Append the native channels section**

  Append the following to `docs/en/monitoring/alerting.md`:

  ````markdown

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
  ````

- [ ] **Step 2: Commit**

  ```bash
  git add docs/en/monitoring/alerting.md
  git commit -m "$(cat <<'EOF'
  docs(alerting): add EN section for native Grafana channels (email, Slack, Discord, etc.)

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 10: EN doc — webhook-based open-source channels

**Files:**
- Modify: `docs/en/monitoring/alerting.md`

- [ ] **Step 1: Append the webhook section**

  ````markdown

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
  ````

- [ ] **Step 2: Commit**

  ```bash
  git add docs/en/monitoring/alerting.md
  git commit -m "$(cat <<'EOF'
  docs(alerting): add EN section for webhook-based maker/OSS channels (ntfy, Gotify, Matrix, etc.)

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 11: EN doc — testing, silences, troubleshooting

**Files:**
- Modify: `docs/en/monitoring/alerting.md`

- [ ] **Step 1: Append the closing sections**

  ````markdown

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
  ````

- [ ] **Step 2: Commit**

  ```bash
  git add docs/en/monitoring/alerting.md
  git commit -m "$(cat <<'EOF'
  docs(alerting): add EN testing, silences, and troubleshooting sections

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 12: Link alerting from EN monitoring overview

**Files:**
- Modify: `docs/en/monitoring/overview.md`

- [ ] **Step 1: Read the file** and locate the "Getting Started" and "See Also" sections (currently ending the file).

- [ ] **Step 2: Add an alerting bullet to "Getting Started"**

  Use Edit to insert a fourth step right after the third "Explore the available metrics" line:

  ```
  4. [Configure alerting and notifications](monitoring/alerting.md)
  ```

- [ ] **Step 3: Add an alerting entry to "See Also"**

  Use Edit to add after the "Metrics Reference" line:

  ```
  - [Alerting](monitoring/alerting.md) -- Configure notifications for the pre-provisioned alert rules
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add docs/en/monitoring/overview.md
  git commit -m "$(cat <<'EOF'
  docs(monitoring): link the new EN alerting page from the overview

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 13: Write the German alerting doc

**Files:**
- Create: `docs/de/monitoring/alerting.md`

- [ ] **Step 1: Translate the EN alerting page to German**

  Mirror the structure of `docs/en/monitoring/alerting.md` section-by-section, translating headings and prose to German. Keep:
  - All code blocks unchanged
  - Field names like `addresses:`, `GF_SMTP_HOST=` unchanged
  - Channel names ("Slack", "Discord", "Telegram", "ntfy.sh", etc.) unchanged
  - URL fragments unchanged

  Tone reference: read `docs/de/monitoring/overview.md` and `docs/de/monitoring/setup.md` to match the existing voice (formal "Sie", direct sentences). Use the same heading hierarchy as the EN doc.

  Suggested top-level structure (rough German equivalents):
  - `# Alarmierung`
  - `## Wie Alarme fließen`
  - `## Schnellstart (5 Minuten)`
  - `## Native Grafana-Kanäle` (subsections: `### E-Mail`, `### Slack Incoming Webhook`, `### Discord Webhook`, `### Telegram`, `### Microsoft Teams`, `### PagerDuty`, `### Pushover`, `### OpsGenie`)
  - `## Open-Source-/Maker-Kanäle über Generic Webhook` (subsections: `### ntfy.sh`, `### Gotify`, `### Matrix (über matrix-hookshot)`, `### Signal (über signal-cli-rest-api)`, `### Mattermost`, `### Rocket.Chat`, `### Apprise (universeller Bridge)`)
  - `## Alarme testen`
  - `## Stummschaltungen und Mute Timings`
  - `## Fehlerbehebung`

- [ ] **Step 2: Verify file exists and is non-empty**

  ```bash
  wc -l docs/de/monitoring/alerting.md
  ```

  Expected: comparable line count to the EN page (within ±20%).

- [ ] **Step 3: Commit**

  ```bash
  git add docs/de/monitoring/alerting.md
  git commit -m "$(cat <<'EOF'
  docs(alerting): add DE alerting page mirroring the EN structure

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 14: Link alerting from DE monitoring overview

**Files:**
- Modify: `docs/de/monitoring/overview.md`

- [ ] **Step 1: Read the file** to find the equivalents of "Getting Started" / "See Also" (likely "Erste Schritte" / "Siehe auch").

- [ ] **Step 2: Add the alerting page to both sections** in German:
  - Getting-Started bullet: `4. [Alarmierung und Benachrichtigungen konfigurieren](monitoring/alerting.md)`
  - See-Also bullet: `- [Alarmierung](monitoring/alerting.md) -- Benachrichtigungen für die vorkonfigurierten Alarmregeln einrichten`

- [ ] **Step 3: Commit**

  ```bash
  git add docs/de/monitoring/overview.md
  git commit -m "$(cat <<'EOF'
  docs(monitoring): link the new DE alerting page from the overview

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 15: End-to-end smoke test on a real deployment

**Goal:** Validate the whole pipeline against a real Attraccess install. The Attraktor stack (`https://prometheus.attraccess.cloud.attraktor.org`) is the canonical target since this work was motivated by an install on that stack.

- [ ] **Step 1: Build and push the image from this branch**

  Coordinate with the operator of the target stack to either:
  - Build locally and push to a private registry, or
  - Tag the branch as a nightly via the existing `docker-nightly-latest.yml` workflow (push to a temp branch named `main-test` or wait for merge to `main`).

  Set the stack's `ATTRACCESS_IMAGE` env var to the new tag.

- [ ] **Step 2: Redeploy the stack via Coolify**

  ```bash
  coolify --context attraktor service restart grck5rc7uk5pbcu59ury1u0g
  ```

  (Service uuid taken from the conversation context for the Attraktor monitoring stack.)

- [ ] **Step 3: Verify Grafana logs are clean**

  Have the operator run:

  ```bash
  sudo docker logs grafana-grck5rc7uk5pbcu59ury1u0g 2>&1 | grep -iE "provisioning.alerting|level=error"
  ```

  Expected: `starting to provision alerting` → `finished to provision alerting`. No `level=error`.

- [ ] **Step 4: Verify the UI shows everything**

  Open Grafana on the deployed stack, log in:
  - Alerting → Alert rules → folder "Attraccess Alerts" has 6 rules
  - Notification policies → root receiver is `attraccess-default`
  - Contact points → `attraccess-default` exists

- [ ] **Step 5: Configure one real contact point and test**

  Have the operator pick their preferred channel (Discord webhook is fast), edit `attraccess-default` in the UI, paste the webhook URL, click **Test**, confirm a notification arrives.

- [ ] **Step 6: Force a real alert**

  Stop Attraccess for 3 minutes (or block the metrics endpoint). Confirm:
  - Prometheus shows `up == 0` for `job="attraccess"`
  - Grafana shows `AttractapServiceDown` in `Firing` state after 2 min
  - The configured channel receives the notification

  Restart Attraccess; confirm the resolved notification (if `disableResolveMessage: false`).

- [ ] **Step 7: No commit at this task — smoke test only**

---

## Task 16: Open the PR

- [ ] **Step 1: Push the branch**

  ```bash
  git push -u origin feat/grafana-alerting-defaults
  ```

- [ ] **Step 2: Open the PR**

  ```bash
  gh pr create --title "feat(alerting): pre-provision Grafana alert rules and add alerting docs" --body "$(cat <<'EOF'
  ## Summary
  - Port the six rules from `monitoring/prometheus/alerts.yml` into Grafana provisioning (`monitoring/grafana/provisioning/alerting/rules.yml`).
  - Ship a default notification policy and a placeholder `attraccess-default` contact point so operators only have to edit one channel in the UI.
  - Add bilingual operator docs covering native Grafana channels (email, Slack, Discord, Telegram, Teams, PagerDuty, Pushover, OpsGenie) and webhook-based maker/OSS channels (ntfy, Gotify, Matrix, Signal, Mattermost, Rocket.Chat, Apprise).
  - Point the three compose files at the new docs via a one-line comment.

  Spec: `docs/superpowers/specs/2026-05-11-grafana-alerting-defaults-design.md`
  Plan: `docs/superpowers/plans/2026-05-11-grafana-alerting-defaults.md`

  ## Test plan
  - [ ] Local dev stack boots, Grafana provisioning logs clean
  - [ ] Six rules visible in Grafana UI under "Attraccess Alerts" folder
  - [ ] Default policy points at `attraccess-default`
  - [ ] Edit `attraccess-default` to a real Discord webhook, "Test" succeeds
  - [ ] Stop Attraccess >2 min on a deployed stack, `AttractapServiceDown` fires and the notification arrives

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 3: Report the PR URL back to the user**

---

## Self-Review (already performed)

**Spec coverage:** Every component listed in the design spec maps to at least one task — rules.yml (Task 1), policies.yml (Task 2), contact-points.yml (Task 3), EN docs (Tasks 8-12), DE docs (Tasks 13-14), compose hints (Tasks 5-7), init container (no change needed, verified in Task 4). The smoke-test plan from the spec is Task 4 (local) and Task 15 (real deployment).

**Placeholder scan:** No TBD/TODO markers in task bodies. Every code step has a complete code block. Task 13 (DE doc) is a translation task — the structure is fully specified, prose is delegated to the implementer because writing fluent German prose is a translation judgement call rather than a missing detail.

**Type consistency:** The contact-point name `attraccess-default` is used identically in `rules.yml` (via the policy), `policies.yml`, `contact-points.yml`, and both docs. Datasource UID `attraccess-prometheus` matches the existing `monitoring/grafana/provisioning/datasources/prometheus.yml`. Folder name "Attraccess Alerts" used consistently.
