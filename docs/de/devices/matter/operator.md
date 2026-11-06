# Matter: Betriebsanleitung

> **Nur Konnektivität.** Der Sidecar lässt sich bauen, starten, absichern und mit Attraccess verbinden, steuert aber noch keine Geräte. Lesen Sie zuerst die [Architektur](devices/matter/architecture.md).

## Bauen und starten

```bash
pnpm nx run matter-sidecar:build
export MATTER_SIDECAR_AUTH_TOKEN="$(openssl rand -base64 48)"   # Wert aufbewahren: das Plugin braucht ihn
node dist/apps/matter-sidecar/main.js
```

Der Build bündelt den Sidecar in `dist/apps/matter-sidecar/main.js` und stempelt die aktuelle Git-Revision ein. matter.js wird zur Laufzeit aus `node_modules` geladen, es läuft also das festgelegte Release. Erforderlich ist Node.js `>=24.22.1 <25`.

Der Sidecar **startet nicht ohne Service-Token** (siehe unten). Beim Start lädt er matter.js, öffnet aber keine Matter-Ports (UDP 5540, mDNS), schreibt keinen Matter-Speicher und erzeugt keine Fabric. Standardmäßig lauscht er nur auf `127.0.0.1`. Bevorzugen Sie, wo möglich, `MATTER_SIDECAR_AUTH_TOKEN_FILE` (eine Datei oder ein Deployment-Secret) gegenüber der Umgebungsvariable, weil Umgebungsvariablen für andere Prozesse desselben Benutzers sichtbar sind.

## Konfiguration

Alle Einstellungen sind Umgebungsvariablen und werden validiert, bevor der Sidecar lauscht. Eine leere Variable gilt als nicht gesetzt. Ein fehlender oder ungültiger Wert beendet nur den Sidecar und nennt die zu korrigierende Variable.

| Variable                                                       | Standard         | Bereich                        | Bedeutung                                                                                                                                                        |
| -------------------------------------------------------------- | ---------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MATTER_SIDECAR_AUTH_TOKEN` / `MATTER_SIDECAR_AUTH_TOKEN_FILE` | **erforderlich** | 32–512 druckbare ASCII-Zeichen | Das Service-Token. Die Datei-Variante wird beim Start gelesen, umgebende Leerzeichen werden entfernt. Setzen Sie nur eine der beiden.                            |
| `MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS` / `…_PREVIOUS_FILE`       | nicht gesetzt    | wie oben                       | Das alte Token, das während einer Rotation zusätzlich zum aktuellen akzeptiert wird.                                                                             |
| `MATTER_SIDECAR_BIND_HOST`                                     | `127.0.0.1`      | eine Adresse                   | Adresse, auf der gelauscht wird. Alles außer Loopback braucht die nächsten zwei Zeilen.                                                                          |
| `MATTER_SIDECAR_ALLOWED_HOSTS`                                 | nicht gesetzt    | kommagetrennte Namen           | Zusätzlich zu Loopback akzeptierte `Host`-Namen. **Pflicht**, wenn die Bind-Adresse nicht Loopback ist.                                                          |
| `MATTER_SIDECAR_TLS_CERT_FILE` / `MATTER_SIDECAR_TLS_KEY_FILE` | nicht gesetzt    | PEM-Dateipfade                 | HTTPS und WSS anbieten. Beide oder keine setzen.                                                                                                                 |
| `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE`                         | `false`          | `true` / `false`               | Nicht-Loopback-Bindung **ohne** TLS erlauben, für ein vertrauenswürdiges Container-Netz oder einen TLS-terminierenden Reverse-Proxy. Protokolliert eine Warnung. |
| `MATTER_SIDECAR_PORT`                                          | `8581`           | `0`–`65535`                    | TCP-Port (`0` wählt einen freien Port)                                                                                                                           |
| `MATTER_SIDECAR_MAX_MESSAGE_BYTES`                             | `1048576`        | `1`–`16777216`                 | Größter Request-Body und größte WebSocket-Nachricht                                                                                                              |
| `MATTER_SIDECAR_REQUEST_DEADLINE_MS`                           | `10000`          | `1`–`60000`                    | Frist einer Anfrage                                                                                                                                              |
| `MATTER_SIDECAR_SHUTDOWN_GRACE_MS`                             | `5000`           | `1`–`60000`                    | Zeit für das Herunterfahren                                                                                                                                      |
| `MATTER_SIDECAR_REPLAY_MAX_EVENTS`                             | `1000`           | `1`–`100000`                   | Für die Wiedergabe vorgehaltene Events                                                                                                                           |
| `MATTER_SIDECAR_REPLAY_MAX_AGE_MS`                             | `300000`         | `1`–`86400000`                 | Höchstalter wiedergebbarer Events                                                                                                                                |
| `MATTER_SIDECAR_CLIENT_QUEUE_BYTES`                            | `1048576`        | `1`–`67108864`                 | Warteschlangenbudget je WebSocket-Client, einschließlich der Wiedergabe nach einem Neuverbinden                                                                  |

Der Sidecar startet nicht (und nennt die zu korrigierende Variable), wenn: kein Token gesetzt ist, ein Token falsche Länge oder Zeichen hat, sowohl `X` als auch `X_FILE` gesetzt sind, die Bind-Adresse nicht Loopback ist und kein erlaubter Host angegeben ist, die Bind-Adresse nicht Loopback ist ohne TLS und ohne `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true`, oder nur eine der Dateien für Zertifikat und Schlüssel gesetzt ist.

### Ein Token erzeugen

```bash
openssl rand -base64 48
```

Jede Folge von 32–512 druckbaren ASCII-Zeichen (ohne Leerzeichen) funktioniert. Behandeln Sie das Token wie ein Passwort. Der Sidecar nimmt es auch aus einer Datei: `MATTER_SIDECAR_AUTH_TOKEN_FILE=/run/secrets/matter-token`.

## Attraccess mit dem Sidecar verbinden

1. Installieren Sie das Matter-Plugin (es braucht Attraccess 1.11.0 oder neuer). Es fordert die Berechtigungen `DATABASE_ACCESS` und `MANAGE_SECRETS` an.
2. Öffnen Sie **Geräte → Matter** (sichtbar für Benutzer mit der Berechtigung `system.plugins.manage`).
3. Geben Sie die **Sidecar-URL** (zum Beispiel `http://127.0.0.1:8581`) und das **Token** ein und klicken Sie auf **Speichern**. Tragen Sie ein **CA-Zertifikat** nur ein, wenn der Sidecar eine private CA verwendet.

Die Seite zeigt den Verbindungszustand und aktualisiert ihn alle fünf Sekunden. Nach dem Speichern sollte sie innerhalb weniger Sekunden **Verbunden** erreichen und die Versionen von Sidecar, matter.js und Wire-Protokoll anzeigen. Das Token wird verschlüsselt gespeichert und nie wieder angezeigt; mit **Ersetzen** geben Sie ein neues ein. **Konfiguration entfernen** löscht die Einstellungen und trennt die Verbindung.

| Zustand                             | Was zu tun ist                                                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nicht konfiguriert                  | URL und Token eingeben.                                                                                                                                                                                                                                          |
| Eingeschränkt – nicht erreichbar    | Prüfen Sie, ob der Sidecar läuft, sowie URL, Port und Firewall. Die Seite zeigt, wann der nächste Versuch stattfindet. Sobald der Sidecar wieder da ist, verbindet sie sich selbst.                                                                              |
| Eingeschränkt – nicht autorisiert   | Der Sidecar hat das Token abgelehnt. Vergleichen Sie es mit `MATTER_SIDECAR_AUTH_TOKEN` (bei einer Rotation auch mit dem vorherigen Token) und geben Sie es erneut ein.                                                                                          |
| Eingeschränkt – inkompatibel        | Die Seite zeigt die empfangene und die unterstützte Kombination. **Aktualisieren oder downgraden** Sie Attraccess, das Plugin oder den Sidecar auf eine unterstützte Kombination. „Host-Version nicht verfügbar“ bedeutet, dass Attraccess älter als 1.11.0 ist. |
| Eingeschränkt – falsch konfiguriert | Prüfen Sie die URL (und das Pfadpräfix) und ob das CA-Zertifikat zu Sidecar-Zertifikat und Hostnamen passt. Die Zertifikatsprüfung lässt sich nicht abschalten.                                                                                                  |

Eine Warnung erscheint, wenn die URL unverschlüsseltes `http` zu einer anderen Adresse als diesem Rechner nutzt: Das Token würde unverschlüsselt durchs Netz gehen.

## Topologien

- **Gleicher Host, Loopback (empfohlen).** Betreiben Sie den Sidecar neben Attraccess mit den Standardwerten. URL `http://127.0.0.1:8581`. TLS ist nicht nötig: Der Verkehr verlässt den Rechner nie.
- **Container-Netz.** Legen Sie Sidecar und Attraccess in ein privates Netz, das nur sie teilen:
  `MATTER_SIDECAR_BIND_HOST=0.0.0.0`, `MATTER_SIDECAR_ALLOWED_HOSTS=matter-sidecar` (der Name, den Attraccess verwendet) und entweder TLS (`MATTER_SIDECAR_TLS_CERT_FILE`/`…_KEY_FILE`, mit der CA auf der Matter-Seite) oder `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true`. Veröffentlichen Sie den Port weder im Host-Netz noch im Internet. URL `http://matter-sidecar:8581`.
- **Reverse-Proxy mit TLS und Pfadpräfix.** Der Proxy terminiert TLS und leitet `https://example.com/matter/…` an den Sidecar weiter. Der Proxy muss das Präfix entfernen, WebSocket-Upgrades und den `Authorization`-Header weiterreichen und einen in `MATTER_SIDECAR_ALLOWED_HOSTS` aufgeführten `Host`-Namen übergeben. Die URL `https://example.com/matter` führt zu `/matter/v1/...`.

## Token-Rotation

Rotieren Sie das Token, ohne etwas neu zu bauen und ohne die Verbindung zu verlieren:

1. Setzen Sie das **neue** Token als `MATTER_SIDECAR_AUTH_TOKEN` und das **alte** als `MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS` (Deployment-Secrets oder Dateien) und starten Sie den Sidecar neu. Das Plugin bleibt verbunden, weil das alte Token weiter akzeptiert wird.
2. Geben Sie das **neue** Token auf der Matter-Seite ein (**Ersetzen**, dann **Speichern**). Das Plugin verbindet sich damit neu.
3. Entfernen Sie `MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS` und starten Sie den Sidecar neu.

Token-Dateien werden nur beim Start gelesen, daher braucht jeder Schritt einen Neustart.

## Health und Version

```bash
curl http://127.0.0.1:8581/health/live
curl http://127.0.0.1:8581/health/ready
curl -H "Authorization: Bearer $MATTER_SIDECAR_AUTH_TOKEN" http://127.0.0.1:8581/version
```

- `/health/live` antwortet `{"status":"live"}`, solange der Prozess läuft.
- `/health/ready` antwortet mit 200 und `"status":"ready"`, sobald Konfiguration, matter.js-Start und Transport erfolgreich waren. Während das Sidecar herunterfährt, antwortet es mit 503 und `"draining"`. Das Sidecar öffnet seinen Port erst nach dem Start, daher erreicht `"starting"` in diesem Release keinen Aufrufer. Das Feld `fabric` (in diesem Release `uninitialized`) wird getrennt gemeldet und beeinflusst die Bereitschaft nie.
- `/version` braucht das Token. Es meldet `build.version` und `build.commit` (die Git-Revision, aus der gebaut wurde), `sidecar` (das Sidecar-Release), `matterJs` (das tatsächlich geladene matter.js-Release), `storageSchemaVersion` (`1`; die Meldung fügt keine Persistenz hinzu) und `wireVersion` (`1`).

`/health/live` und `/health/ready` sind anonym, damit Container-Probes funktionieren, und verraten keine Versionen. `/version` braucht das Token, aber keine Kompatibilitäts-Header und bleibt daher nutzbar, während Sie ein Versionsproblem untersuchen. Ohne gültiges Token lautet die Antwort HTTP 401, und es wird nichts über Versionen verraten.

## Eine inkompatible Kombination

Eine `/v1/`-Anfrage oder ein WebSocket-Upgrade auf `/v1/events` mit nicht unterstützter Release-Kombination scheitert mit HTTP 409:

```json
{
  "error": {
    "code": "incompatible_release",
    "message": "Attraccess, the Matter plugin and the Matter sidecar are not a supported combination. Upgrade or downgrade one of them to a supported combination.",
    "correlationId": "5a1f6c0e-6f55-4a53-9a6e-2c6d6b0f5b1c",
    "retryable": false,
    "details": {
      "received": { "wireVersion": 1, "attraccess": "1.10.0", "plugin": "0.2.0-alpha.0", "sidecar": "0.2.0-alpha.0" },
      "problems": [],
      "running": { "sidecar": "0.2.0-alpha.0", "matterJs": "0.18.0" },
      "supported": [
        {
          "wireVersion": 1,
          "attraccess": "^1.11.0",
          "plugin": "0.2.0-alpha.0",
          "sidecar": "0.2.0-alpha.0",
          "matterJs": "0.18.0"
        }
      ]
    }
  }
}
```

Die Fehlermeldung ist englisch, weil sie Teil des Vertrags ist. Fehlerhafte oder fehlende Release-Werte werden nie zurückgegeben; sie erscheinen als `null` in `received` und stehen in `problems` (zum Beispiel `plugin:malformed`).

So beheben Sie es: Vergleichen Sie `received` mit `supported` und **aktualisieren oder downgraden** Sie Attraccess, das Matter-Plugin oder den Sidecar, bis alle drei einer unterstützten Kombination entsprechen. Mit `/version` sehen Sie, was der Sidecar ausführt. Eine falsche Wire-Version liefert HTTP 426 und nennt die unterstützte Version. Es gibt keinen Fallback auf eine andere Wire-Version: Ein nicht passender Sidecar muss aktualisiert oder zurückgesetzt werden.

## Herunterfahren

`SIGTERM` und `SIGINT` fahren den Sidecar geordnet herunter: Er meldet sich als nicht bereit, nimmt keine neue Arbeit an, schließt WebSocket-Clients mit Code 1001, beendet laufende Anfragen und endet innerhalb der Schonfrist. Wiederholte Signale sind unbedenklich. Ein Fehler einer Anfrage oder eines Clients beendet den Prozess nie, und ein fataler Fehler beendet nur den Sidecar, mit einer verständlichen Meldung auf stderr. Ist der Port bereits belegt, rät die Meldung, `MATTER_SIDECAR_PORT` auf einen freien Port zu setzen. Attraccess läuft weiter.

## Sicherheitshinweise

- Jede Anfrage außer `/health/live` und `/health/ready` braucht `Authorization: Bearer <token>`. Halten Sie das Token geheim, übergeben Sie es dem Sidecar über ein Secret oder eine Datei und rotieren Sie es mit dem obigen Ablauf, wenn es abgeflossen sein könnte. Es gibt keine Sperre; Länge und Zufälligkeit schützen das Token, verwenden Sie daher ein erzeugtes.
- Behalten Sie die Loopback-Bindung bei, solange der Sidecar nicht über ein Netzwerk erreichbar sein muss. Für eine entfernte Bindung nutzen Sie TLS (und tragen die CA auf der Matter-Seite ein) oder ein vertrauenswürdiges privates Netz. `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true` sendet das Token unverschlüsselt und darf kein nicht vertrauenswürdiges Netz queren.
- Anfragen mit Browser-`Origin`-Header werden mit HTTP 403 abgewiesen, ebenso ein `Host`, der weder Loopback noch in `MATTER_SIDECAR_ALLOWED_HOSTS` ist. Diese Prüfung läuft vor der Authentifizierung.
- Fehlgeschlagene Authentifizierungen werden auf Warn-Ebene protokolliert (ratenbegrenzt) und enthalten nie das Token oder den Header-Wert. Setup-Codes, Thread-Datasets und Fabric-Geheimnisse erscheinen nie in Logs, Events oder Health-Ausgaben.
- Zertifikate und Token-Dateien werden beim Start gelesen. Erneuern oder rotieren Sie sie mit einem Neustart.

## Prüfungen und erzeugte Dokumente

```bash
pnpm nx run-many -t lint,typecheck,test -p matter-contract,matter-sidecar
pnpm nx run matter-sidecar:test-integration   # echtes lokales HTTP und WebSocket, simulierte Matter-Funktionen
pnpm nx run matter-sidecar:test-built         # der gebaute Prozess
pnpm nx run matter-contract:export-contracts  # schreibt dist/contracts/matter/
pnpm nx run matter-contract:test-artifacts
pnpm nx run-many -t lint,typecheck,test,e2e,pack-test -p plugin-matter   # e2e startet das Plugin gegen den echten Sidecar, einschließlich SIGTERM/SIGKILL
```

Die Tests simulieren Matter-Funktionen und -Geräte. Echtes Commissioning, echte Geräte, Thread und OTA bleiben bis zu späteren Tickets ungetestet.
