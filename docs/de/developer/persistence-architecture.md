# Persistenz-Architektur

<!-- llms-description: Wer in Attraccess den Datenbankzugriff besitzt: neutrale Modelle, SQLite-Schema, Backend-Naht, Ports und Adapter, die erzwungene Importgrenze und die Zuständigkeit je Bereich. -->

Attraccess trennt Geschäftslogik, HTTP-/WebSocket-/MQTT-/Geräteverträge und Plugin-APIs von der Datenbank-Engine.
SQLite ist das einzige funktionierende Backend und der Standard. Diese Seite beschreibt die Struktur, mit der ein
zweites relationales Backend (PostgreSQL, ATT-584) nur durch Adapter, Schema und Konfiguration ergänzt werden kann,
ohne Fachregeln oder öffentliche Verträge umzuschreiben.

> [!NOTE]
> Die Trennung wird schrittweise eingeführt. Diese Seite nennt, was fertig ist und welcher Code noch vom ORM abhängt
> (siehe [Zuständigkeit je Funktionsbereich](#zuständigkeit-je-funktionsbereich)). Es wird keine PostgreSQL-Unterstützung behauptet.

## Die Schichten

| Schicht                                             | Ort                                                                         | Darf `typeorm`, Treiber, Entities importieren? |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Neutrale Modelle, Enums, Konstanten                 | `libs/application-models` (`@attraccess/application-models`)                | Nein, nie                                      |
| Anwendung, Domäne, HTTP-/WebSocket-Transport        | `apps/api/src/**` (außer `database/`)                                       | Nein (siehe Baseline unten)                    |
| Backend-Naht, Ports, Fehlerkategorien               | `apps/api/src/database/backend`, `persistence-errors.ts`, `unit-of-work.ts` | Nur die Naht: Typen, keine Abfragen            |
| SQLite-Adapter                                      | `apps/api/src/database/sqlite`                                              | Ja                                             |
| SQLite-/TypeORM-Schema (Entities, Spalten, Indizes) | `libs/database-entities`                                                    | Ja                                             |
| Veröffentlichte SQLite-Migrationen                  | `apps/api/src/database/migrations`                                          | Ja, eingefroren                                |

`libs/database-entities` importiert aus `libs/application-models`, nie umgekehrt. Die Enums, Singleton-IDs und der
SSO-Sitzungskontext, die früher in den Entity-Dateien lagen, liegen jetzt in der neutralen Bibliothek. Die
Entity-Bibliothek exportiert sie nur weiter, weil veröffentlichte Migrationen sie von dort importieren und nicht
geändert werden dürfen.

## Backend-Auswahl

Eine Kompositionsnaht, `apps/api/src/database/backend`, wählt die Engine:

- `DATABASE_TYPE` (Standard `sqlite`). Jeder andere Wert bricht den Start ab, bevor eine Verbindung, Migration oder
  Plugin-Arbeit stattfindet. Die Fehlermeldung nennt die unterstützten Werte und gibt keinen Wert aus, der nicht wie
  ein einfacher Engine-Name aussieht.
- Ein `DatabaseBackend` bündelt Verbindungsoptionen, Entity-Satz, Migrationsspur, Verbindungsfabrik, Deutung von
  Treiberfehlern und das Schließen zusätzlicher Verbindungen.
- Eine **Migrationsspur** ist eine geordnete, veröffentlichte Historie für eine Engine. Die SQLite-Spur behält den
  Tabellennamen `migrations` und alle veröffentlichten Migrationen Byte für Byte. Eine andere Engine bekommt eine
  eigene Spur statt SQLite-SQL wiederzuverwenden.

## Neutrale Fehlerkategorien

Anwendungscode liest keine Treiber-Fehlercodes. Das aktive Backend registriert einen Klassifizierer, die Anwendung
fragt `isDatabaseBusyError`, `isUniqueViolation` oder `isWriteConflict` (`persistence-errors.ts`). Der
SQLite-Klassifizierer mit Codes wie `SQLITE_BUSY` und der Meldungsform von Constraint-Fehlern liegt in
`database/sqlite/sqlite-errors.ts`.

## Unit of Work

`UnitOfWork` (`unit-of-work.ts`) ist der Port für atomare Schreibvorgänge über mehrere Funktionen. Vertrag und Tests
siehe [Persistenz-Garantien](developer/persistence-guarantees.md).

## Erzwungene Importgrenze

`node scripts/check-persistence-boundaries.mjs` (Teil von `pnpm lint:files`, das die CI bei jedem Pull Request und in
der Merge Queue ausführt) schlägt fehl, wenn Code außerhalb der Persistenz-Implementierung `typeorm`,
`@nestjs/typeorm`, `sqlite3`, `better-sqlite3`, `@attraccess/database-entities` oder Adapter-Interna importiert. Erfasst
werden statische Imports, reine Typ-Imports, Re-Exports, dynamisches `import()`, `require()`, `import x = require()`
und `import('x')`-Typen.

Bestehende Nutzer stehen je Datei in `scripts/persistence-boundaries.baseline.json`. Die Baseline kann nur schrumpfen:
ein neuer Verstoß schlägt fehl, ebenso eine Datei, die ihren Eintrag nicht mehr braucht, bis er mit
`node scripts/check-persistence-boundaries.mjs --update` gesenkt wird. Frontend und neutrale Bibliotheken dürfen nie
eingetragen werden. Erlaubte Orte: `libs/database-entities`, `apps/api/src/database` (Adapter liegen in `database/adapters/<Bereich>`), Migrationsordner und Echt-Engine-Tests (`*.persistence.spec.ts`, `*.integration.spec.ts`, `*.e2e.spec.ts`, `apps/api/src/{e2e,test,__test__,test-utils}`, Plugin-`acceptance/`). Unit-Specs mit gefälschten Repositories bleiben geprüft.

## Zuständigkeit je Funktionsbereich

Jeder Bereich unten persistiert heute über das TypeORM-Schema in `libs/database-entities`. „Grenze“ ist der Stand der
Importprüfung, „Port“ ob ein anwendungseigener Persistenz-Port existiert.

| Funktionsbereich                                                                                          | Code                                           | Grenze                                | Port        |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ----------- |
| Backend-Auswahl, Verbindung, Migrationen, Herunterfahren                                                  | `database/backend`, `database/sqlite`          | Adapter                               | Naht fertig |
| Fehlerdeutung (busy, unique, conflict)                                                                    | `database/persistence-errors.ts`               | Neutral                               | Fertig      |
| Transaktionen, Post-Commit-Hooks, begrenzter Retry                                                        | `database/unit-of-work.ts`                     | Neutral                               | Fertig      |
| Ressourcenzugriff, Supervision, Nutzungssitzungen, Betriebsintervalle, Messung, Wartung, Formulare, Flows | `resources/**`                                 | Baseline                              | Offen       |
| Abrechnung, Zahlungen, Guthaben                                                                           | `billing/**`                                   | Baseline                              | Offen       |
| Benutzer, Auth, RBAC, SSO, Passkeys, Passwortrichtlinie, Rate Limiting, Sitzungen, MCP-OAuth              | `users-and-auth/**`                            | Baseline                              | Offen       |
| Audit                                                                                                     | `audit/**`                                     | Baseline                              | Offen       |
| Attractap-Leser, Zugangsdaten, Absturzberichte, Secure Boot                                               | `attractap/**`                                 | Baseline                              | Offen       |
| Companion-Geräte                                                                                          | `companion/**`                                 | Baseline                              | Offen       |
| Nachrichten, Benachrichtigungen, Push, E-Mail, E-Mail-Vorlagen                                            | `messaging`, `notifications`, `push`, `email*` | Baseline                              | Offen       |
| Einstellungen, Analytics, Metriken, MQTT, Projekte, Version                                               | jeweilige Ordner                               | Baseline                              | Offen       |
| Plugin-Verwaltung und Plugin-SDK                                                                          | `plugin-system/**`, `libs/plugins-backend-sdk` | Baseline                              | Offen       |
| Eingebaute Plugins                                                                                        | `apps/plugins/*`                               | Baseline (Matter, Reservations, WAGO) | Offen       |
| Frontend                                                                                                  | `apps/frontend`                                | Sauber                                | n/a         |

Maßgeblich ist die aktuelle Liste in `scripts/persistence-boundaries.baseline.json`.

## Vertragstreue

HTTP- und WebSocket-Antworten behalten ihre Form. Gibt ein Service keine ORM-Entities mehr zurück, mappt er explizit
auf ein DTO. Swagger und AsyncAPI werden mit `api:export-swagger` und `api:export-asyncapi` erzeugt und verglichen;
generierte Clients werden nicht eingecheckt.

### Vertrag zweier Commits vergleichen

`node scripts/compare-api-contracts.mjs <base.json> <head.json>` vergleicht zwei erzeugte `swagger.json`- oder
`asyncapi.json`-Dateien und zeigt nur, was ein Client bemerken könnte: Pfade und Methoden, Parameter, Request- und
Response-Bodies, Schemas, Properties, Pflichtfelder, Enum-Werte, Typen und `$ref`s. Beschreibungen, Beispiele, Titel,
Tags, Server, Dokumentversion und Schlüsselreihenfolge werden ignoriert. Jeder Unterschied ist `breaking` (etwas
entfernt oder strenger), `changed` (Review wert) oder `added`; `--json` gibt die Daten aus und `--fail-on-breaking`
setzt den Exit-Status auf 1, wenn etwas bricht.

Beide Dateien auf den zu vergleichenden Commits erzeugen und außerhalb des Repositorys ablegen (erzeugte Verträge
werden nie eingecheckt):

```bash
pnpm nx run api:export-swagger     # dist/apps/api-swagger/swagger.json
pnpm nx run api:export-asyncapi    # dist/apps/api/asyncapi.json
node scripts/compare-api-contracts.mjs /tmp/base/swagger.json dist/apps/api-swagger/swagger.json
```

Ein leerer Bericht heißt: Das Refactoring hat den HTTP- und WebSocket-Vertrag nicht verändert.

### Werkzeuge folgen dem gewählten Backend

Alles, was eine Datenbank öffnet, läuft über `DATABASE_TYPE`; ein nicht unterstützter Wert stoppt es, bevor etwas
angelegt oder geändert wird:

- Die Migrations-Datasource (`database/datasource.ts`) nutzt die Migrationsspur des Backends.
  `apps/api/migration-tracks.cjs` ordnet jedem Datenbanktyp sein Spurverzeichnis für den Migrations-Build
  (`api:build-migration-datasource`) zu, sodass `api:migrations-run`, `api:migration-generate` und
  `api:migration-revert` die Spur des gewählten Backends bauen und ausführen. Ein zweites Backend trägt dort sein
  Verzeichnis und seinen `MigrationTrack` ein.
- Der Dev-Seed (`api:seed-dev`) und `reencrypt-card-keys` nutzen einen Datenbank-Provider
  (`apps/api/scripts/lib/database-provider.mjs`). `scripts/setup-dev-dependencies.sh`, `scripts/setup-workspace.sh` und
  `scripts/create-worktree.sh` prüfen zuerst `DATABASE_TYPE` (`scripts/check-database-type.sh`).
- Tests öffnen Datenbanken über `apps/api/src/test-utils/test-database.ts`, das die Verbindungsfabrik des Backends nutzt.

Die Lebenszyklus-Tests mit echter Datenbank liegen in `apps/api/src/e2e/migrations/migration-lifecycle.e2e.spec.ts`
(Neuinstallation, Upgrade aus vier älteren Release-Ständen mit Daten, Fehlerwiederherstellung, Seeding). Der Export-,
Import- und Backup-Vertrag wird von `database/conformance/transfer.conformance.test-fixture.ts` über
`api:test-conformance` getestet.
