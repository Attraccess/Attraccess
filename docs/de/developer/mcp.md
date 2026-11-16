# MCP-Server (KI-Clients)

<!-- llms-description: Erklärt, wie MCP-Clients per API-Token oder OAuth mit Attraccess verbunden werden, welche Tools es gibt, wie Berechtigungen wirken und wie das geprüfte Manifest gepflegt wird. -->

Attraccess stellt seine REST-API als [Model-Context-Protocol](https://modelcontextprotocol.io/)-Server (MCP) bereit. KI-Clients wie Claude Code, MCP Inspector oder eigene Agenten können damit nach denselben Regeln wie jeder andere Zugriff Daten lesen und ändern.

- **Endpunkt:** `https://<deine-attraccess-adresse>/api/mcp` (Streamable HTTP, nur Tools).
- **Tools:** ein Tool pro REST-Operation. Der Tool-Name ist die Operation-ID aus dem OpenAPI-Dokument (zum Beispiel `getAllResources`). Die Tools werden aus der laufenden API erzeugt und passen deshalb immer zu ihr.
- **Jeder Aufruf ist ein REST-Aufruf.** Validierung, Berechtigungsprüfung, Audit-Log-Einträge und Fehlermeldungen entsprechen genau dem REST-Endpunkt. Ein REST-Fehler (400, 403, 404, ...) kommt als Tool-Fehler mit HTTP-Status und Meldung zurück.

## Mit einem API-Token verbinden

1. Erstelle unter **Konto → Erweitert → API-Tokens** einen Token (dafür brauchst du die Berechtigung `users.api-tokens.manage`) und gib ihm nur die Berechtigungen, die der Client braucht ([API-Referenz](developer/api-reference.md)).
2. Sende ihn als `Authorization: Bearer <token>`.

```bash
claude mcp add --transport http attraccess https://deine-attraccess-adresse/api/mcp \
  --header "Authorization: Bearer <token>"
```

API-Token (und damit der MCP-Zugriff mit ihnen) brauchen Valkey (`VALKEY_URL`) für ihr Anfragelimit.

Ein Token kann genau die Berechtigungen seiner Positivliste nutzen, die sein Besitzer noch hat. Verliert der Besitzer eine Berechtigung oder `users.api-tokens.manage`, wird der nächste Aufruf abgelehnt. Widerrufene und abgelaufene Token sowie Token gelöschter Besitzer erhalten `401`.

## Mit OAuth verbinden

MCP-Clients, die den MCP-Autorisierungsablauf unterstützen, brauchen keinen Token. Sie finden alles selbst:

1. Der Client ruft `/api/mcp` ohne Zugangsdaten auf und erhält `401` mit einem `WWW-Authenticate`-Header, der auf die Metadaten der geschützten Ressource zeigt (`/.well-known/oauth-protected-resource/api/mcp`).
2. Er liest `/.well-known/oauth-authorization-server` und registriert sich selbst (Dynamic Client Registration, RFC 7591). Unterstützt werden nur öffentliche Clients mit PKCE (`S256`). Weiterleitungs-URIs müssen `https` nutzen, oder `http` auf `localhost`, `127.0.0.1` oder `[::1]`, mit 1 bis 10 URIs und ohne Fragment. Der Client sendet bei der Autorisierungsanfrage und bei jeder Token-Anfrage, auch beim Erneuern, die URL des MCP-Endpunkts als `resource` (RFC 8707); alles andere wird mit `invalid_target` abgelehnt. `state` darf höchstens 1024 Zeichen lang sein.
3. Der Browser öffnet die Attraccess-Zustimmungsseite. Bist du nicht angemeldet, meldest du dich zuerst an (auch mit Zwei-Faktor-Authentifizierung oder SSO) und kehrst zur Seite zurück. Die Seite zeigt den Namen der App, wohin sie zurückkehrt und welche Berechtigungen sie anfragt. Hat sich die App selbst registriert, warnt die Seite, weil Attraccess ihren Namen nicht bestätigen kann. Innerhalb eines Frames funktioniert die Seite nicht.
4. **Erlauben** sendet dem Client einen einmaligen Autorisierungscode (2 Minuten gültig), den er am Token-Endpunkt gegen Token eintauscht. **Ablehnen** sendet ihm `access_denied`. Eine unbeantwortete Zustimmungsanfrage läuft nach 10 Minuten ab.

Ist die App unbekannt oder möchte sie zu einer Adresse zurückkehren, die sie nicht registriert hat, zeigt Attraccess eine Fehlerseite und leitet den Browser nie an diese Adresse weiter. Fehler in der Anfrage einer selbst registrierten App mit `https`-Weiterleitungs-URI erscheinen ebenfalls auf dieser Seite. Vom Betreiber registrierte Apps und Apps auf diesem Gerät (`localhost`) erhalten den Fehler als OAuth-Fehlerweiterleitung zurück.

Zugriffstoken gelten 15 Minuten. Refresh-Token werden bei jeder Nutzung rotiert und enden nach insgesamt 7 Tagen. Wird ein bereits benutzter Refresh-Token erneut vorgelegt, wird die gesamte Verbindung widerrufen. Token werden nur als Hashes mit einem aus `AUTH_SESSION_SECRET` abgeleiteten Schlüssel gespeichert. Änderst du dieses Geheimnis, enden daher alle OAuth-Verbindungen, genau wie alle Anmeldesitzungen.

Ein Client kann die benötigten Berechtigungen als durch Leerzeichen getrennten `scope` nennen. Ohne Scope fragt er alle deine Berechtigungen an. Die Zustimmungsseite markiert Berechtigungen, die du nicht hast. Erlaubst du trotzdem, erhält der Client `invalid_scope` und keinen Zugriff. Bei jeder Anfrage hat der Client die Berechtigungen, die gewährt wurden **und** die du gerade hast. Entfernst du in Attraccess eine Rolle, entfällt der Zugriff beim nächsten Aufruf.

Ein OAuth-Zugriffstoken funktioniert nur unter `/api/mcp`. REST-Endpunkte lehnen ihn ab.

Pro IP-Adresse (bei IPv6 pro /64-Netz) erlauben die Endpunkte 600 Anfragen pro Minute unter `/api/mcp` (jede Nachricht eines JSON-RPC-Batches zählt), 60 pro Minute an den Discovery-, Autorisierungs-, Token- und Zustimmungsendpunkten und 20 Registrierungen pro Stunde. Mit einem API-Token zählt jeder Tool-Aufruf einmal gegen das eigene REST-Anfragelimit des Tokens, ebenso jede MCP-Anfrage ohne Tool-Aufruf.

### Statische Clients

Clients, die sich nicht selbst registrieren können, lassen sich über die optionale Umgebungsvariable `MCP_OAUTH_CLIENTS` konfigurieren, ein JSON-Array:

```bash
MCP_OAUTH_CLIENTS='[{"client_id":"mein-agent","client_name":"Mein Agent","redirect_uris":["http://localhost:8123/callback"]}]'
```

Ein ungültiger Wert für `MCP_OAUTH_CLIENTS` wird mit einem Fehler im Log ignoriert; Attraccess startet trotzdem.

### HTTPS-Voraussetzung

OAuth gibt es nur, wenn die öffentliche URL (Einstellungen oder `ATTRACCESS_URL`) `https` nutzt oder auf localhost zeigt. Bei einer reinen HTTP-Adresse im LAN startet Attraccess trotzdem, und `/api/mcp` funktioniert mit API-Token. Die OAuth-Endpunkte antworten dann mit `404` (Fehler `oauth_disabled`), und beim Start wird eine Warnung protokolliert.

Steht ein Reverse-Proxy vor Attraccess, muss er `/.well-known/*` und `/api/mcp` an die API weiterleiten und darf `/api/mcp` nicht puffern.

## Was nicht verfügbar ist

Manche Operationen sind nie Tools, jeweils mit einem konkreten Grund: Streams und Live-Updates, Datei- und Binär-Downloads oder -Uploads, Neustart und Herunterfahren des Hosts, Installation und Aktualisierung von Plugins, gespeicherte Geheimnisse (zum Beispiel Registry-Token und Schlüsselmaterial), Registrierung neuer Konten, Anmelde- und Zugangsdaten-Abläufe (Login, Sitzungen, Passwörter, Zwei-Faktor, Passkeys, SSO-Callbacks), die Verwaltung von API-Token und die OAuth-Zustimmungsendpunkte selbst.

**Plugin-Endpunkte sind noch nicht verfügbar.** Sie sind zurückgestellt; nur die Operationen von Attraccess selbst werden zu Tools.

## Das geprüfte Manifest

`apps/api/src/mcp/reviewed-manifest.json` listet jede Operation der API mit einer Entscheidung (`allow` oder `deny`), einem Grund und einem `shape`-Hash des geprüften Vertrags. Eine neue oder geänderte Operation wird erst nach einer Prüfung bereitgestellt.

- Ein Jest-Test (`apps/api/src/mcp/mcp-manifest.drift.spec.ts`, Teil von `api:test`) erzeugt das OpenAPI-Dokument wie `export-swagger` und schlägt bei ungeprüften Operationen, veralteten Einträgen, fehlenden oder doppelten Operation-IDs, geänderten Shapes und erlaubten Operationen, die keine Tools sein können, fehl. Die Fehlermeldung nennt die Einträge, die zu ergänzen oder zu ändern sind.
- `MCP_MANIFEST_WRITE=1 pnpm nx test api --testFile=mcp-manifest.drift` schlägt Einträge vor. Prüfe jede Entscheidung im Diff, bevor du committest; die Datei gehört den Maintainern in `CODEOWNERS`.
- Ein laufender Server schlägt wegen Abweichungen nie fehl. Er überspringt ungeprüfte oder geänderte Operationen und protokolliert eine Warnung.
