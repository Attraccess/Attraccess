# Sicherheitseinstellungen

Attraccess bietet verschiedene sicherheitsrelevante Einstellungen fuer Sitzungs-Cookies und Authentifizierung. Diese Einstellungen beeinflussen, wie Benutzer angemeldet bleiben und wie die Anwendung mit Cross-Site-Anfragen umgeht.

## Cookie-SameSite-Einstellung

Die Einstellung **Cookie SameSite** steuert, wann der Browser Sitzungs-Cookies mit Anfragen sendet. Dies ist sowohl fuer die Sicherheit als auch fuer die SSO-Kompatibilitaet wichtig.

| Wert | Beschreibung |
|------|-------------|
| **lax** (Standard) | Cookies werden bei Same-Site-Anfragen und Top-Level-Navigationen gesendet. Dies ist der empfohlene Standard. |
| **strict** | Cookies werden nur bei Same-Site-Anfragen gesendet. Sicherer, aber **bricht SSO-Anmeldung**. |
| **none** | Cookies werden bei allen Anfragen gesendet, einschliesslich Cross-Site. **Erfordert HTTPS.** |

> [!WARNING]
> Das Setzen von Cookie SameSite auf **strict** bricht die SSO-Anmeldung (OIDC und SAML). Wenn ein Benutzer vom Identity Provider zurueckgeleitet wird, sendet der Browser das Sitzungs-Cookie nicht mit, da die Weiterleitung eine Cross-Site-Navigation ist. Die Anmeldung schlaegt fehl.

> [!WARNING]
> Das Setzen von Cookie SameSite auf **none** erfordert HTTPS. Wenn Ihre Attraccess-Instanz HTTP verwendet, faellt die Einstellung automatisch auf **lax** zurueck und eine Warnung wird protokolliert. Siehe [SSL einrichten](installation/ssl-setup.md) fuer die HTTPS-Konfiguration.

### Empfohlene Konfiguration

| Szenario | Empfohlener SameSite-Wert |
|----------|--------------------------|
| Kein SSO, HTTP oder HTTPS | `lax` (Standard) |
| SSO (OIDC/SAML), HTTPS | `lax` (Standard) |
| Maximale Cookie-Sicherheit, kein SSO | `strict` |
| Cross-Site-Einbettung erforderlich, HTTPS | `none` |

## Sitzungskonfiguration

Die Sitzungssicherheit wird ueber Umgebungsvariablen gesteuert:

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `AUTH_SESSION_SECRET` | -- | **Erforderlich.** Geheimer Schluessel zur Verschluesselung von Sitzungsdaten. Muss ein sicherer, zufaelliger Wert sein. |
| `SESSION_COOKIE_MAX_AGE` | `604800000` | Maximale Sitzungsdauer in Millisekunden (Standard: 7 Tage). |

> [!WARNING]
> Der `AUTH_SESSION_SECRET` muss eine lange, zufaellige Zeichenkette sein. Ein schwacher oder vorhersagbarer Wert gefaehrdet die Sitzungssicherheit. Erzeugen Sie ihn mit einem Werkzeug wie `openssl rand -hex 32`.

> [!TIP]
> Wenn Sie den `AUTH_SESSION_SECRET` aendern, werden alle bestehenden Benutzersitzungen ungueltig und die Benutzer muessen sich erneut anmelden.

## Best Practices

- Verwenden Sie in Produktionsumgebungen immer **HTTPS**. Siehe [SSL einrichten](installation/ssl-setup.md).
- Behalten Sie die Standard-Einstellung **lax** fuer Cookie SameSite bei, es sei denn, Sie haben einen bestimmten Grund, sie zu aendern.
- Erzeugen Sie bei der Ersteinrichtung einen starken `AUTH_SESSION_SECRET` und bewahren Sie ihn sicher auf.
- Passen Sie `SESSION_COOKIE_MAX_AGE` an Ihre Sicherheitsanforderungen an. Kuerzere Dauern sind sicherer, erfordern aber haeufigeres Anmelden.

## Drosselung und Kontosperre

Fehlgeschlagene Anmeldungen, Registrierungen und Passwort-Zuruecksetzungen werden pro IP gedrosselt. Wiederholte Login-Fehlversuche sperren zusaetzlich das betroffene Konto. Werte sind unter **Einstellungen -> Drosselung & Kontosperre** einstellbar.

| Einstellung | Standard | Beschreibung |
|-------------|----------|-------------|
| `maxAttempts` | `5` | Erlaubte Fehlversuche pro Zeitfenster, bevor Drosselung oder Sperre greift. |
| `windowSeconds` | `900` | Zeitfenster fuer das Zaehlen der Fehlversuche. |
| `lockoutDurationSeconds` | `900` | Grundsperrdauer. |
| `exponentialBackoff` | `false` | Wenn `true`, waechst die Sperrdauer bei jeder Wiederholung um den Faktor `backoffMultiplier`. |
| `backoffMultiplier` | `2` | Multiplikator fuer die Sperrdauer bei wiederholten Sperren. |

Antworten bei Auslosen:

- **`429 Too Many Requests`** mit `Retry-After`-Header, wenn eine IP die Schwelle ueberschreitet.
- **`423 Locked`** mit `Retry-After`-Header bei einem gesperrten Konto.

Erfolgreicher Login oder Admin-Unlock entsperrt das Konto. Admin-Unlock erfolgt ueber die Benutzerverwaltung.

## Format des Anmelde-Audit-Logs

Jeder Anmeldeversuch erzeugt eine einzeilige, leerzeichengetrennte Log-Zeile im `AuthAudit`-Kontext. Feldnamen und Reihenfolge sind stabil und fail2ban-tauglich.

```
auth.failed type=login outcome=invalid_credentials ip=1.2.3.4 user_id=42 username=alice ts=2026-05-15T12:34:56.000Z reason=bad_password
```

| Feld | Beschreibung |
|------|-------------|
| `prefix` | `auth.success` bei Erfolg, sonst `auth.failed`. |
| `type` | `login`, `register`, `password_reset_request`, `password_reset_complete`. |
| `outcome` | `success`, `invalid_credentials`, `account_locked`, `rate_limited`, `two_factor_required`, `two_factor_invalid`, `email_not_verified`, `invalid_token`, `invalid_input`, `unknown_user`. |
| `ip` | Client-IP, sonst `unknown`. |
| `user_id` | Numerische User-ID, sonst `-`. |
| `username` | Benutzername, sonst `-`. Whitespace und Quotes werden durch `_` ersetzt. |
| `ts` | ISO-8601-UTC-Zeitstempel. |
| `reason` | Optionaler Kurz-Grund. |

Passwoerter, Tokens oder andere Secrets werden nie geloggt.

### fail2ban-Regex

Minimaler `failregex` fuer `/etc/fail2ban/filter.d/attraccess-auth.conf`:

```
failregex = ^.*auth\.failed type=(?:login|register|password_reset_request|password_reset_complete) outcome=\S+ ip=<HOST> .*$
ignoreregex =
```

## Siehe auch

- [Umgebungsvariablen](installation/environment-variables.md) -- Alle Konfigurationsoptionen
- [SSL einrichten](installation/ssl-setup.md) -- HTTPS konfigurieren
- [SSO Ueberblick](user-management/sso-overview.md) -- Single Sign-On einrichten
- [Einstellungen Ueberblick](settings/overview.md) -- Alle Systemeinstellungen
