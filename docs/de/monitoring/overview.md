# Monitoring & Metriken

Attraccess bietet integrierte Monitoring-Unterstützung mit **Prometheus** zur Metrik-Erfassung und **Grafana** zur Visualisierung. So erhalten Sie Echtzeit-Einblicke in die Nutzung Ihres Makerspaces, die Systemgesundheit und die betriebliche Leistung.

## Was Sie erhalten

| Bereich | Was überwacht wird |
|---------|--------------------|
| **HTTP-Verkehr** | Anforderungsraten, Latenz-Perzentile (p50/p95/p99), Fehlerraten |
| **Authentifizierung** | Anmeldeversuche, SSO-Nutzung, aktive Sitzungen |
| **Benutzer** | Gesamtbenutzer, neue Registrierungen |
| **Ressourcen** | Aktive Nutzungssitzungen, Sitzungsdauern, abgeschlossene Einweisungen |
| **Wartung** | Wartungsereignisse, überfällige Wartungswarnungen |
| **Attractap-Geräte** | Verbundene NFC-Leser, Tap-Ereignisse, Firmware-Updates |
| **Abrechnung** | Transaktionsanzahl und -beträge |
| **Infrastruktur** | MQTT-Server-Status, WebSocket-Verbindungen, E-Mail-Zustellung, Plugin-Status |
| **Node.js-Laufzeit** | CPU-Nutzung, Speicher (Heap/RSS), Event-Loop-Verzögerung |

## Funktionsweise

1. Attraccess stellt einen `/api/metrics`-Endpunkt im Prometheus-Format bereit
2. Prometheus fragt diesen Endpunkt in konfigurierbaren Intervallen ab
3. Grafana fragt Prometheus ab und zeigt die Daten in vorgefertigten Dashboards an

```
Attraccess ──(/api/metrics)──> Prometheus ──(Abfragen)──> Grafana
```

## Vorgefertigte Dashboards

Attraccess wird mit zwei Grafana-Dashboards ausgeliefert, die sofort einsatzbereit sind:

- **Attraccess Overview** -- Anwendungsmetriken einschließlich Anforderungsraten, Authentifizierung, Ressourcennutzung, Abrechnung, Geräte und mehr
- **Node Runtime** -- Systemmetriken einschließlich CPU, Speicher, Event-Loop-Verzögerung und aktive Handles

## Sicherheit

Der Metriken-Endpunkt ist durch einen API-Schlüssel geschützt. Prometheus authentifiziert sich mit einem Bearer-Token. Ohne gültigen Schlüssel werden keine Metrikdaten bereitgestellt.

## Erste Schritte

1. [Metriken-Endpunkt aktivieren und API-Schlüssel generieren](monitoring/setup.md)
2. [Prometheus und Grafana konfigurieren](monitoring/prometheus-grafana.md)
3. [Verfügbare Metriken erkunden](monitoring/metrics-reference.md)

## Siehe auch

- [Einrichtung](monitoring/setup.md) -- Metriken aktivieren und API-Schlüssel generieren
- [Prometheus & Grafana](monitoring/prometheus-grafana.md) -- Konfiguration und Docker-Compose-Einrichtung
- [Metriken-Referenz](monitoring/metrics-reference.md) -- Vollständige Liste aller Metriken
