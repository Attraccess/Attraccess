# Umgebungsvariablen

Alle Konfigurationsoptionen für Attraccess, die über Umgebungsvariablen gesetzt werden können.

## Pflichteinstellungen

| Variable | Beschreibung |
|----------|-------------|
| `AUTH_SESSION_SECRET` | Geheimer Schlüssel für die Verschlüsselung von Sitzungsdaten. Verwenden Sie einen zufälligen, langen Wert. |
| `ATTRACCESS_URL` | Die URL, unter der Benutzer auf Attraccess zugreifen, z.B. `https://attraccess.meine-domain.de` |

## Anwendung

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `ATTRACCESS_URL` | `http://localhost:3000` | Haupt-URL der Anwendung |
| `ATTRACCESS_PUBLIC_INTERNET_URL` | – | Öffentliche URL für externe Callbacks (z.B. SumUp-Zahlungen). Nur nötig, wenn sich diese von `ATTRACCESS_URL` unterscheidet. |
| `LOG_LEVELS` | `error,warn,log` | Kommagetrennte Protokollebenen: `error`, `warn`, `log`, `debug`, `verbose` |
| `LICENSE_KEY` | – | Lizenzschlüssel für Attraccess |
| `TZ` | – | Zeitzone, z.B. `Europe/Berlin` |

## Speicher

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `STORAGE_ROOT` | `/app/storage` | Basisverzeichnis für alle persistenten Daten |
| `MAX_FILE_SIZE_BYTES` | `10485760` | Maximale Dateigröße für Uploads (Standard: 10 MB) |
| `CACHE_MAX_AGE_DAYS` | `7` | Wie lange Bilder im Cache bleiben (Tage) |

## E-Mail (SMTP)

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `SMTP_SERVICE` | `SMTP` | E-Mail-Dienst: `SMTP` oder `Outlook365` |
| `SMTP_HOST` | `localhost` | SMTP-Servername |
| `SMTP_PORT` | `1025` | SMTP-Port |
| `SMTP_SECURE` | `false` | TLS-Verschlüsselung aktivieren (`true`/`false`) |
| `SMTP_USER` | – | SMTP-Benutzername |
| `SMTP_PASS` | – | SMTP-Passwort |
| `SMTP_FROM` | – | Absender-E-Mail-Adresse |

> [!NOTE]
> Bei `Outlook365` werden Host, Port und Secure automatisch gesetzt (`smtp.office365.com`, Port `587`). Sie müssen nur Benutzer, Passwort und Absender angeben.

## SSL / TLS

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `SSL_GENERATE_SELF_SIGNED_CERTIFICATES` | `false` | Selbst-signierte Zertifikate automatisch erzeugen |
| `SSL_KEY_FILE` | – | Pfad zur SSL-Schlüsseldatei |
| `SSL_CERT_FILE` | – | Pfad zur SSL-Zertifikatsdatei |

> [!TIP]
> Für die meisten Setups empfehlen wir einen [Reverse Proxy](installation/ssl-setup.md) für SSL anstelle der eingebauten SSL-Unterstützung.

## Sitzung

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `AUTH_SESSION_SECRET` | – | **Pflicht.** Geheimer Schlüssel für Sitzungsverschlüsselung |
| `SESSION_COOKIE_MAX_AGE` | `604800000` | Maximale Sitzungsdauer in Millisekunden (Standard: 7 Tage) |

## Plugins

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `PLUGIN_DIR` | `/app/storage/plugins` | Verzeichnis für Plugins |
| `DISABLE_PLUGINS` | `false` | Plugin-System deaktivieren |
| `RESTART_BY_EXIT` | `false` | Anwendung bei Absturz automatisch neustarten |

## Statische Dateien

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `STATIC_FRONTEND_FILE_PATH` | `/app/dist/apps/frontend` | Pfad zum Frontend-Build |
| `STATIC_DOCS_FILE_PATH` | `/app/docs` | Pfad zur Dokumentation |

> [!NOTE]
> Diese Variablen müssen im Normalfall nicht geändert werden. Sie sind nur relevant, wenn Sie Attraccess ohne Docker betreiben.

## Siehe auch

- [Docker Compose Installation](installation/docker-compose.md)
- [SSL einrichten](installation/ssl-setup.md)
- [Sicherheit](settings/security.md)
