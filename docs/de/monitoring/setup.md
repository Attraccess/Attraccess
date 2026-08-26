# Monitoring einrichten

Diese Anleitung erklärt, wie Sie den Metriken-Endpunkt in Attraccess aktivieren und den API-Schlüssel generieren, den Prometheus zum Abrufen der Metriken verwendet.

## Voraussetzungen

- Administrator-Berechtigungen in Attraccess

## Metriken aktivieren

1. Öffnen Sie **Einstellungen** in der Seitenleiste
2. Wählen Sie den Bereich **Überwachung**
3. Klicken Sie auf **API-Schlüssel generieren**
4. Kopieren Sie den angezeigten API-Schlüssel und speichern Sie ihn sicher

> [!WARNING]
> Der API-Schlüssel wird nur einmal angezeigt. Wenn Sie ihn verlieren, müssen Sie einen neuen generieren. Das Generieren eines neuen Schlüssels macht den vorherigen ungültig.

## Metriken-Endpunkt

Nach der Aktivierung stellt Attraccess Metriken bereit unter:

```
GET /api/metrics
```

### Authentifizierung

Der Endpunkt akzeptiert den API-Schlüssel auf zwei Arten:

| Methode | Beispiel |
|---------|----------|
| **Bearer-Token** (empfohlen) | `Authorization: Bearer <Ihr-API-Schlüssel>` |
| **Query-Parameter** | `/api/metrics?api_key=<Ihr-API-Schlüssel>` |

### Endpunkt testen

Sie können den Endpunkt mit curl überprüfen:

```bash
curl -H "Authorization: Bearer <Ihr-API-Schlüssel>" https://ihre-attraccess-url/api/metrics
```

Sie sollten eine Prometheus-formatierte Metrikausgabe wie diese sehen:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/resources",status_code="200"} 42
...
```

## API-Schlüssel verwalten

| Aktion | Vorgehensweise |
|--------|----------------|
| **Generieren** | Einstellungen > Überwachung > API-Schlüssel generieren |
| **Neu generieren** | Einstellungen > Überwachung > API-Schlüssel neu generieren (macht den alten Schlüssel ungültig) |
| **Entfernen** | Einstellungen > Überwachung > API-Schlüssel entfernen (deaktiviert den Endpunkt) |

> [!NOTE]
> Das Entfernen des API-Schlüssels deaktiviert den Metriken-Endpunkt vollständig. Prometheus kann keine Metriken mehr abrufen, bis ein neuer Schlüssel generiert wird.

## Nächste Schritte

- [Prometheus & Grafana konfigurieren](monitoring/prometheus-grafana.md), um mit der Erfassung und Visualisierung von Metriken zu beginnen
- [Alle verfügbaren Metriken anzeigen](monitoring/metrics-reference.md)

## Siehe auch

- [Überblick](monitoring/overview.md) -- Was Monitoring bietet
- [Prometheus & Grafana](monitoring/prometheus-grafana.md) -- Infrastruktur-Einrichtung
- [Metriken-Referenz](monitoring/metrics-reference.md) -- Vollständige Metrikliste
