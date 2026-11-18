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
`@nestjs/typeorm`, `sqlite3`, `better-sqlite3`, `@attraccess/database-entities` (samt Unterpfaden) oder
Adapter-Interna importiert. Erfasst werden statische Imports, reine Typ-Imports, Re-Exports, dynamisches `import()`,
`require()`, `import x = require()` und `import('x')`-Typen.

Adapter-Interna sind `apps/api/src/database/adapters/**`, `apps/api/src/database/sqlite/**` und
`libs/database-entities`. Nur Nest-Kompositionsdateien (`*.module.ts`) und Tests dürfen sie importieren; Anwendungs-,
Domänen- und Transportcode erreicht die Persistenz also nur über Ports. Die neutralen Nahtdateien in
`apps/api/src/database` (`unit-of-work.ts`, `persistence-errors.ts`, `backend/database-backend.ts`) werden wie
Anwendungscode geprüft. Das Plugin-SDK hat keinen Engine-Unterpfad mehr: Plugins können weder TypeORM noch einen Treiber noch eine Entity importieren.

Bestehende Nutzer stehen je Datei in `scripts/persistence-boundaries.baseline.json`. Die Baseline kann nur schrumpfen:
ein neuer Verstoß schlägt fehl, ebenso eine Datei, die ihren Eintrag nicht mehr braucht, bis er mit
`node scripts/check-persistence-boundaries.mjs --update` gesenkt wird. Frontend und neutrale Bibliotheken dürfen nie
eingetragen werden. Erlaubte Orte: `libs/database-entities`, die Engine- und Adapterordner unter `apps/api/src/database`, Migrationsordner und Echt-Engine-Tests (`*.persistence.spec.ts`, `*.integration.spec.ts`, `*.e2e.spec.ts`, `apps/api/src/{e2e,test,__test__,test-utils}`, Plugin-`acceptance/`). Unit-Specs mit gefälschten Repositories bleiben geprüft.

## Zuständigkeit je Funktionsbereich

Jeder Bereich persistiert über das TypeORM-Schema in `libs/database-entities`, aber nur Adapter berühren es. Die
Grenzprüfung hat eine leere Baseline: keine Anwendungs-, Domänen- oder Transportdatei importiert `typeorm`, die Treiber,
die Entity-Bibliothek oder Adapter-Interna. „Port“ nennt den anwendungseigenen Persistenzvertrag, „Adapter“ den Ort seiner
SQLite-Implementierung (`apps/api/src/database/adapters/<Bereich>`).

| Funktionsbereich                                                                  | Anwendungscode                                                  | Port                                                                                                             | Adapter                                                               |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Backend-Auswahl, Verbindung, Migrationen, Herunterfahren, Transfer                | `database/backend`, `database/sqlite`                           | `DatabaseBackend`                                                                                                | `database/sqlite`                                                     |
| Fehlerkategorien, Transaktionen, Post-Commit-Hooks, begrenzter Retry              | `database/persistence-errors.ts`, `database/unit-of-work.ts`    | `UnitOfWork`, Fehlerklassifizierer                                                                               | `database/sqlite`                                                     |
| Nutzungssitzungen (Start, Ende, Übernahme, Wiederherstellung), Betriebsintervalle | `resources/usage`, `resources/operating-intervals`              | `UsageSessionStore`, `OperatingTimelineStore`                                                                    | `adapters/usage`, `adapters/operating-intervals`                      |
| Messung                                                                           | `resources/metering`                                            | `MeteringStore`                                                                                                  | `adapters/metering`                                                   |
| Abrechnung, Zahlungen, Guthaben, SumUp                                            | `billing`                                                       | `BillingLedgerStore`, `BillingConfigurationStore`, `SumUpCredentialStore`                                        | `adapters/billing`                                                    |
| Ressourcen, Gruppen, Einweisungen, Einweiser, Nachschulung, Supervision           | `resources/**`                                                  | `ResourceStore`, `ResourceGroupStore`, `ResourceIntroductionStore`, `ResourceIntroducerStore`, `RetrainingStore` | `adapters/resources`                                                  |
| Wartung (Einträge, Anfragen, Pläne, Auswertung), Zustand, Formulare               | `resources/maintenances`, `resources/health`, `resources/forms` | `MaintenanceEvaluationStore` und die Wartungs-, Zustands- und Formular-Stores                                    | `adapters/resources`                                                  |
| Flows, Flow-Knoten, Variablen, Executor                                           | `resources/flows`                                               | `FlowGraphStore`, `FlowTriggerStore`, `FlowVariableStore`, `FlowResourceDirectory`, `FlowBillingItemStore`       | `adapters/flows`                                                      |
| Benutzer, Einladungen, Registrierung, Passwörter                                  | `users-and-auth/users`                                          | `UserStore`                                                                                                      | `adapters/users`                                                      |
| RBAC, Berechtigungen, Rollenzuweisung                                             | `users-and-auth/rbac`                                           | `RbacStore`                                                                                                      | `adapters/users`                                                      |
| Lokale Zugangsdaten, TOTP, API-Tokens, Passwortrichtlinie                         | `users-and-auth/auth`, `password-policy`                        | `CredentialStore`, `TotpStore`, `ApiTokenStore`, `PasswordPolicyStore`                                           | `adapters/auth`                                                       |
| Sitzungen (SQLite und Valkey), Passkeys, SSO, Rate Limiting                       | `users-and-auth/auth`                                           | `SessionStore`, `PasskeyStore`, `SsoProviderStore`, `AccountLockoutStore`                                        | `adapters/sessions`, `passkeys`, `sso`, `rate-limiting`               |
| Audit                                                                             | `audit`                                                         | `AuditStore`                                                                                                     | `adapters/audit` (eigene Verbindung, PRAGMAs, dauerhafte Bestätigung) |
| Attractap-Leser, Zugangsdaten, Karten, Absturzberichte, Secure Boot               | `attractap`                                                     | `ATTRACTAP_*`-Stores                                                                                             | `adapters/attractap`                                                  |
| Companion-Geräte, MQTT-Server                                                     | `companion`, `mqtt`                                             | `CompanionDeviceStore`, `MqttServerStore`                                                                        | `adapters/companion`, `adapters/mqtt`                                 |
| Nachrichten, Benachrichtigungen, Push, E-Mail, Vorlagen                           | `messaging`, `notifications`, `push`, `email*`                  | Konversations-, Benachrichtigungs-, Push-, Vorlagen- und Empfänger-Stores                                        | `adapters/messaging`, `notifications`, `push`, `email`                |
| Einstellungen, Analytics, CSV-Export, Metriken                                    | `settings`, `analytics`, `metrics`                              | `SettingsRows`, `AnalyticsReader`, `CsvExportTemplateStore`, Metrik-Reader                                       | `adapters/settings`, `analytics`, `metrics`                           |
| Projekte, Systemstatistik                                                         | `projects`, `version`                                           | `ProjectStore`, `ProjectInvitationStore`, `SystemStatsStore`                                                     | `adapters/projects`, `adapters/system`                                |
| Plugin-Verwaltung, Plugin-SDK                                                     | `plugin-system`, `libs/plugins-backend-sdk`                     | Plugin-Speicher (Record-Port), Host-Daten, neutrale Migrationen, Transaktionen                                   | `adapters/plugins`                                                    |
| Eingebaute Plugins und Beispiele                                                  | `apps/plugins/*`, `examples/*`                                  | nur die SDK-2.0-Wurzel: `context.storage`, Host-Ports                                                            | keiner: der Plugin-Speicher-Adapter des Hosts bedient sie             |
| MCP-OAuth-Clients, -Freigaben und -Tokens                                         | `mcp`                                                           | `McpOAuthStore`                                                                                                  | `adapters/mcp`                                                        |
| Dashboard-Pins                                                                    | `dashboard`                                                     | `DashboardPinStore`                                                                                              | `adapters/dashboard`                                                  |
| Start, Herunterfahren, Persistenz-Fehlerfilter                                    | `main.bootstrap.ts`, `app`, `exceptions`                        | `DatabaseLifecycle`, neutrale Fehlerkategorien                                                                   | `database/sqlite`                                                     |
| Seeds, Setup-Skripte, Testdatenbanken, Werkzeuge                                  | `apps/api/scripts`, `scripts/*`, `apps/api/src/e2e`             | `DATABASE_TYPE`-Provider (`apps/api/scripts/lib/database-provider.mjs`), `apps/api/migration-tracks.cjs`         | `database/sqlite`                                                     |
| Frontend                                                                          | `apps/frontend`                                                 | keiner, importiert nur `@attraccess/application-models`                                                          | n/a                                                                   |

Plugins haben keinen Datenbankzugriff. Das SDK enthält kein TypeORM, keine Host-Entity, kein rohes SQL und keinen
Engine-Unterpfad. Ein Plugin deklariert Tabellen in einem neutralen Schema und nutzt den Record-Port; der
**Plugin-Speicher-Adapter** des Hosts bildet diesen Port und die neutralen Migrationen auf die aktive Engine ab (siehe
[Plugin-Speicher](plugins/plugin-storage.md) und [Plugins auf SDK 2.0 umstellen](plugins/migrating-to-2.md)).

### Bekannte verbleibende Nahtstellen

Das sind akzeptierte Grenzen dieser Änderung, keine versteckte Arbeit:

- Echt-Engine-Tests und -Fixtures dürfen das ORM nutzen (siehe erlaubte Orte oben).
- Ports nehmen nur einen `TransactionScope`. Vier Adapter öffnen noch eine eigene ORM-Transaktion (SSO-Provider-Store,
  Wartungsplan-Store, E-Mail-Vorlagen-Store, Wartungs-Snapshot-Leser) und reichen sie als `LegacyEngineTransactionScope`
  (`adapters/common/legacy-engine-transaction.ts`) an Kollaborateure weiter; kein Port nennt diesen Typ. Ziehen diese
  Adapter auf die Unit of Work um, entfällt er.
- Adapter entpacken einen Scope mit einigen kleinen Helfern (`TransactionHandles`, `TransactionContextResolver`,
  `EntityManagerResolver`, `managerFor`). Alle lösen über die eine globale Unit of Work auf und lassen sich vereinen.
- Die eingebauten Plugins nutzen nur den Record-Port und laufen daher auf jeder Engine mit Plugin-Speicher-Adapter. Der
  Port kennt keine Joins; Plugins lesen über mehrere eigene Tabellen mit mehreren Aufrufen.
- Plugin-Transaktionen werden pro Host-Prozess serialisiert, wie die des Kerns.
- Einige Lifecycle-Test-Fixtures bauen ältere Schemas absichtlich mit `synchronize`, um Upgrades und Wiederherstellung
  aus einem Schema vor den Integritätsmigrationen zu testen.
- Swagger-Schemas, die geheime oder nie befüllte Felder dokumentierten, sind jetzt korrekt (siehe unten).

## Vertragstreue

HTTP- und WebSocket-Antworten behalten ihre Form. Gibt ein Service keine ORM-Entities mehr zurück, mappt er explizit
auf ein DTO. Swagger und AsyncAPI werden mit `api:export-swagger` und `api:export-asyncapi` erzeugt und verglichen;
generierte Clients werden nicht eingecheckt.

### Absichtliche Unterschiede zum bisherigen Swagger

Gegenüber dem Vertrag vor dieser Änderung ist AsyncAPI identisch, und der HTTP-Vertrag weicht nur hier ab:

- `AuthenticationDetail` dokumentiert `password`, `totpSecret` und `totpEnabledAt` nicht mehr, `MqttServer` nicht mehr
  `password`. Diese Geheimnisse wurden nie zurückgegeben; das Schema sagt es jetzt.
- `GET /companion-devices/{id}` antwortet mit `CompanionDeviceDetailDto`. Die alte Antwort spreizte die Entity und enthielt
  den Token-Hash; das entfällt. `CompanionDevice.resources` listet nur die sinnvollen Felder.
- `Form` dokumentiert `submissions` und `resource` nicht mehr, `ResourceFlowNode` nicht mehr `resource`; die API hat sie nie
  befüllt. Formularfelder nutzen `FormFieldResponseDto`.
- Als Akteure eingebettete Benutzer (Einweiser, Einweisungen, Wartung) nutzen `ResourceActorUserDto` statt des vollen
  `User`-Schemas.
- Einige Eigenschaften wechseln zwischen `type: object` und `allOf`/`$ref` mit demselben referenzierten Schema.
- `LoadedPluginManifest.permissions` nennt `PLUGIN_STORAGE` statt `DATABASE_ACCESS` (SDK 2.0).
- `LoadedPluginManifest` hat das neue boolesche Feld `refused` (additiv): Der Host hat das Plugin bei der Erkennung
  abgelehnt, es lässt sich daher nicht erneut versuchen, nur ersetzen oder löschen. Die Admin-Oberfläche blendet
  **Erneut versuchen** dafür aus und bietet **Entfernen** an.
- `RenameCompanionDeviceDto` dokumentiert jetzt das Pflichtfeld `name`; das alte Schema war ein leeres Objekt, die globale
  Whitelist-Pipe entfernte das Feld, und das Umbenennen antwortete mit 500.

Zwei undokumentierte Antwortdetails haben sich ebenfalls geändert; Swagger hat sie nie beschrieben, und kein Client
liest sie:

- `PATCH` eines Attractap-Lesers bettet die Abrechnungskonfigurationen, Einweiser und Einweiser-Benutzer seiner
  Ressourcen nicht mehr ein.
- Antworten auf erteilte Einweisungen enthalten keine `{ id }`-Platzhalter ihrer Relationen mehr.

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
