# Sicherheitseinstellungen
<!-- llms-description: Sicherheitseinstellungen für Sitzungs-Cookies und Authentifizierung: SameSite, Sitzungskonfiguration, Kartenschlüssel, Rate-Limiting und Netzwerkbeschränkung. -->

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

## Kartenschlüssel, Kopplungsschlüssel der Reader und `AUTH_SESSION_SECRET`

Die Schlüssel der Attractap-Karten werden nur vom Server erzeugt und geprüft; beim Vorhalten einer Karte erfährt ein Reader ihren Schlüssel nicht. (Ausnahme sind das Registrieren und Zurücksetzen von Karten, siehe [RFID-Karten](attractap/rfid-cards.md#welche-reader-karten-registrieren-und-zurücksetzen-dürfen).) Der Server speichert jeden Schlüssel verschlüsselt mit einem aus `AUTH_SESSION_SECRET` abgeleiteten Schlüssel. Dasselbe gilt für die Kopplungsschlüssel der Reader: die privaten Schlüssel der Zertifizierungsstelle für Reader und des Serverzertifikats (siehe [Reader koppeln](attractap/pairing.md#datensicherung)).

> [!WARNING]
> **Sichern Sie `AUTH_SESSION_SECRET` zusammen mit den Datenbank-Backups.** Ohne das Secret lassen sich die gespeicherten Kartenschlüssel und Kopplungsschlüssel nicht lesen. Bereits registrierte Karten können dann weder genutzt noch von Attraccess zurückgesetzt werden und müssen mit anderen Werkzeugen gelöscht werden. Gekoppelte Reader können sich nicht mehr verbinden und müssen neu gekoppelt werden.

Der Schalter **UID-only-Karten erlauben (unsicher)** unter **Einstellungen -> RFID-Kartenregistrierung** ist standardmäßig aus. Er erlaubt günstige Karten ohne Verschlüsselung, die sich mit günstigen Werkzeugen kopieren lassen; siehe [UID-only-Karten](attractap/rfid-cards.md#uid-only-karten-unsicher).

Wird das Secret geändert, sind die gespeicherten Kartenschlüssel und Kopplungsschlüssel unlesbar, bis sie neu verschlüsselt wurden. So tauschen Sie das Secret gezielt aus:

1. Stoppen Sie die API und sichern Sie die Datenbank (siehe [Backup & Wiederherstellung](installation/backup-restore.md)). Mit Docker Compose: `docker compose stop attraccess`.
2. Laden Sie beide Secrets in Ihre Shell. `read -rs` zeigt die Eingabe nicht an, so landen die Secrets weder im Shell-Verlauf noch in der Prozessliste. Geben Sie jedes Secret ein und drücken Sie Enter:

   ```bash
   read -rs OLD_AUTH_SESSION_SECRET && export OLD_AUTH_SESSION_SECRET
   read -rs NEW_AUTH_SESSION_SECRET && export NEW_AUTH_SESSION_SECRET
   ```

3. Prüfen Sie, ob sich alle gespeicherten Kartenschlüssel und Kopplungsschlüssel mit dem alten Secret lesen lassen. `--dry-run` liest alle Schlüssel und schreibt nichts. (Der Befehl heißt `reencrypt-card-keys`, stellt aber auch die Kopplungsschlüssel der Reader um.)

   **Docker Compose** (der Befehl ist im Image enthalten; `-e NAME` ohne Wert übernimmt die Variable aus Ihrer Shell):

   ```bash
   docker compose run --rm --no-deps -e OLD_AUTH_SESSION_SECRET -e NEW_AUTH_SESSION_SECRET \
     attraccess node /app/dist/apps/api/scripts/reencrypt-card-keys.mjs --dry-run
   ```

   **Installation aus dem Quellcode** (im Wurzelverzeichnis des Repositorys, mit derselben `DATABASE_URL` und, falls gesetzt, demselben `DATABASE_SCHEMA` / `DATABASE_SSL` wie die API; der Befehl liest sie aus der Umgebung oder aus `.env`):

   ```bash
   pnpm nx run api:reencrypt-card-keys -- --dry-run
   ```

   Der Befehl verwendet die Datenbank aus `DATABASE_URL`, wie die API. Mit `--db <URL>` geben Sie eine andere PostgreSQL-Datenbank an. Stoppen Sie vorher die API und erstellen Sie ein Datenbank-Backup (`pg_dump -Fc`).
4. Führen Sie denselben Befehl ohne `--dry-run` aus. Alle Schlüssel werden in einer Transaktion umgestellt; lässt sich einer mit dem alten Secret nicht lesen, bleibt alles unverändert. Die Ausgabe nennt, wie viele Kartenschlüssel und Kopplungsschlüssel umgestellt wurden.
5. Setzen Sie `AUTH_SESSION_SECRET` auf den neuen Wert (zum Beispiel in Ihrer `.env`-Datei), löschen Sie die Shell-Variablen mit `unset OLD_AUTH_SESSION_SECRET NEW_AUTH_SESSION_SECRET` und starten Sie die API (`docker compose up -d`). Gekoppelte Reader verbinden sich wieder, ohne neu gekoppelt zu werden.

> [!WARNING]
> Der Befehl stellt nur Kartenschlüssel und Kopplungsschlüssel der Reader um. `AUTH_SESSION_SECRET` schützt alles, was Attraccess verschlüsselt speichert: auch den Lizenzschlüssel, Zugangsdaten von SSO-Anbietern, Zwei-Faktor-Geheimnisse sowie MQTT- und Zahlungs-Zugangsdaten. Nach einer Änderung lassen sich diese Werte nicht mehr lesen. Die API startet dann unter Umständen nicht mehr, weil der Lizenzschlüssel unlesbar ist, und die Werte müssen neu eingegeben werden. Tauschen Sie das Secret nur aus, wenn es sein muss, zum Beispiel nach einem Leck.

## Best Practices

- Verwenden Sie in Produktionsumgebungen immer **HTTPS**. Siehe [SSL einrichten](installation/ssl-setup.md).
- Behalten Sie die Standard-Einstellung **lax** fuer Cookie SameSite bei, es sei denn, Sie haben einen bestimmten Grund, sie zu aendern.
- Erzeugen Sie bei der Ersteinrichtung einen starken `AUTH_SESSION_SECRET` und bewahren Sie ihn sicher auf.
- Passen Sie `SESSION_COOKIE_MAX_AGE` an Ihre Sicherheitsanforderungen an. Kuerzere Dauern sind sicherer, erfordern aber haeufigeres Anmelden.

## Drosselung und Kontosperre

Fehlgeschlagene Anmeldungen, Registrierungen, Passwort-Zuruecksetzungen, erneut angeforderte Bestaetigungs-E-Mails, das Aendern der E-Mail-Adresse eines unbestaetigten Kontos, SSO-Kontoverknuepfungen und SSO-Provisionierungsaufrufe werden pro IP gedrosselt. Wiederholte Login-Fehlversuche, falsche Passwoerter bei der SSO-Kontoverknuepfung und falsche Passwoerter beim Aendern der E-Mail-Adresse eines unbestaetigten Kontos sperren zusaetzlich das betroffene Konto. Werte sind unter **Einstellungen -> Drosselung & Kontosperre** einstellbar.

| Einstellung | Standard | Beschreibung |
|-------------|----------|-------------|
| `maxAttempts` | `5` | Erlaubte Fehlversuche pro Zeitfenster, bevor Drosselung oder Sperre greift. |
| `windowSeconds` | `900` | Zeitfenster fuer das Zaehlen der Fehlversuche. |
| `lockoutDurationSeconds` | `900` | Grundsperrdauer. |
| `exponentialBackoff` | `false` | Wenn `true`, waechst die Sperrdauer bei jeder Wiederholung um den Faktor `backoffMultiplier`. |
| `backoffMultiplier` | `2` | Multiplikator fuer die Sperrdauer bei wiederholten Sperren. |

Antworten bei Ausloesung:

- **`429 Too Many Requests`** mit `Retry-After`-Header, wenn eine IP die Schwelle ueberschreitet.
- **`423 Locked`** mit `Retry-After`-Header bei einem gesperrten Konto, sowohl beim Login als auch bei der SSO-Kontoverknuepfung.

Erfolgreicher Login, erfolgreiche SSO-Kontoverknuepfung oder Admin-Unlock entsperrt das Konto. Admin-Unlock erfolgt ueber die Benutzerverwaltung.

### SSO-Kontoverknuepfung und Provisionierung

- **SSO-Kontoverknuepfung** (die Passwortabfrage, wenn eine SSO-Anmeldung zu einem bestehenden lokalen Konto passt) wird pro IP und Zielkonto gedrosselt. Falsche Passwoerter zaehlen zur selben Kontosperre wie fehlgeschlagene Logins, ein Wechsel zwischen beiden bringt also keine zusaetzlichen Versuche. Eine erfolgreiche Verknuepfung setzt die Zaehler zurueck.
- **Verknuepfungs-Token sind einmalig verwendbar.** Ein Token wird nach erfolgreicher Verknuepfung und nach 3 falschen Passwoertern ungueltig; der Benutzer muss sich dann erneut per SSO anmelden.
- **SSO-Provisionierungsendpunkte** (vom IdP ausgeloeste Abmeldung, Benutzerloeschung und Berechtigungsaktualisierung) werden pro IP und Provider gedrosselt. Nur ein fehlendes oder falsches Provisionierungs-Secret zaehlt als Fehlversuch. Andere Fehler, etwa ein unbekannter Benutzer, zaehlen nicht, ein normaler IdP sperrt sich dadurch also nicht aus. Ein IdP mit falschem Secret erhaelt nach `maxAttempts` Fehlversuchen `429` mit `Retry-After`-Header statt `401`. Cloud-IdPs senden diese Aufrufe oft von gemeinsam genutzten ausgehenden IPs; die Drosselung gilt dann fuer diese gemeinsame IP bei diesem Provider.

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

Dieselbe Client-IP gilt für die Begrenzungen der Anfragen zur [Attractap-Reader-Kopplung](attractap/pairing.md) (pro Adresse). Stellen Sie außerdem sicher, dass der Proxy den Header `Sec-WebSocket-Protocol` durchreicht, über den Reader ihre verschlüsselte Verbindung wählen.

## Netzwerkbeschränkung

Die **Netzwerkbeschränkung** erlaubt ausgewählte Ressourcen-Aktionen nur aus Ihrem lokalen Netzwerk. Sie ist standardmäßig aus und wird unter **Einstellungen → Sicherheit → Netzwerkbeschränkung** eingerichtet. Änderungen gelten sofort auf der Instanz, auf der Sie speichern; weitere Instanzen mit derselben Datenbank übernehmen sie innerhalb von etwa einer Minute (Cache der Einstellungen).

Ist sie an, entscheidet Attraccess für jede HTTP-Anfrage, ob der Aufrufer aus einem **erlaubten Netzwerk** kommt. Für Aufrufer von außerhalb werden die folgenden Aktionen mit HTTP `403` und dem Fehlercode `NETWORK_RESTRICTED` abgelehnt, es sei denn, eine Rolle des Aufrufers erlaubt die Aktion von außerhalb. Das gilt für Browser-Sitzungen, API-Tokens und MCP-Tool-Aufrufe gleichermaßen.

| Aktion | Was sie umfasst |
|--------|-----------------|
| Sitzung starten | Eine Nutzungssitzung starten |
| Sitzung übernehmen | Eine Sitzung mit Übernahme starten |
| Sitzung beenden | Eine Sitzung beenden (die eigene oder die eines anderen Nutzers) |
| Tür öffnen / Tür aufschließen / Falle öffnen / Tür abschließen | Die Türsteuerung einer Ressource |
| Beaufsichtigung anfragen | Einen beaufsichtigten Start anfragen |
| Beaufsichtigung genehmigen | Eine Anfrage für einen beaufsichtigten Start genehmigen (Ablehnen ist nie eingeschränkt) |

Eine beaufsichtigte Anfrage, die die Sitzung eines anderen Nutzers übernimmt, braucht sowohl **Beaufsichtigung anfragen** als auch **Sitzung übernehmen**. Bei einer Tür mit „Nur Zutritt“ öffnet ein über die API gesendetes Aufschließen die Tür und braucht daher **Tür öffnen**.

### Einstellungen

| Einstellung | Beschreibung |
|-------------|--------------|
| **Aktionen auf das lokale Netzwerk beschränken** | Standardmäßig aus. Solange sie aus ist, ändert sich nichts. |
| **Erlaubte Netzwerke** | Pro IP-Adresse oder CIDR-Bereich (IPv4 und IPv6) ein Tag mit Entfernen-Schaltfläche, zum Beispiel `10.0.0.0/8`, `192.168.0.0/16`, `fc00::/7`. Geben Sie einen Eintrag ein und klicken Sie auf **Hinzufügen** (oder drücken Sie Enter). Mehrere Einträge, getrennt durch Kommas, Semikolons oder Leerzeichen, können auf einmal eingefügt werden. Ein ungültiger Wert wird am Feld genannt und aus dieser Eingabe wird nichts übernommen; ein Eintrag, der in beliebiger Schreibweise schon in der Liste steht (`10.0.0.1/8` ist `10.0.0.0/8`), wird übersprungen. Die Liste fasst höchstens 200 Einträge, und auch der Server lehnt beim Speichern einen ungültigen Eintrag ab und nennt ihn. Text, der beim Verlassen des Feldes noch darin steht, wird übernommen oder, wenn er ungültig ist, am Feld genannt. Unter der Liste bieten Schnellauswahl-Schaltflächen das /24-Netz (IPv4) bzw. /64-Netz (IPv6) Ihrer eigenen Verbindung und Ihre Adresse an, die Netze der Netzwerkschnittstellen des Servers, die privaten Bereiche (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`) sowie Loopback und Link-lokal; ein Vorschlag, den die Liste schon enthält oder der in einem größeren Eintrag liegt, wird ausgeblendet. Prüfen Sie einen vorgeschlagenen Bereich, bevor Sie ihn hinzufügen: Ein öffentliches Netz des Servers oder das Netz eines Reverse Proxys lässt jeden Aufrufer darin als lokal gelten. Wird die Beschränkung bei leerer Liste eingeschaltet, werden die privaten Bereiche sowie Loopback und Link-lokal (`127.0.0.0/8`, `::1/128`, `169.254.0.0/16`, `fe80::/10`) eingetragen; Sie können sie vor dem Speichern entfernen. Die Liste darf nicht leer sein, solange die Beschränkung an ist. IPv4-gemappte IPv6-Adressen (`::ffff:10.0.0.5`) werden als IPv4 geprüft. |
| **Adressquelle** | Woher die Adresse des Aufrufers stammt, siehe unten. |
| **Von außerhalb erlaubt, pro Rolle** | Eine Tabelle mit einer Zeile pro Rolle und einer Spalte pro Aktion. Ein gesetzter Haken erlaubt den Mitgliedern der Rolle die Aktion auch außerhalb des erlaubten Netzwerks. Ein Nutzer darf eine Aktion, wenn **eine** seiner Rollen sie erlaubt. Neue Rollen erlauben von außerhalb nichts, und Administratoren sind **nicht** ausgenommen: Setzen Sie auch bei ihnen Haken, wenn sie den Zugriff behalten sollen. Die Tabelle lässt sich auch bearbeiten, solange die Beschränkung aus ist. |

Die Karte zeigt die Adresse, die Attraccess bei Ihnen erkennt, und ob sie mit den gespeicherten Einstellungen in den erlaubten Netzwerken liegt. Prüfen Sie das, bevor Sie die Beschränkung einschalten. Gespeichert und verworfen wird die Karte wie die anderen Sicherheitseinstellungen über die gemeinsame Leiste am unteren Rand.

### Adressquelle

| Quelle | Verhalten |
|--------|-----------|
| **Client-Adresse** (Standard) | Die Adresse, die Attraccess für die Anfrage ermittelt. Hinter einem Reverse Proxy setzen Sie `TRUST_PROXY` (siehe [Reverse Proxies und die echte Client-IP](#reverse-proxies-und-die-echte-client-ip)); ohne diese Einstellung wirkt jede Anfrage, als käme sie vom Proxy, meist einer privaten Adresse, und alle gälten als lokal. `X-Forwarded-For` wird ignoriert, solange `TRUST_PROXY` nicht gesetzt ist. |
| **Request-Header** | Die Adresse wird aus einem Header gelesen, standardmäßig `X-Real-Ip`, den Traefik setzt. Enthält der Header eine kommagetrennte Liste, zählt der **letzte** Eintrag, den Ihr nächster Proxy geschrieben hat. Fehlt der Header, ist er leer oder keine IP-Adresse, gilt der Aufrufer als **außerhalb**. |

> [!WARNING]
> **Der Header-Modus ist nur sicher, wenn Attraccess ausschließlich über den Proxy erreichbar ist, der den Header überschreibt.** Kann ein Client Attraccess direkt erreichen, oder reicht der Proxy einen vom Client gesendeten Header unverändert durch, kann der Client `X-Real-Ip: 192.168.1.10` senden und wirkt lokal. Nutzen Sie **Client-Adresse** mit `TRUST_PROXY`, sofern Sie den Netzwerkpfad nicht selbst kontrollieren.

### Beispiel: Traefik

Lassen Sie Attraccess entweder die Client-Adresse vom Proxy übernehmen oder den Header lesen, den Traefik setzt:

| Aufbau | Attraccess |
|--------|------------|
| Client-Adresse (empfohlen) | `TRUST_PROXY=1` für den Attraccess-Container setzen und **Client-Adresse** wählen. |
| Request-Header | **Request-Header** mit dem Namen `X-Real-Ip` wählen und sicherstellen, dass nur Traefik den Attraccess-Port erreicht. |

Tragen Sie Ihre LAN- und VPN-Bereiche unter **Erlaubte Netzwerke** ein, zum Beispiel `192.168.0.0/16`, und schalten Sie die Beschränkung dann ein. Hinter Traefik auf demselben Docker-Host verbindet sich der Proxy selbst von einer privaten Adresse; deshalb kommt es auf die Adressquelle an.

### Was nie eingeschränkt wird

Physische Reader (Attractap), Plugin-Reader und Geräte-Integrationen, Flows und andere Automatisierungen sowie Reservierungen starten und beenden Sitzungen wie bisher, egal was die Beschränkung sagt. Alles andere, etwa das Ansehen von Ressourcen, die Benutzerverwaltung und die Einstellungen, bleibt von überall erreichbar, damit ein Administrator die Konfiguration immer korrigieren kann.

Ein blockierter Versuch steht im Server-Log auf Stufe `warn` (Nutzer, Aktion, Ressource und erkannte Adresse). Er ist kein Audit-Log-Ereignis. Änderungen an der Netzwerkbeschränkung und an der Rollentabelle werden wie andere Einstellungsänderungen im Audit-Log festgehalten.

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
> Schreibzugriffe, die nur einen `x-api-key`-Header enthalten, werden weiterhin geprüft. Eine Website, die im Browser mit einem API-Key aufruft, muss in `ATTRACCESS_TRUSTED_ORIGINS` stehen oder stattdessen ein Bearer-Token verwenden.

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
| `type` | `login`, `register`, `password_reset_request`, `verification_email_resend`, `unverified_email_change`, `password_reset_complete`, `sso_link_account`, `sso_provisioning`. |
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
failregex = ^.*auth\.failed type=(?:login|register|password_reset_request|verification_email_resend|unverified_email_change|password_reset_complete|sso_link_account) outcome=\S+ ip=<HOST> .*$
ignoreregex =
```

Der mitgelieferte Docker-Compose-Stack verdrahtet beide Dateien hinter dem Profil `fail2ban` automatisch — siehe [Docker-Compose-Installation](installation/docker-compose.md#brute-force-ip-sperre-mit-fail2ban).

> [!NOTE]
> Fehlgeschlagene SSO-Provisionierungsanfragen (falsches Bearer- oder `x-api-key`-Secret) werden als `auth.failed type=sso_provisioning` geloggt, vom mitgelieferten Filter aber nicht erfasst. Wuerde die IP eines Identity Providers gesperrt, bliebe auch dessen Back-Channel-Abmeldung aus, und Attraccess drosselt diese Anfragen bereits selbst (`429`). Wer trotzdem Firewall-Sperren dafuer will, ergaenzt `sso_provisioning` im `failregex`.

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
- [Sichtbarkeit der Maschinenliste](settings/overview.md#sichtbarkeit-der-maschinenliste) -- Wer welche Maschinen sieht
