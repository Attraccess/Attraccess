# Ein Datenbank-Backend ergänzen

SQLite ist das einzige implementierte relationale Backend. `DATABASE_TYPE` verwendet standardmäßig `sqlite`. Andere Werte stoppen den Start, bevor Verbindungen geöffnet, Plugin-Schemas geladen oder Migrationen ausgeführt werden. Ein zusätzlicher Auswahlwert allein implementiert kein Backend. PostgreSQL und der Betrieb mehrerer API-Instanzen gehören zu ATT-584.

## Zuständigkeiten

Anwendungsdienste verwenden Datensätze aus `@attraccess/application-models` und fachliche Persistenzschnittstellen. Controller und Live-Ereignisse erzeugen ausdrücklich definierte Antwortobjekte. `libs/database-entities` enthält SQLite-Schemaklassen für Implementierungen und bestehende Migrationen, keine allgemeinen Anwendungsmodelle.

`apps/api/src/database/backend.config.ts` prüft die Konfiguration. `backend.registry.ts` wählt Implementierungen aus. `sqlite/` besitzt Verbindungsoptionen, Schemaregistrierung, Transaktionen, Fehlerzuordnung, Entwicklungsdaten und Integritätswerkzeuge. Fachliche Operationen stehen in `persistence/port.ts`; `typeorm-adapter.ts` enthält Abfragen, Verknüpfungen, bedingte Schreibvorgänge und die Umwandlung in normale Datensätze. Nest-Module verdrahten diese Implementierungen.

## Ein weiteres System implementieren

1. Typisierte Konfiguration und eine Implementierung zur Backend-Registry hinzufügen. Unbekannte und ungültige Konfigurationen vor dem Verbindungsaufbau ablehnen. Zugangsdaten nicht in Fehler oder Protokolle aufnehmen.
2. Ein eigenes Schema und einen eigenen Migrationspfad bereitstellen. Veröffentlichte SQLite-Migrationen unverändert lassen, ihr SQL nicht auf anderen Systemen ausführen und keine automatische Schemasynchronisierung aktivieren. Stabile IDs und Beziehungen, exakte Beträge und Zählerzeichenfolgen, UTC-Zeitpunkte, Nullwerte, Binärdaten und Migrationsnamen erhalten.
3. Alle fachlichen Persistenzschnittstellen implementieren. Geschäftsregeln, Berechtigungen, Abrechnung, Geräteprotokolle und externe Wirkungen bleiben in der Anwendung. Datenbankfehler innerhalb der Implementierung zuordnen. Normale Datensätze zurückgeben, keine Repositories, verzögert geladenen Entities, Query Builder oder Datenbankausnahmen.
4. `TransactionDriver` implementieren und Operationen an die Verbindung des Aufrufers binden. Verschachtelte Aufrufe verwenden denselben `TransactionScope`, erweitern dessen Ressourcen- und Kontenkonfliktbereich nicht und führen keinen eigenen Commit aus. Bedingte Änderungen, Eindeutigkeit, Reihenfolge und Isolation mit unabhängigen Verbindungen nachweisen. Eine globale Anwendungssperre ersetzt dies nicht.
5. Backend-spezifische Plugin-Migrationen und Operationsadapter bereitstellen. Ausdrückliche Backend-Unterstützung vor Schemaregistrierung, Lesen der Migrationshistorie, Migration und Aktivierung prüfen. Ohne Persistenzdeklaration bleibt ein Plugin auf die bisherige SQLite-Schnittstelle beschränkt. Ungeprüfte Plugins nicht als portabel bezeichnen.
6. Gemeinsame Konformitätstests mit einer echten Datenbank und unabhängigen Verbindungen ausführen. Beim Austausch der Fixture bleiben die fachlichen Erwartungen gleich. Zusätzliche Tests für Migrationen und den jeweiligen Treiber ergänzen.

## Erforderliche Nachweise

`pnpm nx run api:test-persistence` führt die SQLite-Konformitätstests aus. Die Fixtures erstellen echte Anwendungsdienste. Simulierter Mailversand macht nur Versandfehler und die Anzahl der Versuche reproduzierbar. Eine weitere Datenbank muss dasselbe Verhalten nachweisen; simulierte Datenbankantworten genügen nicht.

Neuinstallation und Entwicklungsdaten, Migrationsabbruch und Neustart, unterstützte Rücknahmen, berechnete Nutzungsdauer, Constraints und Indizes prüfen. Dazu kommen exakte Guthaben und Messwerte, atomare Nutzung und Übernahme samt Abrechnungsfehlern, Authentifizierung und Sitzungsrotation, unveränderliche Auditdaten und Commit-Belege sowie Installation, Upgrade und Deinstallation gepackter Plugins. REST-, OpenAPI- und Live-Antworten vergleichen, damit private Felder ohne Entity-Dekoratoren geschützt bleiben.

Die beiden konstruierten SQLite-Upgrade-Fixtures stoppen vor der Nutzungsintegritätsmigration beziehungsweise beim veröffentlichten Schema vor dem Umbau. Sie erhalten vorgegebene Identitäts-, Zugriffs-, Sitzungs-, Abrechnungs-, Mess-, Audit-, Betriebs- und Plugin-Daten. Sie prüfen kein Produktionsbackup eines Betreibers und weisen keine PostgreSQL-Unterstützung nach.

## Betrieb und Datenübernahme

Die Backend-Auswahl kopiert keine Daten. Eine spätere Übernahme muss IDs, Fremdschlüssel, abgeschlossene Buchungen und Guthaben, exakte Zählerzeichenfolgen, Zeitpunkte, verschlüsselte Zugangsdaten, Sitzungen, Audit- und Operationsbelege, Plugin-Tabellen sowie beide Migrationshistorien erhalten. Vor der Umstellung Anzahl und exakte Werte vergleichen, ein wiederherstellbares Backup behalten und die Rückkehrstrategie festlegen, bevor das neue System Schreibvorgänge annimmt. Diese Version bietet keinen Transferbefehl zwischen Datenbanksystemen.

Datenbankneutrale Schnittstellen beweisen keinen sicheren Mehrinstanzbetrieb. Lokale Warteschlangen, Timer, Ereignisverteilung, Flow-Ausführung, MQTT- und Geräteabonnements sowie WAGO-Operationssperren benötigen in ATT-584 noch eine instanzübergreifende Koordination. Sitzungen in Valkey lösen das allein nicht. Bis zur Implementierung und Prüfung nur eine aktive schreibende API- und Koordinatorinstanz betreiben.
