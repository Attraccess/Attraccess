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

Verwenden Sie [`coolify.docker-compose.yml`](https://github.com/Attraccess/Attraccess/blob/main/coolify.docker-compose.yml) aus dem Repo-Root. Coolify generiert FQDN-Routing, Grafana-Admin-Zugangsdaten und Session-Secrets automatisch über die Magic-Env-Konventionen `SERVICE_FQDN_*`, `SERVICE_USER_*`, `SERVICE_PASSWORD_*` und `SERVICE_BASE64_*`. Nach dem Deployment:

1. Generieren Sie einen Metriken-API-Schlüssel unter **Attraccess > Einstellungen > Metrics & Monitoring** ([Einrichtung](monitoring/setup.md))
2. Tragen Sie den Bearer-Token in die gebündelte `prometheus.yml` ein (siehe [Bearer-Token setzen](#bearer-token-setzen))
3. Öffnen Sie Grafana unter der von Coolify zugewiesenen FQDN und melden Sie sich mit dem automatisch generierten `SERVICE_USER_GRAFANA` / `SERVICE_PASSWORD_GRAFANA` an (sichtbar im Coolify-Service-Env-Tab)

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
    command:
      - >
        set -e &&
        cp -rT /app/share/monitoring/prometheus /prometheus-config &&
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

> [!WARNING]
> Ändern Sie das Standard-Grafana-Passwort vor der Produktivstellung.

## Bearer-Token setzen

Die gebündelte `prometheus.yml` liefert den Bearer-Token auskommentiert aus — Prometheus benötigt ihn zur Authentifizierung gegen Attraccess `/api/metrics`.

Nach dem ersten Deployment:

1. Generieren Sie einen Metriken-API-Schlüssel in Attraccess (siehe [Einrichtung](monitoring/setup.md))
2. Bearbeiten Sie `prometheus.yml` im Volume `prometheus-config` und ergänzen Sie den Bearer-Token:

   ```bash
   docker compose exec prometheus sh -c 'apk add --no-cache vi 2>/dev/null; vi /etc/prometheus/prometheus.yml'
   ```

   Oder ersetzen Sie die Datei vom Host:

   ```bash
   docker run --rm -v <stack>_prometheus-config:/data -i busybox sh -c \
     'sed -i "s|# bearer_token: .*|bearer_token: \"<your-key>\"|; s|^    # bearer_token|    bearer_token|" /data/prometheus.yml'
   ```

3. Prometheus neu laden:

   ```bash
   docker compose exec prometheus wget -qO- --post-data='' http://127.0.0.1:9090/-/reload
   ```

> [!NOTE]
> Der `monitoring-init`-Service überschreibt `prometheus.yml` bei jedem Stack-Start, sodass jede manuelle Bearer-Token-Bearbeitung beim Redeploy verloren geht. Wenden Sie sie nach jedem Deploy erneut an, bis automatisches Env-Var-Templating implementiert ist.

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
| Prometheus zeigt Ziel als "DOWN" mit `401` | Bearer-Token fehlt oder ist falsch — neuen Schlüssel in Attraccess generieren und in `prometheus.yml` im `prometheus-config`-Volume erneut setzen, dann Prometheus neu laden |
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
