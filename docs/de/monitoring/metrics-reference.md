# Metriken-Referenz

Diese Seite listet alle Metriken auf, die Attraccess am `/api/metrics`-Endpunkt bereitstellt. Die Metriken verwenden das [Prometheus-Exposition-Format](https://prometheus.io/docs/instrumenting/exposition_formats/).

## Metriktypen

| Typ | Beschreibung |
|-----|--------------|
| **Counter** | Ein Wert, der nur steigt (z.B. Gesamtanfragen). Wird beim Neustart auf Null zurückgesetzt |
| **Gauge** | Ein Wert, der steigen und fallen kann (z.B. aktive Sitzungen). Wird beim Start aus der Datenbank wiederhergestellt |
| **Histogram** | Stichproben von Beobachtungen in konfigurierbare Buckets (z.B. Anfragedauer) |

## HTTP-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Dauer von HTTP-Anfragen in Sekunden |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Gesamtanzahl der HTTP-Anfragen |

**Histogram-Buckets:** 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

### Beispiel-PromQL-Abfragen

```promql
# Anfragerate pro Sekunde (letzte 5 Minuten)
rate(http_requests_total[5m])

# 95. Perzentil Latenz
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Fehlerrate (5xx-Antworten)
rate(http_requests_total{status_code=~"5.."}[5m])
```

## Authentifizierungs-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_auth_login_total` | Counter | `method`, `status` | Anmeldeversuche. `method`: `local` oder `sso`. `status`: `success` oder `failure` |
| `attraccess_auth_active_sessions` | Gauge | -- | Anzahl aktiver authentifizierter Sitzungen |
| `attraccess_auth_sso_login_total` | Counter | `provider_type` | SSO-Anmeldeversuche. `provider_type`: `oidc` oder `saml` |
| `attraccess_auth_2fa_usage_total` | Counter | `action` | Zwei-Faktor-Authentifizierungsaktionen |

### Beispiel-PromQL-Abfragen

```promql
# Fehlgeschlagene Anmelderate
rate(attraccess_auth_login_total{status="failure"}[5m])

# Vergleich SSO vs. lokale Anmeldung
sum by (method) (rate(attraccess_auth_login_total{status="success"}[1h]))
```

## Benutzer-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_users_total` | Gauge | -- | Gesamtanzahl registrierter Benutzer |
| `attraccess_users_registered_total` | Counter | -- | Kumulative Anzahl von Benutzerregistrierungen |

## Ressourcen-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_resources_total` | Gauge | -- | Gesamtanzahl der Ressourcen |
| `attraccess_resource_usage_sessions_active` | Gauge | -- | Aktuell aktive Nutzungssitzungen |
| `attraccess_resource_usage_sessions_total` | Counter | `action` | Gestartete oder beendete Nutzungssitzungen. `action`: `started` oder `ended` |
| `attraccess_resource_usage_duration_seconds` | Histogram | -- | Dauer abgeschlossener Nutzungssitzungen |
| `attraccess_resource_groups_total` | Gauge | -- | Gesamtanzahl der Ressourcengruppen |
| `attraccess_resource_introductions_total` | Counter | -- | Abgeschlossene Ressourceneinweisungen |
| `attraccess_resource_maintenance_total` | Counter | `type` | Wartungsereignisse nach Typ |
| `attraccess_resource_maintenance_overdue` | Gauge | -- | Anzahl der Ressourcen mit überfälliger Wartung |

**Nutzungsdauer-Histogram-Buckets:** 1min, 5min, 10min, 30min, 1h, 2h, 4h, 8h

### Beispiel-PromQL-Abfragen

```promql
# Aktive Nutzungssitzungen jetzt
attraccess_resource_usage_sessions_active

# Mediane Sitzungsdauer
histogram_quantile(0.5, rate(attraccess_resource_usage_duration_seconds_bucket[24h]))

# Ressourcen mit überfälliger Wartung
attraccess_resource_maintenance_overdue > 0
```

## Attractap-Geräte-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_attractap_devices_connected` | Gauge | -- | Anzahl verbundener Attractap-NFC-Leser |
| `attraccess_attractap_nfc_taps_total` | Counter | -- | Gesamtanzahl der NFC-Tap-Ereignisse |
| `attraccess_attractap_firmware_updates_total` | Counter | -- | Gesamtanzahl der Firmware-Update-Ereignisse |

## Abrechnungs-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_billing_transactions_total` | Counter | `status` | Abrechnungstransaktionen nach Status |
| `attraccess_billing_transaction_amount` | Histogram | -- | Transaktionsbeträge |

**Transaktionsbetrag-Histogram-Buckets:** 1, 5, 10, 25, 50, 100, 250, 500, 1000

## Infrastruktur-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_projects_total` | Gauge | -- | Gesamtanzahl der Projekte |
| `attraccess_mqtt_servers_total` | Gauge | -- | Gesamtanzahl konfigurierter MQTT-Server |
| `attraccess_mqtt_servers_healthy` | Gauge | -- | Anzahl gesunder MQTT-Server |
| `attraccess_plugins_loaded` | Gauge | -- | Anzahl geladener Plugins |
| `attraccess_email_sent_total` | Counter | `status` | Gesendete E-Mails nach Zustellstatus |
| `attraccess_websocket_connections_active` | Gauge | -- | Aktive WebSocket-Verbindungen |

## Node.js-Laufzeit-Metriken

Dies sind Standardmetriken, die automatisch von der [prom-client](https://github.com/siimon/prom-client)-Bibliothek erfasst werden:

| Metrik | Typ | Beschreibung |
|--------|-----|--------------|
| `process_cpu_user_seconds_total` | Counter | CPU-Zeit im Benutzermodus |
| `process_cpu_system_seconds_total` | Counter | CPU-Zeit im Systemmodus |
| `process_resident_memory_bytes` | Gauge | Resident Set Size (RSS) |
| `nodejs_heap_size_total_bytes` | Gauge | Gesamte V8-Heap-Größe |
| `nodejs_heap_size_used_bytes` | Gauge | Verwendete V8-Heap-Größe |
| `nodejs_external_memory_bytes` | Gauge | Externer V8-Speicher |
| `nodejs_eventloop_lag_seconds` | Gauge | Event-Loop-Verzögerung in Sekunden |
| `nodejs_active_handles_total` | Gauge | Anzahl aktiver libuv-Handles |
| `nodejs_active_requests_total` | Gauge | Anzahl aktiver libuv-Anfragen |

### Beispiel-PromQL-Abfragen

```promql
# CPU-Nutzungsrate
rate(process_cpu_user_seconds_total[5m]) + rate(process_cpu_system_seconds_total[5m])

# Speichernutzung in MB
nodejs_heap_size_used_bytes / 1024 / 1024

# Event-Loop-Verzögerung
nodejs_eventloop_lag_seconds
```

## Siehe auch

- [Überblick](monitoring/overview.md) -- Monitoring-Feature-Überblick
- [Einrichtung](monitoring/setup.md) -- Metriken-Endpunkt aktivieren
- [Prometheus & Grafana](monitoring/prometheus-grafana.md) -- Infrastruktur-Konfiguration
