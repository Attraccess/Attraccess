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

Antworten bei Ausloesung:

- **`429 Too Many Requests`** mit `Retry-After`-Header, wenn eine IP die Schwelle ueberschreitet.
- **`423 Locked`** mit `Retry-After`-Header bei einem gesperrten Konto.

Erfolgreicher Login oder Admin-Unlock entsperrt das Konto. Admin-Unlock erfolgt ueber die Benutzerverwaltung.

### Reverse Proxies und die echte Client-IP

Die Drosselung pro IP funktioniert nur, wenn Attraccess die **echte Client-IP** sieht. Laeuft die Anwendung hinter einem Reverse Proxy (nginx, Traefik, Caddy, einem CDN oder dem mitgelieferten Docker-Stack), kommt die Verbindung vom Proxy — ohne Konfiguration scheint daher jede Anfrage von der Proxy-IP zu stammen. Ein einzelner Angreifer wuerde so alle Benutzer drosseln, und das Audit-Log zeigt fuer alle die Proxy-IP.

Setzen Sie die Umgebungsvariable `TRUST_PROXY` auf die Anzahl vertrauenswuerdiger Proxy-Hops zwischen Client und Attraccess. Die Client-IP wird dann aus dem vom Proxy gesetzten `X-Forwarded-For`-Header gelesen:

| Deployment | `TRUST_PROXY` |
|------------|---------------|
| Kein Reverse Proxy (direkt) | nicht gesetzt (Standard) |
| Einzelner Reverse Proxy (nginx/Traefik/Caddy) | `1` |
| CDN vor einem Reverse Proxy | `2` |
| Nur bestimmte vertrauenswuerdige Proxies | kommagetrennte IPs/CIDRs, z.B. `10.0.0.0/8, 172.16.0.0/12`, oder `uniquelocal` |

> [!WARNING]
> Vertrauen Sie nur so vielen Hops, wie tatsaechlich existieren. Vertraut `TRUST_PROXY` mehr Hops als Ihre reale Proxy-Kette, koennen Clients `X-Forwarded-For` faelschen, ihre scheinbare IP rotieren und das Rate-Limiting umgehen. Nicht gesetzt vertraut Attraccess keinen Weiterleitungs-Headern (sicherer Standard). Aenderungen werden nach einem Neustart wirksam.

## Freigegebene Websites

Nur freigegebene Websites dürfen eine angemeldete Browser-Sitzung verwenden. Andere Websites können keine API-Antworten lesen, und ihre datenändernden Anfragen (`POST`, `PUT`, `PATCH`, `DELETE`) werden mit `403` abgelehnt. Das gilt auch für Websites unter derselben übergeordneten Domain, z.B. `help.kunde.de` neben `attraccess.kunde.de`.

Diese Adressen sind automatisch freigegeben:

- die Adresse, unter der Attraccess ausgeliefert wird (Schema und `Host` der Anfrage; hinter einem Proxy siehe die Warnung unten)
- die Anwendungs-URL und die öffentliche Internet-URL aus den **Einstellungen** (eine Änderung wirkt sofort auf der Instanz, auf der sie gespeichert wird, und nach höchstens 60 Sekunden auf weiteren Instanzen)
- `ATTRACCESS_URL`, `ATTRACCESS_FRONTEND_URL` und `ATTRACCESS_PUBLIC_INTERNET_URL`
- jeder Eintrag in `ATTRACCESS_TRUSTED_ORIGINS`, einer optionalen kommagetrennten Liste exakter Origins (Schema, Host und optional Port; keine Wildcards, keine Pfade), z.B. `ATTRACCESS_TRUSTED_ORIGINS=https://portal.example.com,https://kiosk.example.com`

Die Origin `null` wird nie freigegeben. Abgelehnte Anfragen protokolliert `CrossSiteWriteGuard` als Warnung, ohne Cookie- oder Token-Werte:

```text
Refused POST /api/auth/session/local: origin_not_approved (origin=https://attraccess.example.com, served-as=http://attraccess.example.com, sec-fetch-site=same-origin). To approve a website, set ATTRACCESS_URL or add it to ATTRACCESS_TRUSTED_ORIGINS; behind a reverse proxy, set TRUST_PROXY.
```

Der Grund ist `origin_not_approved`, `cross_site_request` (kein `Origin`, aber der Browser hat die Anfrage als websiteübergreifend markiert) oder `cookie_without_origin` (ein Sitzungs-Cookie ohne `Origin`). `served-as` ist die Adresse, unter der Attraccess sich aufgerufen glaubt. Unterscheidet sie sich von `origin` nur durch `http`/`https`, beachten Sie die Warnung zu Reverse Proxies unten.

Nicht betroffen:

- Anfragen mit einem Header `Authorization: Bearer <token>` (Sitzungs- oder API-Token). Andere Verfahren, z.B. `Basic` von einem Proxy, zählen nicht.
- Anmeldung mit einfachem `curl` ohne Browser-Header
- Routen, die andere Systeme gezielt aufrufen: SAML-Assertion und -Logout, OIDC-Back-Channel-Logout, SSO-Provisionierung und der SumUp-Callback. Sie authentifizieren den Aufrufer selbst.

> [!NOTE]
> **Skripte, die das Browser-Cookie verwenden**, müssen bei Schreibzugriffen einen freigegebenen `Origin`-Header senden. Verwenden Sie besser ein Bearer-Token (z.B. ein API-Token).

> [!WARNING]
> **Reverse Proxies (vor dem Update prüfen):** Schreibt Ihr Proxy den Hostnamen um oder beendet er TLS (der Browser verwendet `https`, Attraccess sieht `http`), wird jeder Schreibzugriff aus dem Browser mit `403` abgelehnt, auch die Anmeldung und die Ersteinrichtung. Beheben Sie das in der Serverkonfiguration, denn ausgesperrte Administratoren erreichen die Einstellungen nicht:
>
> - setzen Sie `ATTRACCESS_URL` auf die öffentliche Adresse, z.B. `https://attraccess.example.com`, oder
> - setzen Sie `TRUST_PROXY` und stellen Sie sicher, dass der Proxy `X-Forwarded-Proto` sendet, und `X-Forwarded-Host`, falls er den Hostnamen umschreibt (nginx sendet `X-Forwarded-Host` standardmäßig nicht).
>
> Die Anwendungs-URL in den Einstellungen funktioniert ebenfalls, solange Sie sich noch anmelden können.

### Anmeldung erneuern

`GET /api/auth/session/refresh` gibt es nicht mehr, ein bloßes Öffnen eines Links kann eine Sitzung also nicht erneuern. Verwenden Sie `POST /api/auth/session/refresh`:

- Aufrufer mit Browser-Cookie erhalten ein neues Cookie und **kein Token** in der Antwort.
- Aufrufer mit Bearer-Token erhalten ein neues Token.

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

Der mitgelieferte Docker-Compose-Stack verdrahtet beide Dateien hinter dem Profil `fail2ban` automatisch — siehe [Docker-Compose-Installation](installation/docker-compose.md#brute-force-ip-sperre-mit-fail2ban).

## fail2ban-Administration

Wenn das Profil `fail2ban` laeuft, koennen Sie das Jail mit diesen Kommandos verwalten.

### Aktive Sperren auflisten

```bash
docker compose exec fail2ban fail2ban-client status attraccess-auth
```

Die Ausgabe enthaelt `Currently banned`, `Total banned` und die `Banned IP list`.

### IP entsperren

```bash
docker compose exec fail2ban fail2ban-client set attraccess-auth unbanip 1.2.3.4
```

### IP manuell sperren

```bash
docker compose exec fail2ban fail2ban-client set attraccess-auth banip 1.2.3.4
```

### Schwellenwerte anpassen

Standardwerte werden beim Container-Start aus `F2B_ATTRACCESS_MAXRETRY`, `F2B_ATTRACCESS_FINDTIME` und `F2B_ATTRACCESS_BANTIME` gelesen. Bearbeiten Sie `.env.docker-compose` (oder Ihr `.env`) und erstellen Sie den Dienst neu:

```bash
docker compose up -d --force-recreate fail2ban
```

Fuer ephemere Anpassung ohne Neustart:

```bash
docker compose exec fail2ban fail2ban-client set attraccess-auth maxretry 10
docker compose exec fail2ban fail2ban-client set attraccess-auth findtime 600
docker compose exec fail2ban fail2ban-client set attraccess-auth bantime 3600
```

Diese Live-Aenderungen gehen beim naechsten Neustart verloren — fuer den Dauerbetrieb sollten Sie sie ueber Umgebungsvariablen persistieren.

### Auth-Audit-Log inspizieren

```bash
docker compose logs attraccess | grep -E 'auth\.failed'
```

## Siehe auch

- [Umgebungsvariablen](installation/environment-variables.md) -- Alle Konfigurationsoptionen
- [SSL einrichten](installation/ssl-setup.md) -- HTTPS konfigurieren
- [SSO Ueberblick](user-management/sso-overview.md) -- Single Sign-On einrichten
- [Einstellungen Ueberblick](settings/overview.md) -- Alle Systemeinstellungen
