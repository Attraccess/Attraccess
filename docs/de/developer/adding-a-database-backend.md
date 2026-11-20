# Datenbank-Backend hinzufügen

<!-- llms-description: Schritte, um Attraccess ein weiteres relationales Backend hinzuzufügen, und der Export-, Import- und Backup-Vertrag, den die Übernahme von SQLite nach PostgreSQL umsetzt. -->

PostgreSQL ist das umgesetzte und einzige laufende Backend. SQLite ist **nur noch Import**: Seine veröffentlichten
Migrationen sind eingefroren und laufen nur auf einer temporären Kopie während der einmaligen
[Übernahme nach PostgreSQL](installation/updating.md#umzug-von-sqlite-auf-postgresql).
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
   eintragen, das die Spur für den Migrations-Build nach `DATABASE_TYPE` wählt. Die PostgreSQL-Spur ist eine
   Baseline-Migration in `apps/api/src/database/postgres/migrations`; spätere Migrationen sind nur für PostgreSQL. Die
   veröffentlichten SQLite-Migrationen (`apps/api/src/database/migrations`) sind eingefroren und werden nie geändert.
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

## Export-, Import- und Backup-Vertrag

Ein Transfer oder Restore muss, egal mit welchem Werkzeug, erhalten:

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
- **Abgeleitete Daten:** Guthaben und Nutzungsinvarianten werden nach dem Import mit den Integritätsprüfungen der Engine
  kontrolliert; Trigger oder Entsprechungen dürfen beim Import nicht doppelt wirken.

Die Übernahme von SQLite nach PostgreSQL setzt diesen Vertrag um (`apps/api/src/database/transfer`): Die SQLite-Datei
wird in eine Arbeitskopie kopiert, die eingefrorene SQLite-Spur bringt die Kopie auf die letzte SQLite-Migration, ein
Snapshot wird gelesen und in einer Transaktion in PostgreSQL importiert, danach laufen Integritätsprüfungen.
Neuinstallation und Upgrade aus älteren Migrationsständen mit Daten sind getestet (`apps/api/src/e2e/migrations`).
Der Vertrag selbst ist ein
neutraler Snapshot (`database/transfer-snapshot.ts`: Tabellen, gespeicherte Spalten in neutralen Arten, Zeitpunkte als
ISO-8601 UTC, Ganzzahlen über 2^53 und Dezimaltext exakt, Sequenzen, Kern-Migrationsstand sowie je Plugin sein
Speicher-Namensraum und die angewendeten Speicherversionen), den ein Backend über `DatabaseBackend.transfer` exportiert
und importiert. Plugin-Spalten werden aus der Speicherdeklaration des Plugins typisiert, nicht aus dem Spaltentyp der
Engine: Dezimalzahlen als exakter Text (Art `decimal`), `date` als `YYYY-MM-DD` (Art `date`), Zeitstempel als ISO-8601
UTC, boolesche Werte als boolesche Werte. `importSnapshot` erhält die Plugin-Beschreibungen des Ziels (`{ plugins }`)
und lehnt ein Plugin ab, das dort fehlt oder auf anderen Speicherversionen steht. `describeTransferConformance` (`database/conformance`,
ausgeführt von `api:test-conformance`) prüft ihn je Backend: stabile IDs und Beziehungen, Zeitpunkte, exakte Geld- und
Zählerwerte, Plugin-Tabellen und Plugin-Speicherversionen, Kern-Migrationsstand, nicht doppelt angewendete abgeleitete
Guthaben und einen atomaren Restore, der einen Snapshot für einen anderen Migrationsstand ablehnt. Ein Backend ergänzt
eine `TransferBackendFixture`.

## Nicht umgesetzt

- Weitere Engines. Außerhalb der Adapter und der PostgreSQL-Spur hängt nichts in der Anwendung von
  PostgreSQL-Eigenheiten ab, aber eine zweite Engine ist nicht geplant.
- Garantien für mehrere Replikate (Zeitgeber-Leadership, geteilte Live Updates), separat verfolgt; siehe
  [Persistenz-Garantien](developer/persistence-guarantees.md).
