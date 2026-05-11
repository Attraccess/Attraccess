# Alarmierung

Attraccess wird mit vorkonfigurierten Grafana-Alarmregeln ausgeliefert. Sobald Sie einen Kontaktpunkt eingerichtet haben, erhalten Sie Benachrichtigungen, wenn etwas nicht stimmt.

## Wie Alarme fließen

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

- **Alarmregeln** werten Prometheus-Abfragen nach einem festgelegten Zeitplan aus. Standardmäßig werden sechs Regeln mitgeliefert: Dienst nicht erreichbar, hohe Fehlerrate, hohe Latenz, Scrape-Fehler, gehäufte fehlgeschlagene Anmeldeversuche sowie überfällige Wartung.
- **Notification policy** entscheidet, an welchen Kontaktpunkt ein Alarm weitergeleitet wird. Eine einzige Standard-Policy leitet alles an einen Empfänger namens `attraccess-default` weiter.
- **Contact point** ist der Kanal — Slack-Webhook, E-Mail-Adresse, Discord-Webhook usw. Diesen konfigurieren Sie in der Grafana-Oberfläche.

## Schnellstart (5 Minuten)

1. Öffnen Sie Grafana (`/grafana` auf Ihrem Attraccess-Host) und melden Sie sich als Administrator an.
2. Navigieren Sie zu **Alerting → Contact points**.
3. Klicken Sie auf das Stiftsymbol bei `attraccess-default`.
4. Ändern Sie **Integration** auf Ihren bevorzugten Kanal (Email, Slack, Discord, Telegram usw.).
5. Füllen Sie die kanalspezifischen Felder aus. Die folgenden Abschnitte enthalten fertige Feldwerte zum Kopieren.
6. Klicken Sie auf **Test** — wenn die Benachrichtigung ankommt, sind Sie fertig. Andernfalls lesen Sie den Abschnitt zur Fehlerbehebung.
7. Speichern Sie.

Das war es — alle sechs vorkonfigurierten Regeln leiten nun an Ihren Kanal weiter.

## Native Grafana-Kanäle

Diese Integrationen sind in Grafana direkt verfügbar — wählen Sie die Integration im Kontaktpunkt-Editor und füllen Sie die Felder aus.

### E-Mail

Für E-Mail muss SMTP im Grafana-Container konfiguriert sein. Setzen Sie die folgenden Umgebungsvariablen beim `grafana:`-Dienst in Ihrer Compose-Datei (ersetzen Sie die Werte durch die Daten Ihres SMTP-Relays):

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

Starten Sie Grafana neu. Dann im Kontaktpunkt-Editor:
- **Integration**: Email
- **Addresses**: kommagetrennte Empfänger

### Slack Incoming Webhook

Erstellen Sie eine Webhook-URL: <https://api.slack.com/messaging/webhooks>.
- **Integration**: Slack
- **Webhook URL**: `https://hooks.slack.com/services/T.../B.../...`
- Lassen Sie Token und Empfänger leer, wenn Sie den Webhook-Modus verwenden.

### Discord Webhook

Kanaleinstellungen → Integrationen → Webhooks → Neuer Webhook → URL kopieren.
- **Integration**: Discord
- **Webhook URL**: `https://discord.com/api/webhooks/.../...`
- **Use Discord username**: optional
- **Avatar URL**: optional

### Telegram

Erstellen Sie einen Bot über [@BotFather](https://t.me/BotFather) und notieren Sie das Token. Senden Sie eine Nachricht an Ihren Bot, rufen Sie dann `https://api.telegram.org/bot<TOKEN>/getUpdates` auf und ermitteln Sie die Chat-`id`.
- **Integration**: Telegram
- **BOT API Token**: von BotFather
- **Chat ID**: numerische ID aus `getUpdates`

### Microsoft Teams

Kanal → Connectors → Incoming Webhook → URL kopieren.
- **Integration**: Microsoft Teams
- **URL**: Webhook-URL

### PagerDuty

Erstellen Sie in PagerDuty einen Dienst mit einer Events-API-v2-Integration und kopieren Sie den Integrationsschlüssel.
- **Integration**: PagerDuty
- **Integration Key**: von PagerDuty
- **Severity**: wird standardmäßig aus dem `severity`-Label der Regel abgeleitet (bereits in den vorkonfigurierten Regeln gesetzt)

### Pushover

- **Integration**: Pushover
- **API Token**: von <https://pushover.net/apps/build>
- **User Key**: aus Ihrem Pushover-Dashboard

### OpsGenie

- **Integration**: OpsGenie
- **API Key**: aus dem OpsGenie-Tab für Integrationen
- **API URL**: leer lassen für den Standardwert

## Open-Source-/Maker-Kanäle über Generic Webhook

Wählen Sie die **Webhook**-Integration im Kontaktpunkt-Editor und verwenden Sie die unten angegebene URL sowie die HTTP-Methode. Grafana sendet per POST einen JSON-Körper im Format der [Grafana-Webhook-Nutzlast](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/).

Viele Dienste akzeptieren dieses Format direkt. Für Dienste, die ein anderes Format benötigen, übersetzt eine kleine Bridge (z. B. eine [Apprise](https://github.com/caronc/apprise)-Instanz, ein [Hookshot](https://matrix-org.github.io/matrix-hookshot/latest/)-Container oder ein einfacher Reverse-Proxy) die Nutzlast.

### ntfy.sh

- **URL**: `https://ntfy.sh/<your-topic>` (selbst gehostet oder öffentlicher Dienst)
- **HTTP Method**: POST
- **Authorization**: keine, oder Basic Auth falls Ihre ntfy-Instanz dies erfordert
- Körper-Templating: Standard beibehalten — ntfy zeigt das JSON in seiner Oberfläche unverändert an. Für eine ansprechendere Ausgabe können Sie ntfy hinter einem Skript betreiben, das `commonAnnotations.summary` ausliest.

### Gotify

- **URL**: `https://<gotify-host>/message?token=<app-token>`
- **HTTP Method**: POST
- Körper-Templating: Standard beibehalten.

### Matrix (über matrix-hookshot)

Hookshot stellt pro Raum einen generischen Webhook-Endpunkt bereit.
- Im Hookshot-Raumadmin: Erstellen Sie einen generischen Webhook und kopieren Sie die URL.
- **URL**: Hookshot-URL
- **HTTP Method**: POST

### Signal (über signal-cli-rest-api)

Betreiben Sie [`signal-cli-rest-api`](https://github.com/bbernhard/signal-cli-rest-api) neben Grafana. Verwenden Sie die Webhook-Integration mit einer kleinen Bridge, die Anfragen an `/v2/send` weiterleitet. Das Schema der Grafana-Nutzlast ist oben dokumentiert; ein Sidecar mit etwa zehn Zeilen Node.js oder Python ist in der Regel ausreichend.

### Mattermost

Mattermost Incoming Webhooks akzeptieren Slack-formatierte Nutzlasten. Sie haben zwei Möglichkeiten:
- Verwenden Sie die **Slack**-Integration in Grafana und richten Sie die Webhook-URL auf Mattermost aus (`https://mattermost.example.com/hooks/...`), oder
- Verwenden Sie die **Webhook**-Integration mit Standardkörper für das generische Mattermost-Format.

### Rocket.Chat

Rocket.Chat Incoming Webhooks akzeptieren ebenfalls Slack-formatierte Nutzlasten — derselbe Trick wie bei Mattermost.

### Apprise (universeller Bridge)

[Apprise](https://github.com/caronc/apprise) stellt einen HTTP-Endpunkt bereit, der Nachrichten an über 80 Benachrichtigungsdienste weiterleitet (Twilio, Pushbullet, XMPP, IRC usw.).
- **URL**: `https://<apprise-host>/notify/<token>`
- **HTTP Method**: POST

## Alarme testen

Jeder Kontaktpunkt verfügt im Editor über eine **Test**-Schaltfläche. Diese sendet einen synthetischen Alarm über denselben Pfad, den auch echte Alarme nehmen würden. Damit lässt sich überprüfen:
- ob die Webhook-URL bzw. die SMTP-Zugangsdaten korrekt sind,
- ob Ihr Kanal die Nachricht angemessen darstellt,
- ob keine Firewall den Weg blockiert.

Für einen End-to-End-Test, bei dem eine echte Regel ausgelöst wird, stoppen Sie den Attraccess-Container für mehr als 2 Minuten. `AttractapServiceDown` wird dann als `critical` ausgelöst und über Ihren Kontaktpunkt zugestellt.

## Stummschaltungen und Mute Timings

Beide Funktionen finden Sie unter **Alerting → Silences** und **Alerting → Notification policies → Mute timings**:
- **Silences** sind einmalige Stummschaltungen ("Diese Meldung für die nächsten 4 Stunden unterdrücken"). Verwenden Sie diese während geplanter Wartungsarbeiten.
- **Mute timings** sind wiederkehrende Zeitfenster ("Sonntags von 02:00–06:00 UTC keine Benachrichtigungen"). Diese können Sie in **Notification policies** der Root-Policy zuweisen.

Beide werden nicht vorkonfiguriert ausgeliefert — richten Sie sie bei Bedarf in der Oberfläche ein.

## Fehlerbehebung

**Alarm wird in Prometheus `/alerts` angezeigt, aber nicht in Grafana**

Höchstwahrscheinlich konnte die Regel nicht geladen werden. Prüfen Sie `docker logs grafana | grep provisioning.alerting`. Häufige Ursachen:
- Tippfehler bei der Datasource-UID in `rules.yml` — diese muss exakt mit der UID in `monitoring/grafana/provisioning/datasources/prometheus.yml` übereinstimmen (`attraccess-prometheus`).
- Doppelte Regel-UID in der Grafana-Datenbank aus einem früheren Betrieb. Löschen Sie das Volume `grafana-data` und stellen Sie den Dienst neu bereit.

**Test-Schaltfläche des Kontaktpunkts schlägt fehl**

- Webhook-URL: 401/403 → Token falsch. 404 → Tippfehler im URL-Pfad. Verbindung abgelehnt → Netzwerk- oder Firewall-Problem.
- E-Mail: Prüfen Sie `docker logs grafana | grep smtp`. Der häufigste Fehler ist eine Nichtübereinstimmung von `GF_SMTP_STARTTLS_POLICY` mit den Anforderungen Ihres Relays.
- Discord: Discord begrenzt Webhook-Anfragen; eine 429-Antwort bedeutet, dass Sie zu schnell senden.

**Warnmeldung „This object is provisioned and read-only" in der Oberfläche**

Die Provisionierungsdateien werden mit `disableProvenance: true` für jeden Eintrag ausgeliefert, daher sollte diese Meldung nicht erscheinen. Falls doch, stellen Sie sicher, dass das Flag in Ihrer lokalen `rules.yml`/`policies.yml`/`contact-points.yml` gesetzt ist, und stellen Sie den Dienst neu bereit.

**Keine Benachrichtigungen während erwarteter Ausfälle**

- Prüfen Sie **Alerting → Alert rules** — wird die Regel ausgelöst? Falls nicht, fehlt die zugrundeliegende Metrik möglicherweise bei einer Neuinstallation ohne bisherigen Datenverkehr.
- Prüfen Sie **Alerting → History**, ob Grafana eine Zustellung versucht hat.
- Sehen Sie sich `docker logs grafana | grep -i alert` auf Zustellungsfehler an.
