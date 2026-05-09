# Prometheus & Grafana einrichten

Diese Anleitung behandelt die Einrichtung von Prometheus und Grafana zur Erfassung und Visualisierung von Attraccess-Metriken. Attraccess bündelt vorkonfigurierte Dashboards, Datenquellen-Provisioning und eine Prometheus-Scrape-Konfiguration im `attraccess`-Image unter `/app/share/monitoring/` — ein Klon des Repositorys ist für das Deployment des Stacks nicht nötig.

## Funktionsweise des gebündelten Monitorings

Konfigurationen werden im `attraccess`-Image ausgeliefert:

```
/app/share/monitoring/
  prometheus/
    prometheus.yml      # Scrape-Konfiguration für den attraccess-Job
    alerts.yml          # Alarmregeln
  grafana/
    provisioning/
      datasources/
        prometheus.yml  # Verbindet Grafana mit Prometheus
      dashboards/
        dashboards.yml  # Dashboard-Provider-Konfiguration
    dashboards/
      attraccess-overview.json
      node-runtime.json
```

Ein kurzlebiger Hilfsdienst `monitoring-init` startet dasselbe Image, kopiert die Dateien beim Stack-Start in benannte Volumes und beendet sich. Prometheus und Grafana mounten diese Volumes nur lesend und hängen von einem erfolgreichen Abschluss von `monitoring-init` ab (`service_completed_successfully`). Dadurch lässt sich die Compose-Datei eigenständig deployen — Operatoren müssen weder das Repository klonen noch ein lokales `./monitoring`-Verzeichnis pflegen.

## Coolify-Deployment

Verwenden Sie [`coolify.docker-compose.yml`](https://github.com/Attraccess/Attraccess/blob/main/coolify.docker-compose.yml) aus dem Repo-Root. Coolify generiert FQDN-Routing und Session-Secrets automatisch über die Magic-Env-Konventionen `SERVICE_FQDN_*`, `SERVICE_URL_*` und `SERVICE_BASE64_*`. Nach dem Deployment:

1. Erstellen Sie einen Metriken-API-Schlüssel unter **Attraccess > Einstellungen > Metrics & Monitoring** ([Einrichtung](monitoring/setup.md)) und kopieren Sie ihn (der Wert wird nur einmal angezeigt)
2. Setzen Sie in Coolify die Umgebungsvariable `PROMETHEUS_METRICS_API_KEY=<Ihr-Schlüssel>` für den Service und triggern Sie ein Redeploy — `monitoring-init` schreibt den Bearer-Token bei jedem Start in die Prometheus-Konfiguration (siehe [Bearer-Token setzen](#bearer-token-setzen))
3. Öffnen Sie Grafana unter der von Coolify zugewiesenen FQDN und melden Sie sich mit `admin` / `admin` an. Grafana erzwingt einen Passwortwechsel beim ersten Login. Um Zugangsdaten vorzubelegen, überschreiben Sie `GRAFANA_ADMIN_USER` und `GRAFANA_ADMIN_PASSWORD` im Coolify-Env-Tab vor dem ersten Deploy.

Datenquelle und Dashboards werden automatisch provisioniert — keine manuelle Grafana-Konfiguration nötig.

## Manuelles Docker-Compose-Setup

Außerhalb von Coolify fügen Sie folgende Dienste zu Ihrer `docker-compose.yml` hinzu:

```yaml
services:
  # ... Ihr bestehender attraccess-Dienst ...

  monitoring-init:
    image: ghcr.io/attraccess/attraccess:latest
    restart: 'no'
    entrypoint: ['/bin/sh', '-c']
    environment:
      - PROMETHEUS_METRICS_API_KEY=${PROMETHEUS_METRICS_API_KEY:-}
    command:
      - >
        set -e &&
        cp -rT /app/share/monitoring/prometheus /prometheus-config &&
        if [ -n "$$PROMETHEUS_METRICS_API_KEY" ]; then
          sed -i "s|# bearer_token: '<your-metrics-api-key>'|bearer_token: '$$PROMETHEUS_METRICS_API_KEY'|" /prometheus-config/prometheus.yml;
        fi &&
        cp -rT /app/share/monitoring/grafana/provisioning /grafana-provisioning &&
        cp -rT /app/share/monitoring/grafana/dashboards /grafana-dashboards
    volumes:
      - prometheus-config:/prometheus-config
      - grafana-provisioning:/grafana-provisioning
      - grafana-dashboards:/grafana-dashboards

  prometheus:
    image: prom/prometheus:v3.11.3
    restart: unless-stopped
    expose:
      - '9090'
    volumes:
      - prometheus-config:/etc/prometheus:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
    depends_on:
      monitoring-init:
        condition: service_completed_successfully

  grafana:
    image: grafana/grafana:13.0.1
    restart: unless-stopped
    expose:
      - '3000'
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-attraccess}
    volumes:
      - grafana-provisioning:/etc/grafana/provisioning:ro
      - grafana-dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    depends_on:
      monitoring-init:
        condition: service_completed_successfully

volumes:
  prometheus-config:
  prometheus-data:
  grafana-data:
  grafana-provisioning:
  grafana-dashboards:
```

### Umgebungsvariablen

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `GRAFANA_ADMIN_USER` | `admin` | Grafana-Admin-Benutzername (nur bei erstem Init wirksam — siehe Fehlerbehebung) |
| `GRAFANA_ADMIN_PASSWORD` | `attraccess` | Grafana-Admin-Passwort (nur bei erstem Init wirksam — siehe Fehlerbehebung) |
| `PROMETHEUS_METRICS_API_KEY` | _(leer)_ | Bearer-Token, mit dem Prometheus Attraccess scrapt. Wenn gesetzt, schreibt `monitoring-init` ihn in `prometheus.yml`. Beim ersten Deploy leer lassen, dann in Attraccess einen Schlüssel erzeugen und nachreichen. |

> [!WARNING]
> Ändern Sie das Standard-Grafana-Passwort vor der Produktivstellung.

## Bearer-Token setzen

Die gebündelte `prometheus.yml` liefert den Bearer-Token auskommentiert aus — Prometheus benötigt ihn zur Authentifizierung gegen Attraccess `/api/metrics`. Da Attraccess den Metriken-API-Schlüssel nur einmalig anzeigt, ist der Ablauf einseitig: Schlüssel in der Attraccess-UI erzeugen, dann als Umgebungsvariable in den Stack einspielen.

1. Stack ohne `PROMETHEUS_METRICS_API_KEY` deployen. Attraccess startet; Prometheus-Scrapes liefern bis zu Schritt 3 `401` — das ist erwartet.
2. Unter **Attraccess > Einstellungen > Metrics & Monitoring** einen API-Schlüssel generieren und kopieren (Wert wird nur einmal angezeigt).
3. `PROMETHEUS_METRICS_API_KEY=<Ihr-Schlüssel>` als Umgebungsvariable im Stack setzen:
   - **Coolify**: im Service-Env-Tab eintragen und Redeploy auslösen.
   - **Manuelles Compose**: in die `.env` aufnehmen (oder in der Shell exportieren), dann `docker compose up -d --force-recreate monitoring-init prometheus`.
4. Beim Start führt `monitoring-init` aus:

   ```sh
   sed -i "s|# bearer_token: '<your-metrics-api-key>'|bearer_token: '$PROMETHEUS_METRICS_API_KEY'|" /prometheus-config/prometheus.yml
   ```

   Prometheus mountet die umgeschriebene Konfiguration anschließend nur lesend und authentifiziert sich erfolgreich.

> [!NOTE]
> `monitoring-init` läuft bei jedem Stack-Start und schreibt die Datei aus dem gebündelten Image neu — solange `PROMETHEUS_METRICS_API_KEY` gesetzt bleibt, wird der Bearer-Token automatisch erneut angewendet. Ein Schlüsselwechsel erfordert das Erzeugen eines neuen Schlüssels in Attraccess, das Aktualisieren der Umgebungsvariable und ein Redeploy.

### Gebündelte Scrape-Konfiguration

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - '/etc/prometheus/alerts.yml'

scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['attraccess:3000']
    scrape_interval: 10s
    # bearer_token: '<Ihr-Metriken-API-Schlüssel>'
```

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| `scrape_interval` (Job) | `10s` | Scrape-Intervall pro Job für den Attraccess-Job |
| `scrape_interval` (global) | `15s` | Standard-Scrape-Intervall für alle anderen Jobs |
| `evaluation_interval` | `15s` | Wie oft Prometheus Aufzeichnungs- und Alarmregeln auswertet |

> [!TIP]
> Ein 10-Sekunden-Scrape-Intervall bietet gute Granularität für die meisten Dashboards. Erhöhen Sie es auf 30s oder 60s, wenn Sie den Ressourcenverbrauch reduzieren möchten.

## Grafana-Provisioning

Das gebündelte Provisioning konfiguriert die Prometheus-Datenquelle und lädt beim ersten Start beide Dashboards. Die Datenquelle (`provisioning/datasources/prometheus.yml`):

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    uid: attraccess-prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

Der Grafana-Service nutzt `service_name: prometheus` für die netzinterne Auflösung — keine zusätzliche Konfiguration nötig.

## Zugriff auf Grafana

1. Öffnen Sie Grafana im Browser (Coolify: zugewiesene FQDN; manuelles Setup: hinter Ihrem Reverse-Proxy oder `localhost:3000`)
2. Melden Sie sich mit den konfigurierten Admin-Zugangsdaten an
3. Navigieren Sie zu **Dashboards** > Ordner **Attraccess**
4. Öffnen Sie das **Attraccess Overview**- oder **Node Runtime**-Dashboard

> [!NOTE]
> Hinter einem Reverse-Proxy muss `GF_SERVER_ROOT_URL` die vollständige externe URL sein (z. B. `https://grafana.example.com`) — ohne Schema oder mit Port-Suffix setzt Grafana Cookies auf der falschen Domain und der Login springt scheinbar erfolgreich zurück zur Login-Seite. Coolifys `SERVICE_URL_GRAFANA` löst sich auf den korrekten Wert auf.

## Vorgefertigte Dashboards

### Attraccess Overview

Das Haupt-Dashboard enthält Panels für:

| Panel | Beschreibung |
|-------|--------------|
| **HTTP Request Rate** | Anfragen pro Sekunde aufgeschlüsselt nach Route |
| **HTTP Request Latency** | p50-, p95- und p99-Antwortzeiten |
| **HTTP Error Rate** | 4xx- und 5xx-Fehler über die Zeit |
| **Authentication** | Erfolgreiche und fehlgeschlagene Anmeldeversuche, SSO-Nutzung |
| **Users** | Registrierte Gesamtbenutzer und neue Registrierungen |
| **Resources** | Gesamtressourcen und aktive Nutzungssitzungen |
| **Resource Usage Duration** | p50- und p95-Sitzungsdauern |
| **Resource Usage Sessions** | Gestartete und beendete Sitzungen über die Zeit |
| **Connected Devices** | Anzahl verbundener Attractap-NFC-Leser |
| **NFC Tap Events** | Tap-Ereignisse über die Zeit |
| **Billing Transactions** | Transaktionsanzahl nach Status |
| **Emails Sent** | E-Mail-Zustellungsanzahl |
| **System Overview** | Projekte, Gruppen, MQTT-Server, überfällige Wartung |
| **Maintenance Events** | Wartungsaktivität nach Typ |

### Node Runtime

Das Laufzeit-Dashboard enthält Panels für:

| Panel | Beschreibung |
|-------|--------------|
| **CPU Usage** | Benutzer- und System-CPU-Zeit |
| **Memory Usage** | Verwendeter Heap, Gesamt-Heap, RSS, externer Speicher |
| **Event Loop Lag** | Aktuelle Verzögerung und p99-Perzentil |
| **Active Handles & Requests** | Offene Handles und ausstehende Anfragen |

## Anpassen der gebündelten Konfigurationen

Da die Konfigurationen im `attraccess`-Image liegen und bei jedem Stack-Start in benannte Volumes kopiert werden, werden direkte Änderungen an den Volumes (außer am Bearer-Token) beim Redeploy überschrieben. Anpassungen:

- **Scrape-Konfiguration / Alarmregeln**: `monitoring/prometheus/*.yml` im Fork/PR ändern und Image neu bauen.
- **Dashboards / Datenquellen**: `monitoring/grafana/**` im Fork/PR ändern und Image neu bauen.
- **Per-Deploy-Overrides**: Compose mit einer `docker-compose.override.yml` erweitern, die eigene Dateien über den Mount-Punkt des benannten Volumes legt.

## Prometheus extern verfügbar machen (optional)

Standardmäßig ist Prometheus nur intern verfügbar (keine `ports`-Zuordnung). Wenn Sie direkten Zugriff zum Debuggen benötigen:

```yaml
  prometheus:
    # ...
    ports:
      - '9090:9090'
```

> [!WARNING]
> Stellen Sie Prometheus nicht ohne Authentifizierung ins öffentliche Internet. Verwenden Sie einen Reverse-Proxy mit Zugriffskontrolle, wenn externer Zugriff erforderlich ist.

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| Prometheus zeigt Ziel als "DOWN" mit `401` | Bearer-Token fehlt oder ist falsch — `PROMETHEUS_METRICS_API_KEY` auf den in Attraccess erzeugten Wert setzen und Stack neu deployen, sodass `monitoring-init` die Konfiguration neu schreibt |
| Prometheus zeigt Ziel als "DOWN" ohne Auth-Fehler | Prüfen, ob der `attraccess`-Dienst vom Prometheus-Container erreichbar ist (Netzwerk, Hostname `attraccess:3000`) |
| Keine Daten in Grafana-Dashboards | Bestätigen Sie, dass Prometheus läuft und scrapt. Prüfen Sie die Zielseite unter `http://prometheus:9090/targets` |
| Grafana-Login springt zurück zur Login-Seite | `GF_SERVER_ROOT_URL` ist falsch — muss die vollständige externe URL mit Schema (`https://...`) sein, ohne Port-Suffix hinter einem Reverse-Proxy |
| Grafana-Login fehlgeschlagen (falsches Passwort) | `GF_SECURITY_ADMIN_PASSWORD` greift nur beim ersten Init. Nach Anlage des `grafana-data`-Volumes Passwort via `grafana-cli admin reset-admin-password` im Container ändern oder Volume löschen, um neu zu initialisieren |
| Dashboards erscheinen nicht | Prüfen, ob `monitoring-init` mit Code 0 beendet wurde (`docker compose ps -a monitoring-init`). Wenn nicht, Logs prüfen und Stack neu starten |
| Veraltete Metriken nach Neustart | Gauge-Metriken (wie Gesamtbenutzer) werden beim Start aus der Datenbank neu befüllt. Counter-Metriken werden beim Neustart auf Null zurückgesetzt — dies ist normales Prometheus-Verhalten |

## Siehe auch

- [Einrichtung](monitoring/setup.md) -- Metriken-Endpunkt aktivieren
- [Metriken-Referenz](monitoring/metrics-reference.md) -- Vollständige Liste aller Metriken
- [Überblick](monitoring/overview.md) -- Monitoring-Feature-Überblick
- [Umgebungsvariablen](installation/environment-variables.md) -- Alle Konfigurationsoptionen
