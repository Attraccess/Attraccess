# Datenbank-Backend hinzufügen

<!-- llms-description: Schritte, um Attraccess ein weiteres relationales Backend hinzuzufügen, der Backup- und Restore-Vertrag, den es einhalten muss, und wie der einmalige SQLite-Import dazu passt. -->

PostgreSQL ist das umgesetzte und einzige laufende Backend. SQLite ist **nur noch Import**: Seine veröffentlichten
Migrationen sind eingefroren und laufen nur innerhalb der PostgreSQL-Migration, die eine 1.x-SQLite-Datei einmalig
importiert ([Umzug von SQLite auf PostgreSQL](installation/updating.md#umzug-von-sqlite-auf-postgresql)).
Diese Seite listet, was ein weiteres Backend liefern muss, damit keine Fachregel und kein öffentlicher Vertrag
geändert werden muss, mit dem PostgreSQL-Backend (`apps/api/src/database/postgres`) als Vorlage.

## Schritte

1. **Typ deklarieren.** Wert in `SUPPORTED_DATABASE_TYPES` (`database/backend/database-backend.ts`) und in die
   `DatabaseBackend`-Registry in `resolve-database-backend.ts` eintragen. Bis dahin bricht `DATABASE_TYPE` den Start ab.
2. **Adapter schreiben** in `apps/api/src/database/<engine>/`: Verbindungsoptionen und Pooling, Verbindungsfabrik,
   Fehlerklassifizierer (`PersistenceErrorClassifier`: busy, conflict, Unique- und Fremdschlüsselverletzung; PostgreSQL bildet die SQLSTATEs `40001`, `40P01`, `55P03`, `57014`, `23505`, `23503` ab), Schließen
   zusätzlicher Verbindungen und eine mit `ScopedUnitOfWork` gebaute `UnitOfWork`.
3. **Schema schreiben** neben den Entities: engine-spezifische Spaltentypen, generierte Spalten (etwa der
   Nutzungsdauer-Ausdruck), Indizes, Teilindizes, Constraints und Trigger oder
   Entsprechungen für Guthabenpflege und Nutzungsintegrität.
4. **Migrationsspur anlegen.** Migrationen einer Engine laufen nie auf einer anderen. Eine neue geordnete Spur
   (`MigrationTrack`) mit eigener Migrationstabelle anlegen und ihr Verzeichnis in `apps/api/migration-tracks.cjs`
   eintragen, das die Spur für den Migrations-Build nach `DATABASE_TYPE` wählt. Die PostgreSQL-Spur in
   `apps/api/src/database/postgres/migrations` beginnt mit einer Baseline gleich dem letzten SQLite-Schema
   (`PostgresBaseline1760000000000`) und dem SQLite-Import (`PostgresImportSqlite1760000000001`); spätere Migrationen
   sind nur für PostgreSQL. Die veröffentlichten SQLite-Migrationen (`apps/api/src/database/migrations`) sind
   eingefroren und werden nie geändert.
5. **Seeds und Werkzeuge anbinden**: einen Provider in `apps/api/scripts/lib/database-provider.mjs` ergänzen (Dev-Seed,
   `reencrypt-card-keys`), `scripts/check-database-type.sh` und die Migrations-Nx-Targets weiter nach `DATABASE_TYPE`
   wählen lassen und `apps/api/src/test-utils/test-database.ts` die neue Engine öffnen lassen.
6. **Persistenz-Ports liefern.** Für jeden Bereich auf der Baseline einen anwendungseigenen Port und einen Adapter
   einführen, dann `scripts/persistence-boundaries.baseline.json` senken. Adapter teilen TypeORM-Code bei gleichem
   Verhalten und isolieren echte Unterschiede.
7. **Conformance-Fixture ergänzen.** `BackendFixture` (`database/conformance/backend-fixture.ts`) für die Engine
   implementieren und `describePersistenceConformance` darauf ausführen. Jeder Fall nutzt unabhängige Verbindungen.
8. **Plugin-Speicher-Adapter bereitstellen.** Plugins haben keinen engine-spezifischen Code und deklarieren keine
   Engines: Sie nutzen den neutralen Record-Port und neutrale Migrationen. Für die neue Engine den Adapter
   implementieren, der den Port bedient (insert, insertMany, get, find, findOne, count, update als Compare-and-Set,
   delete, upsert, aggregate, die strukturierten Filter, neutrale Fehler, Transaktions-Scopes mit `afterCommit`), sowie
   den **DDL-Generator**, der jeden neutralen Migrationsschritt (`createTable`, `dropTable`, `addColumn`, `dropColumn`,
   `renameColumn`, `addIndex`, `dropIndex`) in DDL der Engine übersetzt, samt physischer Typabbildung (Dezimalzahlen
   exakt, Zeitpunkte UTC, `date`, `json`, `uuid`), generierten Schlüsseln, Namensräumen und der Baseline-Übernahme.
   Die Plugin-Speicher-Conformance-Suite darauf ausführen.
9. **Betrieb dokumentieren**: Konfiguration, Backup und Restore der Engine (für PostgreSQL siehe [Umgebungsvariablen](installation/environment-variables.md#datenbank) und [Backup & Wiederherstellung](installation/backup-restore.md)).

## Backup- und Restore-Vertrag

Ein Backup und Restore muss, egal mit welchem Werkzeug, erhalten:

- **Bezeichner und Beziehungen:** alle Primär- und Fremdschlüssel exakt, auch erzeugte IDs, damit Relationen und externe
  Verweise (Geräte-Enrollment, MQTT-IDs, Audit-Verweise) gültig bleiben.
- **Zeitstempel und Zeitzonen:** Zeitpunkte als UTC ohne Genauigkeitsverlust; die Umwandlung in die Darstellung der
  Engine geschieht im Adapter.
- **Exakte Geld- und Zählerwerte:** Abrechnungsbeträge, Guthaben, Preis-Snapshots und Zählerstände als exakte
  Dezimalzahlen oder Ganzzahlen, nie als Gleitkomma. Preis-Snapshots von Sitzungen und akzeptierte Zählerbeobachtungen
  sind Nachweise und werden unverändert kopiert.
- **Plugin-Daten und Plugin-Schemastand:** die deklarierten Tabellen jedes Plugins und sein Schemastand (die angewendete
  neutrale Migrationsversion, bei übernommenen Installationen der Baseline-Eintrag) werden zusammen mit der
  Plugin-Version kopiert, sodass ein Restore nie Daten ohne den passenden Schemastand liefert.
- **Kern-Migrationsstand:** die Migrationstabelle der Quellspur. Eine wiederhergestellte Datenbank ist nur mit der
  Anwendungsversion gültig, die ihrem Migrationsstand entspricht.
- **Abgeleitete Daten:** Guthaben und Nutzungsinvarianten gelten nach einem Restore wie zuvor; Trigger oder
  Entsprechungen dürfen beim Laden der Daten nicht doppelt wirken.

Für PostgreSQL ist das Backup ein `pg_dump` der Datenbank (siehe [Backup & Wiederherstellung](installation/backup-restore.md)).

## Der einmalige SQLite-Import

Eine 1.x-Installation gelangt über eine gewöhnliche Migration der PostgreSQL-Spur nach PostgreSQL,
`apps/api/src/database/postgres/migrations/1760000000001-import-sqlite.ts`, mit ihren Hilfsmodulen in
`postgres/migrations/sqlite-import/`. Sie läuft nach der Baseline und vor jeder späteren Migration, sodass die
importierten Daten wie bei jeder anderen Installation durch alle späteren Migrationen laufen; eine neue Migration
braucht keinen Snapshot und keine Upgrade-Liste. Die Migration bringt die SQLite-Datei an Ort und Stelle auf die
letzte SQLite-Migration (die eingefrorene Spur in `apps/api/src/database/sqlite`), kopiert jede Kerntabelle in einer
Transaktion (IDs und Sequenzen, UTC-Zeitpunkte, exakte Dezimalzahlen, JSON, Guthaben nicht doppelt angewendet,
Fremdschlüssel vor dem Commit geprüft) und verschiebt die Datei danach nach `<STORAGE_ROOT>/sqlite-backup/`.
Plugin-Tabellen und die Verwaltungsdaten des Plugin-Speichers werden nicht kopiert. Die Kernmigrationen laufen früh im
Start (`postgres/postgres-startup-migrations.ts`) unter einem PostgreSQL-Advisory-Lock, eine Transaktion je Migration.
`postgres-schema-parity.persistence.spec.ts` belegt, dass die Baseline dem letzten SQLite-Schema entspricht, und
`apps/api/src/e2e/migrations` deckt Neuinstallation, Importe aus älteren SQLite-Ständen, den Import beim Start und die
Wiederherstellung nach einem gescheiterten Import ab. Eine weitere Engine legt bei Bedarf eine eigene Spur mit eigenem
Importschritt an.

## Nicht umgesetzt

- Weitere Engines. Außerhalb der Adapter und der PostgreSQL-Spur hängt nichts in der Anwendung von
  PostgreSQL-Eigenheiten ab, aber eine zweite Engine ist nicht geplant.
- Garantien für mehrere Replikate (Zeitgeber-Leadership, geteilte Live Updates), separat verfolgt; siehe
  [Persistenz-Garantien](developer/persistence-guarantees.md).
