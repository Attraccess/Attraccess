# Persistenz-Garantien

<!-- llms-description: Der Transaktions- und Nebenläufigkeitsvertrag der PostgreSQL-Persistenzschicht, wo welche Garantie durchgesetzt und getestet wird und welche Annahmen nur für eine einzelne API-Instanz gelten. -->

Diese Seite nennt, was die Persistenzschicht auf PostgreSQL zusichert, wie jede Zusicherung getestet wird und was bei
mehr als einer API-Instanz **nicht** zugesichert ist. Horizontale Skalierung wird nicht behauptet.

## PostgreSQL-Semantik

PostgreSQL ist das einzige Laufzeit-Backend (SQLite wird nur von der einmaligen [Übernahme](installation/updating.md#umzug-von-sqlite-auf-postgresql) gelesen).
Es gibt keine prozessweite Schreibsperre: Unabhängige Transaktionen laufen parallel, und die Korrektheit stellt die
Datenbank sicher.

- **Isolation.** Transaktionen laufen mit `READ COMMITTED`. Was sich nicht verzahnen darf, wird ausdrücklich
  abgesichert, nicht durch eine strengere Isolationsstufe.
- **Zeilensperren.** Lesen-ändern-schreiben auf einer Zeile nutzt `SELECT … FOR UPDATE`.
- **Advisory Locks.** Arbeit je Ressource nimmt `pg_advisory_xact_lock(Namensraum, Ressourcen-ID)` und hält sie bis
  Commit oder Rollback (`adapters/resources/resource-locks.ts`): ein Namensraum für den Nutzungs-Lifecycle
  (Kapazität, eine Sitzung je Benutzer, Übernahme-Reservierungen) und einer für die Betriebszeitleiste (das eine offene
  Intervall). Andere Ressourcen und alle einfachen Lesevorgänge laufen weiter.
- **Unique-Constraints und Trigger.** Einzelgewinner-Beanspruchungen sind Unique-Constraints; Guthaben, Nutzungsintegrität
  (keine doppelte aktive Sitzung, keine kollidierende Reservierung) und die Unveränderlichkeit des Audit-Logs setzen
  Trigger und Teilindizes in der Datenbank durch und gelten damit für jeden Schreiber.
- **Lock-Timeout.** Jede Verbindung setzt `lock_timeout` auf 10 s, damit eine Anweisung, die auf eine Sperre wartet,
  fehlschlägt, statt ewig zu warten. Die Zeitzone ist `UTC`.
- **Wiederholungen.** Eine Transaktion, die PostgreSQL mit `40001` (Serialisierungsfehler) oder `40P01` (Deadlock)
  abbricht, ist ein `conflict`; `runWithRetry` führt sie erneut aus (siehe unten). Die Phasen des Nutzungslebenszyklus
  (Sitzungsstart und -ende, vorgemerkte Abrechnungsposten, Wiederherstellung) und der Flow-Abrechnungsknoten wiederholen
  so. Externe Effekte werden nie wiederholt, weil sie in `afterCommit` laufen.
- **Fehlerklassifizierung** (`database/postgres/postgres-errors.ts`): `40001` und `40P01` sind Konflikte; `55P03`
  (Sperre nicht verfügbar), `57014` (Timeout), `53300` (zu viele Verbindungen), `08xxx` (Verbindung) und `57P01`
  (Administrator-Shutdown) sind busy; `23505` ist eine Unique-Verletzung, `23503` eine Fremdschlüsselverletzung,
  `25006` schreibgeschützt; `22003`, `22P02`, `22021`, `22007` und `22008` sind ungültige Eingaben. Busy ist auch ein
  Pool, der binnen 10 s keine freie Verbindung hat. Ein globaler Exception-Filter beantwortet eine beschäftigte oder
  kollidierende Datenbank mit `503` und ungültige Eingaben mit `400`, nie mit der Treibermeldung.
- **Typen.** Zeitpunkte sind `timestamptz` (UTC). Credits und Zählerwerte sind `bigint` oder exakte Dezimalzahlen, nie
  Gleitkomma.
- **Migrationen.** Die PostgreSQL-Spur besteht aus einer Baseline-Migration (`apps/api/src/database/postgres/migrations`);
  spätere Migrationen sind nur für PostgreSQL. Die veröffentlichten SQLite-Migrationen sind eingefroren und laufen nur
  auf der temporären Kopie während der Übernahme.

## Unit of Work

`UnitOfWork` (`apps/api/src/database/unit-of-work.ts`) ist der neutrale Port für atomare Schreibvorgänge.

- `run(work)` öffnet einen Transaktionsbereich. Alles, was darüber geschrieben wird, wird gemeinsam oder gar nicht committet.
- Ein `run` innerhalb eines laufenden Bereichs desselben asynchronen Ablaufs **tritt ihm bei**; es gibt keine Verschachtelung.
- `scope.afterCommit(callback)` läuft nur nach dem Commit der äußersten Einheit, in Registrierungsreihenfolge, nie bei
  Rollback. Ein fehlschlagender Callback wird geloggt (nur Fehlerklasse) und macht den Commit nicht rückgängig.
- Ein Bereich ist nach Commit oder Rollback geschlossen. Ein geschlossener oder fremder Bereich (andere Verbindung)
  wird mit `TransactionScopeError` abgelehnt.
- `runWithRetry` ist der vorgesehene Weg, Datenbankarbeit zu wiederholen. Es startet die äußerste Einheit bei
  Fehlern neu, die PostgreSQL vollständig zurückgerollt hat (`40001`, `40P01`, `55P03`, `57014`). Eine verlorene
  Verbindung (`08xxx`, `57P01`) wird nicht wiederholt: der Commit kann schon erfolgt sein. Standardmäßig drei Versuche, nie mehr als zehn, mit
  zufällig gestreutem exponentiellem Backoff (50 ms Basis, höchstens 1 s). Innerhalb einer offenen Einheit verweigert es
  den Start, weil ein Retry dort die Schreibvorgänge der äußeren Einheit nicht zurücknehmen könnte. Die Arbeit läuft von
  vorn und darf keine externen Effekte auslösen. Effekte gehören in
  `afterCommit`: nur der Versuch, der committet hat, führt sie aus. Gerätebefehle, Zahlungsaufrufe, MQTT-Publishes und
  E-Mails werden durch einen Datenbank-Retry daher nie wiederholt.

Das Muster „E-Mail nach dem Commit“ für Einladungen und E-Mail-Änderungen (ATT-1269) folgt derselben Regel: SMTP wird
nach dem Commit gesendet und bei Fehlschlag kompensiert.

## Garantien und ihre Tests

| Garantie                                                                                            | Wo durchgesetzt                                                                                                                | Test                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kein verlorenes Update auf ein Konto aus unabhängigen Verbindungen                                  | Zeilensperren und Guthaben-Trigger in der PostgreSQL-Baseline                                                                  | `database/conformance` (inkl. `ports/billing-ledger`), `e2e/migrations/billing-balance-triggers`                                                                                                                              |
| Unabhängige Ressourcen laufen nicht durch einen anwendungsweiten Mutex                              | Kein globaler Mutex: nur Zeilensperren und Advisory Locks je Ressource (`pg_advisory_xact_lock`)                               | `conformance/ports`: ein Lesen auf einer anderen Verbindung läuft, während eine Einheit offen ist, ein Schreiben auf ein anderes Konto läuft während einer offenen Einheit, und ein zweiter Schreiber committet ohne Deadlock |
| Atomare Mehrfach-Schreibvorgänge, Rollback hinterlässt nichts                                       | `UnitOfWork`                                                                                                                   | `unit-of-work.spec.ts`, `conformance`                                                                                                                                                                                         |
| Post-Commit-Arbeit nach dem Commit, nie nach Rollback                                               | `UnitOfWork.afterCommit`                                                                                                       | ebenso, plus Sichtbarkeit aus einer zweiten Verbindung                                                                                                                                                                        |
| Begrenzter Retry ohne Wiederholung externer Effekte                                                 | `runWithRetry`                                                                                                                 | `conformance`: echter Lock-Timeout oder Deadlock aus einer anderen Verbindung, als `busy` oder `conflict` klassifiziert; Effekte laufen einmal                                                                                |
| Doppelte Beanspruchung eines Schlüssels: genau einer gewinnt, der andere ist eine Unique-Verletzung | Unique-Constraints, `isUniqueViolation`                                                                                        | `conformance`                                                                                                                                                                                                                 |
| Keine doppelte aktive Sitzung und keine kollidierende Reservierung je Ressource                     | Nutzungs-Integritäts-Trigger und Teilindizes (PostgreSQL-Baseline), Advisory Locks je Ressource in den Lifecycle-Transaktionen | `resources/usage/lifecycle-persistence/*.spec.ts`                                                                                                                                                                             |
| Dauerhaftigkeit und Reihenfolge der Audit-Bestätigung (ATT-1212)                                    | Audit-Speicher (`database/adapters/audit`), Einträge per Trigger unveränderlich                                                | `audit/*.spec.ts`                                                                                                                                                                                                             |
| Token-Rotation, Logout-Beleg, SSO-Widerruf atomar und idempotent                                    | `SessionStore` (PostgreSQL, Valkey)                                                                                            | `conformance/ports/session-store`, `adapters/sessions/postgres-session-store.persistence.spec.ts`                                                                                                                             |
| Passkey-Challenge wird genau einmal verbraucht                                                      | `PasskeyStore` (`DELETE … RETURNING`)                                                                                          | `conformance/ports/passkey-store`                                                                                                                                                                                             |
| Beschäftigte Datenbank antwortet 503 und zählt nicht als Brute-Force-Fehlversuch                    | `persistence-errors.ts`, Session-Strategie, Rate Limiter (ATT-1269)                                                            | `session.strategy.spec.ts`, Rate-Limit-Specs                                                                                                                                                                                  |

Bestehende Tests zu dauerhaftem Audit, Guthaben, Nutzungswiederherstellung und Geräteeffekten bleiben, wo sie sind; die
Conformance-Suite ergänzt daneben den engineunabhängigen Vertrag.

## Plugin-Transaktionen

Es gibt keine prozessweite Warteschlange für Plugin-Transaktionen. Die Transaktionen (und die Schreibvorgänge ohne
Scope) **eines** Plugins ordnet eine transaktionsgebundene Advisory-Sperre auf den Plugin-Namen, sodass der SDK-Vertrag
gilt: Eine Prüfen-dann-Schreiben-Folge in einer Plugin-Transaktion kann nicht überholt werden, auch über API-Instanzen
hinweg. Kernarbeit und andere Plugins warten nie auf diese Sperre. Ein Warten bis zum `lock_timeout` lässt die
Transaktion mit `PluginStorageConflict` fehlschlagen; der Host wiederholt nicht.

## Plugin-Speicher

Plugins haben keinen Datenbankzugriff; sie halten Daten in deklarierten Tabellen über den Record-Port (siehe
[Plugin-Speicher](plugins/plugin-storage.md)). Der Host garantiert auf jedem Backend:

- **Isolation per Namensraum.** Die Tabellen eines Plugins heißen `plugin_<plugin>_<tabelle>` (oder ein übernommener
  physischer Name innerhalb dieses Namensraums). Der Port bedient nur die Tabellen der eigenen Deklaration des Plugins:
  keine Kerntabelle, keine Tabelle eines anderen Plugins.
- **Atomare Migrationen.** Jede neutrale Migration (DDL-Schritte, Datenschritt und Verlaufseintrag) ist eine
  Transaktion oder hinterlässt nichts. Die Übernahme einer 1.x-Installation vermerkt die Baseline, ohne etwas
  auszuführen, und verweigert einen partiellen Legacy-Verlauf ohne Änderung.
- **Atomares `update`.** Das `where` von `update` wird zusammen mit dem Schreiben ausgewertet; es ist ein
  Compare-and-Set, das 0 liefert, wenn ein anderer Schreiber gewonnen hat. Plugin-Transaktionen folgen dem
  Unit-of-Work-Vertrag oben: `afterCommit`-Callbacks laufen nie bei Rollback, Verschachteln wird abgewiesen und ein
  Konflikt wird als `PluginStorageConflict` gemeldet.
- **Neutrale Fehler und Werte.** Unique-Verletzungen, Konflikte, fehlende Zeilen und ungültige Eingaben sind auf jeder
  Engine dieselben neutralen Fehler; Zeitstempel sind UTC-Zeitpunkte, Dezimalzahlen exakte Strings.
- **Backup.** Plugin-Tabellen und der Schemastand jedes Plugins (angewendete Version) sind Teil des Transfer-Snapshots
  und werden zusammen mit der Datenbank als eine Einheit wiederhergestellt.

Das deckt die Plugin-Speicher-Conformance-Suite ab, die jeder Backend-Adapter bestehen muss.

## Eine Instanz gegenüber mehreren Replikaten

Attraccess ist als **ein API-Prozess je Datenbank** entworfen und getestet. PostgreSQL beseitigt die Dateisperre des
früheren SQLite-Setups, und die oben genannten Garantien auf Datenbankebene gelten auch für mehrere Prozesse; die
Anwendung behauptet aber keine horizontale Skalierung.

Prozesslokale Annahmen, die ein zweites Replikat brechen würde:

- Speicherinterne Ketten und Sperren wie die Session-Change-Queue, die Leser-Sitzungsverwaltung und Plugin-Upload-Sperren.
- Zeitgeber, etwa die Auswertung der Wartungspläne (ATT-627), die in jedem Replikat liefen.
- Live-Update-Verteilung und WebSocket-Sitzungen, die nur Clients desselben Prozesses erreichen.
- Die MQTT-Verbindungen und der Plugin-Event-Bus.
- Rate-Limit-Zustand ohne Valkey; mit Valkey ist er geteilt.

Was PostgreSQL für eine geteilte Datenbank bereits liefert: die atomaren Guthaben- und Nutzungs-Integritätsgarantien
(Constraints, Trigger, Advisory Locks), Einzelgewinner bei Unique-Schlüsseln und atomare Sitzungs- und Token-Rotation.
Für mehrere Replikate fehlen noch ein Leader oder eine Sperre für Zeitgeber sowie geteilte Live Updates; die
Skalierungs-Folgearbeiten übernehmen das.
