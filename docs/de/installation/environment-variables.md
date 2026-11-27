# Umgebungsvariablen

<!-- llms-description: Referenz aller Umgebungsvariablen zur Konfiguration von Attraccess: Pflichteinstellungen, Anwendung, Logs, Datenbank, Backup, Speicher und TLS. -->

Alle Konfigurationsoptionen für Attraccess, die über Umgebungsvariablen gesetzt werden können.

## Pflichteinstellungen

| Variable              | Beschreibung                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SESSION_SECRET` | Geheimer Schlüssel für die Verschlüsselung von Sitzungsdaten. Er schützt auch die gespeicherten Schlüssel der Reader-Kopplung; sichern Sie ihn zusammen mit der Datenbank. Verwenden Sie einen zufälligen, langen Wert. |
| `ATTRACCESS_URL`      | Die URL, unter der Benutzer auf Attraccess zugreifen, z.B. `https://attraccess.meine-domain.de`                                                                                                                         |

## Anwendung

| Variable                         | Standard                 | Beschreibung                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ATTRACCESS_URL`                 | –                        | Haupt-URL der Anwendung. Sie ist eine [freigegebene Website](settings/security.md#freigegebene-websites).                                                                                                                                                                                                                          |
| `ATTRACCESS_PUBLIC_INTERNET_URL` | –                        | Öffentliche Adresse, falls sie sich von `ATTRACCESS_URL` unterscheidet. Sie ist eine [freigegebene Website](settings/security.md#freigegebene-websites). Zahlungs-Callbacks (SumUp) nutzen stattdessen **Öffentliche Internet-URL** unter Einstellungen → Anwendungseinstellungen.                                                 |
| `ATTRACCESS_FRONTEND_URL`        | –                        | Adresse eines separat ausgelieferten Frontends. Sie ist eine [freigegebene Website](settings/security.md#freigegebene-websites) und wird für Rücksprünge nach dem SSO-Logout verwendet.                                                                                                                                            |
| `ATTRACCESS_TRUSTED_ORIGINS`     | –                        | Kommagetrennte Liste zusätzlicher [freigegebener Websites](settings/security.md#freigegebene-websites) als exakte Origins, z.B. `https://portal.example.com`. Keine Wildcards, keine Pfade. Ungültige Einträge werden protokolliert und übersprungen.                                                                              |
| `LOG_LEVELS`                     | `error,warn,log`         | Kommagetrennte Protokollebenen: `error`, `warn`, `log`, `debug`, `verbose`                                                                                                                                                                                                                                                         |
| `LOG_DESTINATIONS`               | `console`                | Kommagetrennte registrierte Treiber für API-Logs: zunächst `console`, `file`. Namen werden getrimmt, kleingeschrieben und dedupliziert.                                                                                                                                                                                            |
| `LOG_FILE_PATH`                  | `<STORAGE_ROOT>/api.log` | Optionale Pfadüberschreibung für `file`; standardmäßig `api.log` direkt im Speicherverzeichnis (`./storage`, wenn `STORAGE_ROOT` nicht gesetzt ist). Explizite Pfade dürfen nicht leer sein; andernfalls ignoriert. Relative Pfade beziehen sich auf das Arbeitsverzeichnis des API-Prozesses; absolute Pfade sind erlaubt.        |
| `TZ`                             | –                        | Zeitzone, z.B. `Europe/Berlin`                                                                                                                                                                                                                                                                                                     |
| `TRUST_PROXY`                    | –                        | Anzahl vertrauenswürdiger Reverse-Proxy-Hops, damit das Auth-Rate-Limiting die echte Client-IP verwendet. `1` = einzelner Proxy (nginx/Traefik/Caddy), `2` = CDN + Proxy, oder eine kommagetrennte Liste vertrauenswürdiger Proxy-IPs/CIDRs (bzw. `loopback`, `linklocal`, `uniquelocal`). Nicht gesetzt = keinem Proxy vertrauen. |

> [!NOTE]
> `TRUST_PROXY` ist **standardmäßig deaktiviert**. Hinter einem Reverse Proxy scheint sonst jede Anfrage von der Proxy-IP zu kommen, sodass das Auth-Rate-Limiting alle Benutzer gemeinsam drosselt statt des eigentlichen Angreifers. Setzen Sie den Wert passend zu Ihrer Proxy-Kette (meist `1`). Mehr Hops zu vertrauen als tatsächlich existieren, erlaubt Clients das Fälschen ihrer IP — siehe [Sicherheit](settings/security.md#reverse-proxies-und-die-echte-client-ip). Wird nach einem Neustart wirksam.
>
> Auch für die [Reader-Kopplung](attractap/pairing.md) ist die Einstellung wichtig: Die Begrenzungen für Kopplungsanfragen pro Adresse nutzen dieselbe Client-IP. Ohne `TRUST_PROXY` teilen sich alle Reader hinter dem Proxy ein Limit.

## API-Anwendungslogs

```dotenv
LOG_LEVELS=error,warn,log
LOG_DESTINATIONS=console,file
# Optionaler anderer Pfad: LOG_FILE_PATH=./custom/api.log
```

Ohne Zielkonfiguration schreiben bestehende Installationen weiterhin nur auf die Konsole. Neue lokale Setups übernehmen diese aktiven Einträge aus `.env.example`: `pnpm serve` ergänzt API-Logs in `api.log` direkt im Speicherverzeichnis des eigenen Worktrees und zeigt sie auf der Konsole. Bestehende `.env`-Dateien werden nicht verändert. `LOG_DESTINATIONS=file` wählt nur die Datei, `console` nur die Konsole. Eine leere Auswahl, unbekannte Namen oder ungültige Optionen ausgewählter Treiber brechen den Start mit einem Konfigurationsfehler ab.

Alle Ziele verwenden den bisherigen Nest-11-Filter für `LOG_LEVELS`. Explizit aufgeführte Ebenen sowie Ebenen mit mindestens der Schwere der schwersten aufgeführten Ebene sind aktiv. `log` aktiviert beispielsweise `log,warn,error,fatal`, während `debug,error` nur `debug,error,fatal` aktiviert. Ein leeres `LOG_LEVELS` deaktiviert Anwendungseinträge. `fatal`-Aufrufe folgen dem Nest-Filter, sind aber kein erlaubter Konfigurationsname. Der Dateitreiber erstellt fehlende Verzeichnisse und hängt lesbare UTF-8-Logs ohne ANSI-Codes an. Frühere Einträge bleiben bei Neustarts erhalten. Die Konsole behält Nest-Format und Routing: Fehler gehen an stderr, andere Ebenen an stdout. Authentifizierungszeilen bleiben fail2ban-kompatibel.

Änderungen werden nach einem API-Neustart wirksam. Gepufferte Startmeldungen verwenden dasselbe Routing. Beim regulären Herunterfahren (SIGINT/SIGTERM) werden ausstehende Schreibvorgänge abgeschlossen und Ziele geschlossen; erzwungenes Beenden garantiert dies nicht. Ein Ziel, das bei Initialisierung oder Betrieb ausfällt, wird für den restlichen Prozess deaktiviert und einmal über den direkten stderr-Pfad gemeldet. Funktionierende Ziele laufen weiter. Fallen alle Ziele aus, läuft die API ohne Zustellung von Anwendungslogs weiter. Nach Beheben der Ursache startet ein Neustart das Ziel erneut. Startfehler vor der Routing-Konfiguration bleiben auf der Konsole sichtbar.

In Containern benötigt die API Schreibrechte für den Pfad. Mounten Sie das Verzeichnis, wenn Logs einen Containerwechsel überleben sollen. Rotation, Aufbewahrungsregeln, Remote-Treiber, Ebenen pro Ziel und Live-Konfiguration sind nicht enthalten. Das Routing betrifft nur API-Anwendungs- und Framework-Logs. Persistierte Audit-Einträge, optionale Flow-Aufzeichnungen sowie Frontend-, Firmware-, Companion- und Dev-Launcher-Ausgaben behalten ihr eigenes Verhalten. Generierte Dateien unter `storage/` und `log/` sind gitignored. Entwickler können [weitere Transports registrieren](developer/logging.md).

## Datenbank

Attraccess speichert alle Daten in PostgreSQL. Eine andere Laufzeitdatenbank gibt es nicht: SQLite wird nur einmalig gelesen, wenn eine bestehende 1.x-Installation übernommen wird, siehe [Aktualisierung](installation/updating.md#umzug-von-sqlite-auf-postgresql).

| Variable            | Standard   | Beschreibung                                                                                                                                                                                                                                              |
| ------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | –          | **Pflicht.** Verbindungs-URL der PostgreSQL-Datenbank, z. B. `postgres://benutzer:passwort@postgres:5432/attraccess`. Sonderzeichen im Passwort müssen prozentkodiert sein.                                                                               |
| `DATABASE_SSL`      | `off`      | TLS zu PostgreSQL: `off`, `require`, `verify-ca` oder `verify-full`. `true` und `1` bedeuten `require`; `false` und `0` bedeuten `off`.                                                                                                                   |
| `DATABASE_POOL_MAX` | `10`       | Maximale Verbindungen im Pool eines API-Prozesses, eine ganze Zahl von 1 bis 500. Halten Sie sie unter `max_connections` des Servers geteilt durch die Zahl der API-Instanzen.                                                                            |
| `DATABASE_SCHEMA`   | `public`   | PostgreSQL-Schema, das die Tabellen und die Migrationstabelle enthält. Ein einfacher SQL-Bezeichner. Ein anderes Schema als `public` wird beim Start angelegt, falls es fehlt (der Datenbankbenutzer braucht dafür das Recht `CREATE` auf der Datenbank). |
| `DATABASE_TYPE`     | `postgres` | Datenbank-Engine. Nur `postgres` wird unterstützt. `sqlite` bricht den Start mit einer Meldung ab, die auf die [Upgrade-Anleitung](installation/updating.md) verweist; jeder andere Wert bricht ihn ebenfalls ab.                                         |

Fehlt eine Einstellung oder ist sie ungültig, bricht der Start mit einer klaren Meldung ab, die nie das Passwort enthält. Das Image enthält kein PostgreSQL: Betreiben Sie es als eigenen Dienst (alle mitgelieferten Compose-Dateien enthalten bereits einen, festgelegt auf `postgres:18.6-alpine`). Zur Sicherung siehe [Backup & Wiederherstellung](installation/backup-restore.md).

TLS wird ausschließlich mit `DATABASE_SSL` eingestellt. TLS-Parameter in `DATABASE_URL` (`ssl`, `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `sslpassword`, `sslcompat`) werden beim Start abgelehnt, weil sie `DATABASE_SSL` stillschweigend überschreiben würden. Ist das Serverzertifikat von einer privaten CA signiert, verwenden Sie `verify-ca` oder `verify-full` und lassen `NODE_EXTRA_CA_CERTS` auf die CA-Datei (PEM) zeigen, z. B. `NODE_EXTRA_CA_CERTS=/certs/db-ca.pem` mit der in den Container eingebundenen Datei. Auch die Sitzungsparameter `options` und `application_name` werden abgelehnt: Die API setzt Zeitzone, Lock-Timeout, Suchpfad (siehe `DATABASE_SCHEMA`) und Anwendungsnamen selbst.

### PostgreSQL auf balena

Der balena-Stack (`docker-compose.balena.yml`) startet einen Dienst `postgres` mit dem Benutzer und der Datenbank `attraccess`. balena kann Werte nicht aus anderen Variablen zusammensetzen, daher liest der Stack die Datenbankeinstellungen aus `.env.docker-compose`, die mit dem Platzhalter-Passwort `change-me` ausgeliefert wird. **Ersetzen Sie es vor dem ersten Start** (bzw. vor dem Upgrade, das PostgreSQL hinzufügt): Das `postgres`-Image legt das Passwort fest, wenn es das Volume `postgres-data` anlegt, und eine spätere Änderung der Variable wirkt auf ein bestehendes Volume nicht mehr.

Setzen Sie **beide** als balena-Gerätevariablen, mit demselben Passwort (sie überschreiben `.env.docker-compose`):

| Variable            | Wert                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD` | Ein zufälliges Passwort, nur Buchstaben und Ziffern (z. B. `openssl rand -hex 24`).                          |
| `DATABASE_URL`      | `postgres://attraccess:<dasselbe Passwort>@postgres:5432/attraccess`, genutzt von Attraccess und vom Backup. |

So ändern Sie das Passwort später:

1. Öffnen Sie eine Shell im Container `postgres` (Terminal im balenaCloud-Dashboard oder `balena ssh <geräte-uuid> postgres`) und setzen Sie das neue Passwort:

   ```bash
   psql -U attraccess -d attraccess -c "ALTER USER attraccess WITH PASSWORD '<neues Passwort>'"
   ```

2. Setzen Sie `POSTGRES_PASSWORD` und `DATABASE_URL` auf das neue Passwort. balena startet die Dienste mit den neuen Werten neu.

Zur Engine-Naht siehe [Datenbank-Backend hinzufügen](developer/adding-a-database-backend.md).

### Backup-Sidecar (balena)

Der balena-Stack enthält einen Dienst `backup`, der Datenbank und Volumes mit restic sichert. Er wird mit den folgenden Variablen konfiguriert, siehe [Backup & Wiederherstellung](installation/backup-restore.md#balena-restic-sidecar).

| Variable                                                         | Standard            | Beschreibung                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_REPOSITORY`                                              | –                   | restic-Repository, z. B. `s3:s3.amazonaws.com/bucket/attraccess`. Ohne Angabe läuft kein Backup. Als Gerätevariable setzen, nicht als Flottenvariable.                                                |
| `BACKUP_PASSWORD`                                                | –                   | Verschlüsselt das Repository. Pflicht; ohne es sind die Backups nicht lesbar.                                                                                                                         |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_*`, …          | –                   | Zugangsdaten des Backup-Ziels, unverändert an restic weitergereicht.                                                                                                                                  |
| `BACKUP_SCHEDULE`                                                | `0 3 * * *`         | Cron-Ausdruck (5 Felder); standardmäßig jede Nacht um 03:00 Uhr.                                                                                                                                      |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY` | `7`, `4`, `6`       | Wie viele tägliche, wöchentliche und monatliche Snapshots behalten werden.                                                                                                                            |
| `BACKUP_HOST`                                                    | `attraccess`        | Name dieser Installation im Repository. Nutzen Sie ein Repository pro Installation; nur wenn sich Geräte eines teilen, geben Sie jedem ein eigenes `BACKUP_HOST`.                                     |
| `BACKUP_DATABASE_URL`                                            | `DATABASE_URL`      | Zu sichernde und wiederherzustellende Datenbank, wenn sie von `DATABASE_URL` abweicht (andere Zugangsdaten oder libpq-TLS-Parameter wie `?sslmode=require`, die `DATABASE_URL` nicht enthalten darf). |
| `BACKUP_PG_WAIT_SECONDS`                                         | `120`               | Wie lange ein Lauf auf PostgreSQL wartet, bevor er fehlschlägt.                                                                                                                                       |
| `BACKUP_FORCE`                                                   | –                   | `true` lässt jede Wiederherstellung eine nicht leere Datenbank ersetzen, wie `restore --force`.                                                                                                       |
| `BACKUP_STATE_DIR`                                               | `/var/lib/backup`   | Arbeitsverzeichnis des Sidecars (Volume `backup-state`): der Dump während eines Laufs, der restic-Cache, die Sperre und die Metrik des letzten Erfolgs.                                               |
| `BACKUP_DATA_DIR`                                                | `/external-storage` | Verzeichnis, unter dem die zu sichernden Volumes eingebunden sind.                                                                                                                                    |

## Speicher

| Variable              | Standard       | Beschreibung                                      |
| --------------------- | -------------- | ------------------------------------------------- |
| `STORAGE_ROOT`        | `/app/storage` | Basisverzeichnis für alle persistenten Daten      |
| `MAX_FILE_SIZE_BYTES` | `10485760`     | Maximale Dateigröße für Uploads (Standard: 10 MB) |
| `CACHE_MAX_AGE_DAYS`  | `7`            | Wie lange Bilder im Cache bleiben (Tage)          |

## Lizenzschlüssel und E-Mail

Lizenzschlüssel und E-Mail-Server (SMTP) sind keine Umgebungsvariablen. Tragen Sie sie im [Einrichtungsassistenten](setup/first-time-setup.md) oder unter **Einstellungen** ein; siehe [E-Mail / SMTP-Konfiguration](setup/smtp-email.md).

## SSL / TLS

| Variable                                | Standard | Beschreibung                                      |
| --------------------------------------- | -------- | ------------------------------------------------- |
| `SSL_GENERATE_SELF_SIGNED_CERTIFICATES` | `false`  | Selbst-signierte Zertifikate automatisch erzeugen |
| `SSL_KEY_FILE`                          | –        | Pfad zur SSL-Schlüsseldatei                       |
| `SSL_CERT_FILE`                         | –        | Pfad zur SSL-Zertifikatsdatei                     |

> [!TIP]
> Für die meisten Setups empfehlen wir einen [Reverse Proxy](installation/ssl-setup.md) für SSL anstelle der eingebauten SSL-Unterstützung.

## Sitzung

| Variable                   | Standard            | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SESSION_SECRET`      | –                   | **Pflicht.** Geheimer Schlüssel für Sitzungsverschlüsselung                                                                                                                                                                                                                                                                                                                                                                  |
| `SESSION_COOKIE_MAX_AGE`   | `604800000`         | Maximale Sitzungsdauer in Millisekunden (Standard: 7 Tage)                                                                                                                                                                                                                                                                                                                                                                   |
| `VALKEY_URL`               | –                   | Verbindungs-URL für einen Valkey/Redis-kompatiblen Sitzungsspeicher (z. B. `redis://valkey:6379`). Wenn gesetzt, werden Sitzungen in Valkey mit nativem TTL gespeichert statt in PostgreSQL — erforderlich für horizontale Skalierung. Ohne Konfiguration wird PostgreSQL verwendet. Unterstützt jede `ioredis`-kompatible URL inkl. `rediss://` (TLS), Redis Cluster, Sentinel, ElastiCache und Upstash.                    |
| `ATTRACCESS_INSTANCE_NAME` | `<hostname>:<PORT>` | Name dieser API-Instanz in den Valkey-Sperren und Heartbeats von Starts und Enden an Maschinen. Nur mit `VALKEY_URL` wirksam. Muss unter gleichzeitig laufenden Instanzen eindeutig sein und bei Neustarts derselben Instanz gleich bleiben; darf kein `\|` enthalten. Siehe [Aktive Sitzungen auf gemeinsam genutzten Maschinen](flows/payloads-variables-templates.md#aktive-sitzungen-auf-gemeinsam-genutzten-maschinen). |

> [!NOTE]
> Die mitgelieferten Docker-Compose-Varianten (Balena, Coolify) enthalten einen `valkey/valkey:9-alpine`-Sidecar und setzen `VALKEY_URL` automatisch. Für externe Deployments muss `VALKEY_URL` auf die eigene Valkey/Redis-Instanz zeigen.

> [!NOTE]
> Ist `VALKEY_URL` gesetzt, startet die API auch dann, wenn Valkey nicht erreichbar ist (etwa während der Valkey-Container noch startet). Bis Valkey erreichbar ist, protokolliert sie eine Warnung und bei jedem Verbindungsversuch eine Zeile `Valkey connection error`. Sitzungen werden nicht nach PostgreSQL verlagert: Bis Valkey wieder erreichbar ist, werden Anmeldungen, Anfragen angemeldeter Benutzer und Anfragen mit API-Tokens mit `503 Service Unavailable` beantwortet; öffentliche Seiten funktionieren weiter. Sobald Valkey wieder erreichbar ist, funktioniert die Anmeldung wieder, und die Invalidierung des Berechtigungs-Caches sowie die Sperren für Starts und Enden von Maschinen über API-Instanzen hinweg laufen von selbst wieder an, ohne Neustart der API.

## Plugins

| Variable                    | Standard               | Beschreibung                                 |
| --------------------------- | ---------------------- | -------------------------------------------- |
| `PLUGIN_DIR`                | `/app/storage/plugins` | Verzeichnis für Plugins                      |
| `DISABLE_PLUGINS`           | `false`                | Plugin-System deaktivieren                   |
| `RESTART_BY_EXIT`           | `false`                | Anwendung bei Absturz automatisch neustarten |
| `ATTRACCESS_PLUGIN_CHANNEL` | `latest`               | Plugin-Release-Kanal: `latest` oder `next`   |

`ATTRACCESS_PLUGIN_CHANNEL` ist das npm-Dist-Tag, das der Marktplatz und Plugin-Installationen standardmäßig verwenden: `latest` (veröffentlichte Plugin-Versionen) oder `next` (Nightly-Builds). Offizielle Release-Images verwenden `latest`; die Nightly-Images (`nightly-<sha>`, `nightly-latest`) setzen `next`, damit ein Nightly-Host die Nightly-Builds der Plugins installiert und neuere anbietet. Der Kanal schaltet die [automatischen Updates](plugins/installing-plugins.md#automatische-updates) nicht ein. Mit der Variable überschreibst du den Standard des Images; jeder andere Wert stoppt die API beim Start mit einem Konfigurationsfehler. Siehe [Plugins installieren](plugins/installing-plugins.md#release-kanäle).

## Statische Dateien

| Variable                    | Standard                  | Beschreibung            |
| --------------------------- | ------------------------- | ----------------------- |
| `STATIC_FRONTEND_FILE_PATH` | `/app/dist/apps/frontend` | Pfad zum Frontend-Build |
| `STATIC_DOCS_FILE_PATH`     | `/app/docs`               | Pfad zur Dokumentation  |

> [!NOTE]
> Diese Variablen müssen im Normalfall nicht geändert werden. Sie sind nur relevant, wenn Sie Attraccess ohne Docker betreiben.

## Siehe auch

- [Docker Compose Installation](installation/docker-compose.md)
- [SSL einrichten](installation/ssl-setup.md)
- [Sicherheit](settings/security.md)
