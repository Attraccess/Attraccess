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
| `attraccess_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Dauer von HTTP-Anfragen in Sekunden |
| `attraccess_http_requests_total` | Counter | `method`, `route`, `status_code` | Gesamtanzahl der HTTP-Anfragen |

**Histogram-Buckets:** 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

### Beispiel-PromQL-Abfragen

```promql
# Anfragerate pro Sekunde (letzte 5 Minuten)
rate(attraccess_http_requests_total[5m])

# 95. Perzentil Latenz
histogram_quantile(0.95, rate(attraccess_http_request_duration_seconds_bucket[5m]))

# Fehlerrate (5xx-Antworten)
rate(attraccess_http_requests_total{status_code=~"5.."}[5m])
```

## Authentifizierungs-Metriken

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_auth_login_total` | Counter | `method`, `status` | Anmeldeversuche (inkl. Versuche mit unbekanntem Benutzernamen). `method`: `local` oder `sso`. `status`: `success` oder `fail` |
| `attraccess_auth_active_sessions` | Gauge | -- | Anzahl aktiver authentifizierter Sitzungen |
| `attraccess_auth_sso_login_total` | Counter | `provider_type` | Erfolgreiche SSO-Anmeldeversuche. `provider_type`: `oidc` oder `saml` |
| `attraccess_auth_sso_login_failures_total` | Counter | `provider_type`, `reason` | Fehlgeschlagene SSO-Anmeldeversuche. `provider_type`: `oidc` oder `saml`; `reason`: `guard_rejected`, `invalid_assertion`, `linking_failed` oder `provider_error` |
| `attraccess_auth_2fa_usage_total` | Counter | `action` | Zwei-Faktor-Authentifizierungsaktionen |

### Beispiel-PromQL-Abfragen

```promql
# Fehlgeschlagene Anmeldungen in den letzten 5 Minuten
sum(increase(attraccess_auth_login_total{status="fail"}[5m]))

# Vergleich SSO vs. lokale Anmeldung
sum by (method) (rate(attraccess_auth_login_total{status="success"}[1h]))

# Fehlgeschlagene SSO-Anmeldungen in den letzten 5 Minuten nach Anbieter-Typ und Grund
sum by (provider_type, reason) (increase(attraccess_auth_sso_login_failures_total[5m]))
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
| `attraccess_resource_usage_sessions_total` | Counter | `action` | Gestartete oder beendete Nutzungssitzungen. `action`: `start` oder `end` |
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
| `attraccess_attractap_crash_reports_total` | Counter | `reset_reason` | Von Lesegeräten empfangene Crash-Berichte. `reset_reason` ist eine normalisierte Reset-Ursache (z. B. `PANIC`, `INT_WDT`, `BROWNOUT`, `unknown`) |

### Beispiel-PromQL-Abfragen

```promql
# Lesegerät-Abstürze der letzten Stunde, nach Reset-Ursache
sum by (reset_reason) (increase(attraccess_attractap_crash_reports_total[1h]))

# Alarmsignal: alle Lesegeräte offline (waren aber kürzlich verbunden)
sum(
  (attraccess_attractap_devices_connected == bool 0)
  *
  (max_over_time(attraccess_attractap_devices_connected[1h]) > bool 0)
) or vector(0)
```

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

## WebSocket-Timing

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_ws_message_duration_seconds` | Histogram | `gateway`, `event`, `status` | Dauer der WebSocket-Nachrichten-Handler |
| `attraccess_ws_messages_total` | Counter | `gateway`, `event`, `status` | Gesamtanzahl der verarbeiteten WebSocket-Nachrichten |
| `attraccess_ws_connection_duration_seconds` | Histogram | `gateway` | Dauer der WebSocket-Verbindungen |

**Nachrichtendauer-Buckets:** 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s
**Verbindungsdauer-Buckets:** 10s, 30s, 1min, 5min, 15min, 1h, 6h, 24h

### Beispiel-PromQL-Abfragen

```promql
# p95 Nachrichtenlatenz pro Event
histogram_quantile(0.95, sum by (event, le) (rate(attraccess_ws_message_duration_seconds_bucket[5m])))

# Nachrichten-Fehlerrate pro Event
sum by (event) (rate(attraccess_ws_messages_total{status="error"}[5m]))
```

## Cron-Jobs

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_cron_job_duration_seconds` | Histogram | `job_name` | Dauer geplanter Job-Ausführungen |
| `attraccess_cron_job_runs_total` | Counter | `job_name`, `status` | Cron-Job-Ausführungen nach Ergebnis. `status`: `success` oder `failure` |
| `attraccess_cron_job_last_run_timestamp_seconds` | Gauge | `job_name` | Unix-Zeitstempel der letzten Ausführung |
| `attraccess_cron_job_last_success_timestamp_seconds` | Gauge | `job_name` | Unix-Zeitstempel der letzten erfolgreichen Ausführung |

**Dauer-Buckets:** 100ms, 500ms, 1s, 5s, 10s, 30s, 1min, 5min, 15min, 30min

**Job-Namen:** `sumup_poll`, `session_cleanup`, `maintenance_evaluator`, `flow_daily_cleanup`, `flow_minute_tick`.

### Beispiel-PromQL-Abfragen

```promql
# Zeit seit letzter erfolgreicher Ausführung (Alarm bei Überschreitung)
time() - attraccess_cron_job_last_success_timestamp_seconds

# Cron-Fehlerrate
sum by (job_name) (rate(attraccess_cron_job_runs_total{status="failure"}[15m]))
```

## Datenbank

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_db_query_duration_seconds` | Histogram | `entity`, `method` | Dauer von Datenbank-Abfragen (`select`, `insert`, `update`, `delete`, `other`) |
| `attraccess_db_query_errors_total` | Counter | `entity`, `method`, `error_type` | Datenbank-Abfragefehler |
| `attraccess_db_slow_queries_total` | Counter | `entity`, `method` | Abfragen, die den Slow-Query-Schwellwert überschreiten |
| `attraccess_db_pool_size` | Gauge | -- | Konfigurierte Größe des Verbindungspools |

**Dauer-Buckets:** 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s

Sämtliches SQL, das durch den TypeORM-`QueryRunner` läuft, wird gemessen -- Lesevorgänge (`find`, `findOne`, `getMany`) ebenso wie Schreibvorgänge. Wartungs-Statements (`BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, `PRAGMA`) werden übersprungen. Das `entity`-Label wird aus der SQL-`FROM` / `INTO` / `UPDATE`-Klausel geparst; Statements ohne erkennbare Tabelle landen unter `entity="unknown"`.

**Standardmäßig deaktiviert** (hohe Kardinalität). Aktivieren über Admin-Einstellungen -> Metriken -> Toggles -> Datenbank.

**Slow-Query-Schwellwert:** Abfragen über `0.5s` erhöhen `attraccess_db_slow_queries_total`. Konfigurierbar über Admin-Einstellungen -> Metriken -> Schwellwert für langsame Queries. Negative oder nicht-numerische Werte fallen auf den Default zurück.

### Beispiel-PromQL-Abfragen

```promql
# Top 10 langsamste Entities (p95)
topk(10, histogram_quantile(0.95, sum by (entity, method, le) (rate(attraccess_db_query_duration_seconds_bucket[5m]))))

# Rate langsamer Abfragen
sum by (entity, method) (rate(attraccess_db_slow_queries_total[5m]))
```

## Externe Aufrufe

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_external_call_duration_seconds` | Histogram | `target`, `operation`, `status` | Dauer ausgehender Aufrufe an externe Dienste |
| `attraccess_external_call_errors_total` | Counter | `target`, `operation`, `error_type` | Fehler bei externen Aufrufen |

**Dauer-Buckets:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s

**Targets:** `sumup`, `smtp`, `mqtt`, `github`. Operationen sind pro Target als begrenzte Enums definiert (z.B. `merchant`, `checkout`, `transactions` für SumUp; `send` für SMTP; `publish`, `subscribe` für MQTT).

### Beispiel-PromQL-Abfragen

```promql
# Fehlerrate externer Aufrufe pro Target
sum by (target) (rate(attraccess_external_call_errors_total[5m]))

# p95 Latenz externer Aufrufe
histogram_quantile(0.95, sum by (target, operation, le) (rate(attraccess_external_call_duration_seconds_bucket[5m])))
```

## Server-Sent Events

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_sse_active_connections` | Gauge | `stream` | Aktive SSE-Abonnenten pro Stream |
| `attraccess_sse_connection_duration_seconds` | Histogram | `stream` | Dauer von SSE-Verbindungen |
| `attraccess_sse_messages_sent_total` | Counter | `stream` | Gesamtanzahl gesendeter SSE-Nachrichten |

**Verbindungsdauer-Buckets:** 10s, 30s, 1min, 5min, 15min, 1h, 6h, 24h

**Streams:** `resource_usage`, `billing`, `resource_flows`.

## Resource Flows

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|--------------|
| `attraccess_flow_execution_duration_seconds` | Histogram | `trigger_type`, `status` | Dauer von Flow-Ausführungen |
| `attraccess_flow_node_duration_seconds` | Histogram | `node_type`, `status` | Dauer pro Flow-Knoten |
| `attraccess_flow_executions_total` | Counter | `trigger_type`, `status` | Gesamtanzahl der Flow-Ausführungen |

**Dauer-Buckets:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s, 1min

`trigger_type` und `node_type` sind Werte aus dem `ResourceFlowNodeType`-Enum (z.B. `manual.button`, `http.send-request`).

### Beispiel-PromQL-Abfragen

```promql
# Fehlerrate der Flow-Ausführungen pro Trigger
sum by (trigger_type) (rate(attraccess_flow_executions_total{status="failure"}[5m]))

# p95 Dauer der Flow-Ausführungen
histogram_quantile(0.95, sum by (trigger_type, le) (rate(attraccess_flow_execution_duration_seconds_bucket[5m])))
```

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
