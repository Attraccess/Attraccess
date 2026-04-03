# Prometheus & Grafana einrichten

Diese Anleitung behandelt die Einrichtung von Prometheus und Grafana zur Erfassung und Visualisierung von Attraccess-Metriken. Attraccess wird mit vorkonfigurierten Dashboards und Provisioning-Dateien ausgeliefert, sodass Sie schnell starten können.

## Docker-Compose-Konfiguration

Fügen Sie die folgenden Dienste zu Ihrer `docker-compose.yml` hinzu:

```yaml
services:
  # ... Ihr bestehender attraccess-Dienst ...

  prometheus:
    image: prom/prometheus:v3.4.0
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

  grafana:
    image: grafana/grafana:11.6.0
    restart: unless-stopped
    expose:
      - '3001'
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-attraccess}
      - GF_SERVER_HTTP_PORT=3001
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana

volumes:
  prometheus-config:
  prometheus-data:
  grafana-data:
```

### Umgebungsvariablen

Setzen Sie diese in Ihrer `.env`-Datei oder `docker-compose.yml`:

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `GRAFANA_ADMIN_USER` | `admin` | Grafana-Admin-Benutzername |
| `GRAFANA_ADMIN_PASSWORD` | `attraccess` | Grafana-Admin-Passwort |

> [!WARNING]
> Ändern Sie das Standard-Grafana-Passwort vor der Produktivstellung.

## Prometheus-Konfiguration

Erstellen Sie die Datei `monitoring/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['attraccess:3000']
    scrape_interval: 10s
    bearer_token: '<Ihr-Metriken-API-Schlüssel>'
```

Ersetzen Sie `<Ihr-Metriken-API-Schlüssel>` durch den API-Schlüssel, den Sie in der [Einrichtungsanleitung](monitoring/setup.md) generiert haben.

### Konfigurationsoptionen

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| `scrape_interval` | `10s` | Wie oft Prometheus den Attraccess-Metriken-Endpunkt abfragt |
| `evaluation_interval` | `15s` | Wie oft Prometheus Aufzeichnungs- und Alarmregeln auswertet |
| `storage.tsdb.retention.time` | `30d` | Wie lange Metrikdaten aufbewahrt werden |

> [!TIP]
> Ein 10-Sekunden-Scrape-Intervall bietet gute Granularität für die meisten Dashboards. Erhöhen Sie es auf 30s oder 60s, wenn Sie den Ressourcenverbrauch reduzieren möchten.

## Grafana-Provisioning

Attraccess enthält Provisioning-Dateien, die Grafana automatisch mit der richtigen Datenquelle und den Dashboards konfigurieren. Diese befinden sich im Verzeichnis `monitoring/grafana/`:

```
monitoring/grafana/
  provisioning/
    datasources/
      prometheus.yml      # Verbindet Grafana mit Prometheus
    dashboards/
      dashboards.yml      # Dashboard-Provider-Konfiguration
  dashboards/
    attraccess-overview.json   # Haupt-Anwendungs-Dashboard
    node-runtime.json          # Node.js-Laufzeit-Dashboard
```

Es ist keine manuelle Grafana-Konfiguration erforderlich -- die Provisioning-Dateien erledigen alles automatisch.

### Datenquellen-Konfiguration

Die enthaltene Datenquellen-Konfiguration (`monitoring/grafana/provisioning/datasources/prometheus.yml`):

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

## Zugriff auf Grafana

Sobald die Dienste laufen:

1. Öffnen Sie Grafana in Ihrem Browser (Standard-Port `3001`)
2. Melden Sie sich mit den konfigurierten Admin-Zugangsdaten an
3. Navigieren Sie zu **Dashboards** > Ordner **Attraccess**
4. Öffnen Sie das **Attraccess Overview**- oder **Node Runtime**-Dashboard

> [!NOTE]
> Wenn Sie einen Reverse-Proxy (wie Nginx Proxy Manager) verwenden, erstellen Sie einen Proxy-Host, der auf den Grafana-Dienst auf Port 3001 zeigt.

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
| Prometheus zeigt Ziel als "DOWN" | Überprüfen Sie, ob der API-Schlüssel in `prometheus.yml` mit dem in Attraccess generierten Schlüssel übereinstimmt. Prüfen Sie, ob der `attraccess`-Dienst vom Prometheus-Container erreichbar ist |
| Keine Daten in Grafana-Dashboards | Bestätigen Sie, dass Prometheus läuft und erfolgreich scrapt. Prüfen Sie die Prometheus-Zielseite unter `http://prometheus:9090/targets` |
| Grafana-Anmeldung fehlgeschlagen | Überprüfen Sie die Umgebungsvariablen `GRAFANA_ADMIN_USER` und `GRAFANA_ADMIN_PASSWORD` |
| Dashboards erscheinen nicht | Überprüfen Sie die Volume-Mounts für `monitoring/grafana/provisioning` und `monitoring/grafana/dashboards` |
| Veraltete Metriken nach Neustart | Gauge-Metriken (wie Gesamtbenutzer) werden beim Start aus der Datenbank neu befüllt. Counter-Metriken werden beim Neustart auf Null zurückgesetzt -- dies ist normales Prometheus-Verhalten |

## Siehe auch

- [Einrichtung](monitoring/setup.md) -- Metriken-Endpunkt aktivieren
- [Metriken-Referenz](monitoring/metrics-reference.md) -- Vollständige Liste aller Metriken
- [Überblick](monitoring/overview.md) -- Monitoring-Feature-Überblick
- [Umgebungsvariablen](installation/environment-variables.md) -- Alle Konfigurationsoptionen
