# Betrieb des Matter-Sidecars

Dies ist ein Fundament für lokale Entwicklung. Installierbares Plugin-Paket, Diagnose, Kompatibilitätsprüfung und Ereignistransport funktionieren; Gerätefunktionen, Dienstauthentifizierung und Produktionsbetrieb folgen später. Siehe [Architektur](devices/matter-architecture.md).

## Bauen und starten

Node >=24 und die pnpm-Abhängigkeiten des Repositorys verwenden:

```bash
pnpm nx run-many -t build,typecheck,lint,test -p matter-contract,matter-sidecar,plugin-matter
pnpm nx run matter-sidecar:integration-test
pnpm nx run matter-contract:export-contract
pnpm nx run matter-contract:validate-artifacts
pnpm nx run plugin-matter:pack-test
MATTER_PORT=3080 pnpm nx run matter-sidecar:start
```

Alternativ nach dem Build `node dist/apps/matter-sidecar/main.mjs` starten. Plugin-Paket: `apps/plugins/matter/package`; den vorhandenen Plugin-Installationsablauf verwenden. Das Plugin startet bewusst keine Verbindungen und stellt keine Geräterouten bereit. Es verlangt exakt Host 1.10.0.

`MATTER_HOST` ist standardmäßig `127.0.0.1` und erlaubt nur `127.0.0.1` oder `::1`. `MATTER_PORT` ist standardmäßig `3080`; Bereich `0–65535` wird vor dem Lauschen geprüft. Port `0` lässt einen freien Port zuweisen; die Bereitmeldung nennt ihn. Portkonflikte verhindern den Start. Ungültige/extern bindende Konfiguration beendet den Sidecar mit einer verständlichen Diagnose; Core läuft weiter.

Die Anwendungsfabrik prüft begrenzte Einstellungen für eingebettete Tests/Adapter: standardmäßig 1 MiB JSON-/WebSocket-Nachrichten, 10 Sekunden REST-Frist, 10 Sekunden erste Wiederaufnahme-Frist, 1 MiB Ausgangswarteschlange pro Client, 1.000 Wiederholungsereignisse, fünf Minuten Pufferalter und fünf Sekunden zum Herunterfahren. Das eigenständige Programm bietet hier nur Adresse/Port als Konfiguration an. Zu große REST-Anfragen liefern `413`, WebSocket-Nachrichten schließen die Verbindung; stockende REST-Uploads liefern `504`. Operationen enthalten endliche UTC-Fristen und Abbruch-IDs, aber Abbruchhandler sind noch nicht verfügbar.

Der Sidecar ist noch nicht in `pnpm serve` integriert. Core separat mit `pnpm serve --only=api` starten und die zugewiesene API-URL aus `.dev-serve-ports.json` lesen. Niemals annehmen, dass Port 3000 diesem Worktree gehört.

## Verfügbarkeit prüfen

```bash
curl http://127.0.0.1:3080/health/live
curl http://127.0.0.1:3080/health/ready
curl http://127.0.0.1:3080/version
```

Liveness bedeutet, dass der Prozess antwortet. Readiness bedeutet: Konfiguration, festgelegte native matter.js-Plattform/Kryptografie und Transport wurden initialisiert, und das Herunterfahren hat nicht begonnen. Sie ist unabhängig von einer Fabric: `fabricInitialized` bleibt `false`. Eine fehlende Fabric ist kein Bereitschaftsfehler. `/health/ready` liefert bei fehlender Bereitschaft `503` und erklärt Initialisierung/Herunterfahren in seinem festen Schema.

`/version` meldet Build-Version/Git-Revision, Sidecar-Release, geladenes/geprüftes matter.js-Release, Speicherschema `1`, Nachrichtenformat `1`, Fähigkeiten und die unterstützte Release-Kombination. Das Speicherschema verspricht keine Persistenz oder Migrationen. Beim Start wird keine Fabric erstellt.

Bei Startfehlern Node >=24, exakte Abhängigkeiten, Loopback-Adresse und freien Port prüfen. Gesperrte Abhängigkeiten neu installieren, falls das geladene matter.js abweicht. Build-Prüfungen lehnen abweichende Release-/Manifestangaben vor dem Start ab. Anfrage-/Clientfehler werden abgefangen. Ein fataler Laufzeitfehler beendet nur den Sidecar.

## Versionskonflikte lösen

Beispiel: Plugin 0.2.0 wird trotz Nachrichtenformat 1 abgelehnt:

```bash
curl -i http://127.0.0.1:3080/v1/capabilities \
  -H 'x-matter-wire-version: 1' \
  -H 'x-attraccess-version: 1.10.0' \
  -H 'x-matter-plugin-version: 0.2.0' \
  -H 'x-request-id: 00000000-0000-4000-8000-000000000001'
```

Erwartet: `409 INCOMPATIBLE_RELEASE`, empfangene/unterstützte Kombination und Aufforderung zum Aktualisieren/Zurückstufen. **Attraccess 1.10.0, Plugin 0.1.0 und Sidecar 0.1.0** angleichen; Prüfung nicht umgehen. Fehlende/abweichende Formatangaben liefern einen Version-1-Fehler mit `426`; fehlende/ungültige Anfrage-UUID liefert `400`. Diagnose bleibt erreichbar, um die unterstützte Kombination zu lesen.

## Stoppen und wiederanlaufen

SIGTERM/SIGINT setzen sofort unbereit, stoppen neue Verbindungen/Arbeit, veröffentlichen den Lebenszyklusstatus zum Herunterfahren, schließen WebSockets, lassen HTTP-Anfragen auslaufen und geben initialisierte Plattformressourcen frei. Wiederholtes Herunterfahren ist sicher und standardmäßig auf fünf Sekunden begrenzt. Nicht reagierende Verbindungen/Ressourcen werden an der Grenze beendet. Nach einem fatalen Fehler neu starten; die Stream-Instanz ändert sich.

Nach Pufferlücke, Neustart oder Schließung wegen langsamem Client den Abgleichanweisungen im [Ereignisvertrag](devices/matter-architecture.md#ereignisse-wiederaufnahme-und-abgleich) folgen. Geräte-Snapshots und der wiederverbindende Plugin-Client fehlen noch. Ein frisches Abonnement ist kein maßgeblicher Zustandssnapshot. Mehrdeutige physische Befehle niemals automatisch wiederholen.

Sidecar nicht extern zugänglich machen und keinen Browser direkt verbinden. Release-Header sind keine Zugangsdaten; authentifizierte Dienstverbindungen gehören zu ATT-1001. Produktionspakete gehören zu ATT-1000, persistente Fabrics/Sicherung/Wiederanlauf zu ATT-998.
