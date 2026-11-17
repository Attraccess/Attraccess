# Persistenz-Garantien

<!-- llms-description: Der Transaktions- und Nebenläufigkeitsvertrag der Persistenzschicht, wo welche Garantie getestet wird und welche Annahmen nur für eine einzelne API-Instanz gelten. -->

Diese Seite nennt, was die Persistenzschicht zusichert, wie jede Zusicherung getestet wird und was bei mehr als einer
API-Instanz **nicht** zugesichert ist. Horizontale Skalierung wird nicht behauptet.

## Unit of Work

`UnitOfWork` (`apps/api/src/database/unit-of-work.ts`) ist der neutrale Port für atomare Schreibvorgänge.

- `run(work)` öffnet einen Transaktionsbereich. Alles, was darüber geschrieben wird, wird gemeinsam oder gar nicht committet.
- Ein `run` innerhalb eines laufenden Bereichs desselben asynchronen Ablaufs **tritt ihm bei**; es gibt keine Verschachtelung.
- `scope.afterCommit(callback)` läuft nur nach dem Commit der äußersten Einheit, in Registrierungsreihenfolge, nie bei
  Rollback. Ein fehlschlagender Callback wird geloggt (nur Fehlerklasse) und macht den Commit nicht rückgängig.
- Ein Bereich ist nach Commit oder Rollback geschlossen. Ein geschlossener oder fremder Bereich (andere Verbindung)
  wird mit `TransactionScopeError` abgelehnt.
- `runWithRetry` ist der vorgesehene Weg, Datenbankarbeit zu wiederholen. Es startet die äußerste Einheit bei
  vorübergehenden Fehlern (busy, Schreibkonflikt) neu: standardmäßig drei Versuche, nie mehr als zehn, mit
  zufällig gestreutem exponentiellem Backoff (50 ms Basis, höchstens 1 s). Innerhalb einer offenen Einheit verweigert es
  den Start, weil ein Retry dort die Schreibvorgänge der äußeren Einheit nicht zurücknehmen könnte. Die Arbeit läuft von
  vorn und darf keine externen Effekte auslösen. Effekte gehören in
  `afterCommit`: nur der Versuch, der committet hat, führt sie aus. Gerätebefehle, Zahlungsaufrufe, MQTT-Publishes und
  E-Mails werden durch einen Datenbank-Retry daher nie wiederholt.

Das Muster „E-Mail nach dem Commit“ für Einladungen und E-Mail-Änderungen (ATT-1269) folgt derselben Regel: SMTP wird
nach dem Commit gesendet und bei Fehlschlag kompensiert.

## Garantien und ihre Tests

| Garantie                                                                                            | Wo durchgesetzt                                                                                                             | Test                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kein verlorenes Update auf ein Konto aus unabhängigen Verbindungen                                  | Transaktionsisolation des Backends (SQLite: ein Schreiber, `BEGIN IMMEDIATE`); Guthaben-Trigger (Migration `1759695000000`) | `database/conformance` (inkl. `ports/billing-ledger`), `e2e/migrations/billing-balance-triggers`                                                                                                                                                                                                                                      |
| Unabhängige Ressourcen laufen nicht durch einen anwendungsweiten Mutex                              | Der Vertrag sichert nur Isolation je Einheit zu; der einzelne SQLite-Schreiber ist Adapterdetail                            | `conformance/ports`: ein Lesen auf einer anderen Verbindung läuft, während eine Einheit offen ist, und ein wartender zweiter Schreiber committet ohne Deadlock. Ein Schreiben auf ein anderes Konto während einer offenen Einheit läuft nur bei Fixtures mit `concurrentWriters` (nicht SQLite, das je Datei einen Schreiber zulässt) |
| Atomare Mehrfach-Schreibvorgänge, Rollback hinterlässt nichts                                       | `UnitOfWork`                                                                                                                | `unit-of-work.spec.ts`, `sqlite-unit-of-work.spec.ts`, `conformance`                                                                                                                                                                                                                                                                  |
| Post-Commit-Arbeit nach dem Commit, nie nach Rollback                                               | `UnitOfWork.afterCommit`                                                                                                    | ebenso, plus Sichtbarkeit aus einer zweiten Verbindung                                                                                                                                                                                                                                                                                |
| Begrenzter Retry ohne Wiederholung externer Effekte                                                 | `runWithRetry`                                                                                                              | `conformance`: echter Busy-Fehler aus einer dritten Verbindung, als `busy` klassifiziert; Effekte laufen einmal                                                                                                                                                                                                                       |
| Doppelte Beanspruchung eines Schlüssels: genau einer gewinnt, der andere ist eine Unique-Verletzung | Unique-Constraints, `isUniqueViolation`                                                                                     | `conformance`                                                                                                                                                                                                                                                                                                                         |
| Keine doppelte aktive Sitzung und keine kollidierende Reservierung je Ressource                     | Nutzungs-Integritäts-Trigger und Teilindizes (Migration `1790100000000`), Ressourcen-Lifecycle-Transaktionen                | `resources/usage/lifecycle-persistence/*.spec.ts`                                                                                                                                                                                                                                                                                     |
| Dauerhaftigkeit und Reihenfolge der Audit-Bestätigung (ATT-1212)                                    | Eigene Audit-Verbindung, `database/adapters/audit/audit-storage.ts`                                                         | `audit/*.spec.ts`                                                                                                                                                                                                                                                                                                                     |
| Token-Rotation, Logout-Beleg, SSO-Widerruf atomar und idempotent                                    | `SessionStore` (SQLite, Valkey)                                                                                             | `conformance/ports/session-store`, `adapters/sessions/sqlite-session-store.persistence.spec.ts`                                                                                                                                                                                                                                       |
| Passkey-Challenge wird genau einmal verbraucht                                                      | `PasskeyStore` (`DELETE … RETURNING`)                                                                                       | `conformance/ports/passkey-store`                                                                                                                                                                                                                                                                                                     |
| Beschäftigte Datenbank antwortet 503 und zählt nicht als Brute-Force-Fehlversuch                    | `persistence-errors.ts`, Session-Strategie, Rate Limiter (ATT-1269)                                                         | `session.strategy.spec.ts`, Rate-Limit-Specs                                                                                                                                                                                                                                                                                          |

Bestehende Tests zu dauerhaftem Audit, Guthaben, Nutzungswiederherstellung und Geräteeffekten bleiben, wo sie sind; die
Conformance-Suite ergänzt daneben den engineunabhängigen Vertrag.

## Details des SQLite-Adapters

Diese liegen nur in `apps/api/src/database/sqlite` und in den Audit-Speicherverbindungen:

- Transaktionen beginnen `IMMEDIATE` mit Busy-Timeout, damit ein Wechsel von Lesen auf Schreiben nicht halb scheitern kann.
- Die Hauptverbindung weist jedem asynchronen Ablauf seine Transaktion zu (AsyncLocalStorage) und reiht andere Abläufe
  der Reihe nach ein (ATT-1269). Anweisungen anderer Abläufe warten höchstens das Busy-Timeout, dann `SQLITE_BUSY`.
- Schreibvorgänge des Ressourcen-Lifecycles nutzen eine eigene zweite Verbindung zur selben Datei, eine Einheit nach der anderen.
- Der Audit-Dienst hält eigene Verbindungen und PRAGMAs.

Ein anderes Backend erfüllt denselben Verhaltensvertrag mit eigener Sperr- und Isolationstechnik.

## Eine Instanz gegenüber mehreren Replikaten

Attraccess ist als **ein API-Prozess je Datenbank** entworfen und getestet. Mit SQLite ist das auch zwingend: die
Datenbank ist eine lokale Datei.

Prozesslokale Annahmen, die ein zweites Replikat brechen würde:

- Serialisierungswarteschlange und Ablaufzuordnung des SQLite-Adapters (im Speicher, je Prozess).
- Speicherinterne Ketten und Sperren wie die Session-Change-Queue, die Leser-Sitzungsverwaltung und Plugin-Upload-Sperren.
- Zeitgeber, etwa die Auswertung der Wartungspläne (ATT-627), die in jedem Replikat liefen.
- Live-Update-Verteilung und WebSocket-Sitzungen, die nur Clients desselben Prozesses erreichen.
- Die MQTT-Verbindungen und der Plugin-Event-Bus.
- Rate-Limit-Zustand ohne Valkey; mit Valkey ist er geteilt.

Eine geteilte Datenbank müsste statt Prozessspeicher liefern: die atomaren Guthaben- und Nutzungs-Integritätsgarantien
(Constraints oder Trigger), Einzelgewinner bei Unique-Schlüsseln, dauerhafte Audit-Bestätigung, atomare Sitzungs- und
Token-Rotation sowie einen Leader oder eine Sperre für Zeitgeber. Das ist hier nicht umgesetzt; die
PostgreSQL-Arbeit in ATT-584 und die Skalierungs-Folgearbeiten übernehmen es.
