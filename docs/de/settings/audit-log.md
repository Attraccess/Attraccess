# Audit-Protokoll
<!-- llms-description: Wie Sie das Audit-Protokoll durchsuchen, filtern, prüfen und exportieren sowie Aufzeichnung und Aufbewahrung steuern. -->

Unter **Einstellungen → Auditprotokoll** können Sie erfasste Aktivitäten nachvollziehen. Der Reiter **Aktivitäten** zeigt die neuesten Ereignisse zuerst. Unter **Protokollierung** legen Sie Erfassung und Aufbewahrung fest.

## Berechtigungen

Zum Lesen und Exportieren ist `system.audit.read` erforderlich. Änderungen an der Protokollierung benötigen `system.settings.manage`. API-Tokens brauchen die jeweilige Berechtigung sowohl im eigenen Berechtigungssatz als auch beim zugehörigen Benutzer. Leseberechtigte können Aktivitäten einsehen, ohne die Protokollierung ändern zu dürfen.

## Ein Ereignis finden

1. Wählen Sie einen Bereich und bei Bedarf ein Ereignispräfix, etwa `maintenance_schedule`.
2. Grenzen Sie den Zeitraum mit **Von** und **Bis** ein. Die Eingabe erfolgt in Ihrer lokalen Zeitzone.
3. Öffnen Sie **Weitere Filter**, um nach Benutzer-ID, Ziel-ID/Zieltyp oder Ergebnis zu suchen.
4. Wählen Sie **Filter anwenden**. Auf kleinen Bildschirmen öffnen Sie zunächst **Filter**; nach dem Anwenden erscheint wieder die Aktivitätenliste.

Mit **Ältere** und **Neuere** wechseln Sie zwischen den Ergebnisseiten. **Aktualisieren** lädt die neuesten passenden Ereignisse. **Filter zurücksetzen** entfernt alle Einschränkungen. Eine leere Liste bedeutet, dass keine aufbewahrten Ereignisse zu den Filtern passen. Ladefehler werden gesondert mit einer Möglichkeit zum erneuten Laden angezeigt.

## Änderungen prüfen

**Ereignis anzeigen** öffnet die Detailansicht mit ausführendem Benutzer, Ziel, Zeitpunkt, Ergebnis, Quelle und Vorgangs-ID. Enthält das Ereignis freigegebene Vorher-/Nachher-Werte, stellt **Was hat sich geändert?** diese gegenüber. Andere Ereignisse enthalten beispielsweise eine Entscheidung, ein Ergebnis oder eine kompakte Zusammenfassung. Auch Plugin-Konfigurationszusammenfassungen erscheinen in der Vergleichsansicht.

Als **aktuell** gekennzeichnete Namen werden beim Lesen nachgeschlagen und können sich seit dem Ereignis geändert haben. **Erfasste** Namen wurden mit dem Ereignis gespeichert. Die IDs bleiben in der Detailansicht und im Export erhalten, auch wenn ein Benutzer, eine Ressource oder ein anderes Ziel gelöscht wurde.

Die Details zeigen außerdem API-Token-ID, Integrations-ID, IP-Adresse und User-Agent, sofern diese Informationen erfasst wurden. Bei Hintergrund- oder Geräteaktionen können Benutzer und Authentifizierungsmethode unbekannt sein; fehlende Angaben werden nicht aus anderen Ereignissen abgeleitet.

Protokolleinträge sind historische Aufzeichnungen und lassen sich in der Anwendung nicht bearbeiten. Ein Ereignis enthält die für diesen Vorgang erfassten Informationen; es ist keine vollständige Kopie des zugrunde liegenden Objekts. Fehlt bei einem geänderten Feld ein gespeicherter Vorher- oder Nachher-Wert, erscheint **Nicht erfasst**.

Änderungen an der Standardsprache des Systems verwenden das bestehende Ereignis `settings.updated` im Administrationsbereich. Die Details nennen `app.defaultLanguage` sowie den vorherigen und neuen Wert (`de` oder `en`). Ist die Erfassung für diesen Bereich aktiviert, erscheinen erfolgreiche Sprachänderungen unter diesem Ereignis. Ein fehlgeschlagener Speichervorgang erzeugt keinen Eintrag für eine erfolgreiche Änderung.

## Flow-Änderungen

Jede Änderung an einem Flow wird im Bereich **Ressourcen** (`resource`) erfasst, mit dem ausführenden Benutzer (oder API-Token), dem Zeitpunkt und dem, was sich geändert hat:

| Ereignis                                                                                      | Erfasst, wenn                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resource_flow.updated` (Ressourcen-Flow geändert)                                            | Die Flow-Arbeitsfläche einer Ressource mit einer Änderung gespeichert wird. Ziel: die Ressource.                                                 |
| `flow.created`, `flow.updated`, `flow.deleted` (Globaler Flow erstellt / geändert / gelöscht) | Ein globaler Flow angelegt wird, sich Name, Beschreibung oder Ein/Aus-Schalter ändern oder er gelöscht wird. Zieltyp: `flow`.                    |
| `flow.canvas_updated` (Canvas eines globalen Flows geändert)                                  | Die Arbeitsfläche eines globalen Flows mit einer Änderung gespeichert wird. Zieltyp: `flow`.                                                     |
| `flow_variable.set`, `flow_variable.deleted` (Flow-Variable gesetzt / gelöscht)               | Ein Benutzer oder API-Token über die Flow-Variablen einer Ressource einen Wert ändert oder eine vorhandene Variable löscht. Ziel: die Ressource. |

Ereignisse zur Arbeitsfläche nennen die Anzahl der Knoten und Verbindungen vorher und nachher, die hinzugefügten, entfernten und geänderten Knoten (ID und Typ) sowie die hinzugefügten und entfernten Verbindungen. Ein Knoten gilt als geändert, wenn sich Typ oder Einstellungen ändern; ein bloßes Verschieben zählt nicht. Ein Speichern ohne Änderung, auch wenn nur Knoten verschoben wurden, wird nicht erfasst. Wird eine gefüllte Arbeitsfläche durch eine leere ersetzt, wird das immer erfasst.

Die Details enthalten außerdem die vorherige Arbeitsfläche als JSON (**Vorheriger Flow (JSON)**). Damit lässt sich ein verlorener Flow aus dem Eintrag oder dem CSV-Export von Hand wiederherstellen. Details sind auf 4.096 Byte begrenzt. Wäre ein Ereignis größer, wird zuerst die vorherige Arbeitsfläche schrittweise reduziert: zuerst ohne Knotenpositionen, dann ohne Knoteneinstellungen (nur IDs, Typen und Verbindungen bleiben) und zuletzt ganz weggelassen. Das Feld **Detailgrad des vorherigen Flows** zeigt die Stufe (`full`, `no_positions`, `no_data`, `omitted`). Erst wenn die Details danach noch zu groß sind, werden die Listen gekürzt: Lange Listen hinzugefügter, entfernter und geänderter Knoten und Verbindungen werden gekürzt; die Anzahlen bleiben vollständig.

Zugangsdaten werden maskiert und als `[redacted]` erfasst. Das betrifft alle HTTP-Header-Werte; jede Einstellung, deren Name nach Zugangsdaten klingt (Passwort, Token, Secret, API-Schlüssel, Authorization, Credential); in Schlüssel/Wert-Listen (zum Beispiel in den Knoten **Variablen setzen** und **Payload setzen**) den Wert eines Eintrags, dessen Schlüssel nach Zugangsdaten klingt oder ein Header ist; das Passwort und zugangsdatenähnliche Query-Parameter in URLs; sowie Werte von Flow-Variablen, deren Schlüssel nach Zugangsdaten klingt, und zugangsdatenähnliche Felder in Variablen mit Objektwerten. Dieser Schutz ist nicht lückenlos: Zugangsdaten in freiem Text, etwa in einem Request-Body oder einer MQTT-Payload, werden so erfasst, wie sie eingegeben wurden. Legen Sie Geheimnisse nicht in frei formulierten Knoteneinstellungen ab.

Wer das Audit-Protokoll lesen darf, sieht die maskierten Knoteneinstellungen und Variablenwerte dieser Ereignisse.

Beim Löschen eines globalen Flows werden der Flow sowie seine Knoten und Verbindungen so erfasst, wie sie vor dem Löschen waren. Das Löschen einer Ressource lässt deren Flow in der Datenbank, aber das Ereignis `resource.deleted` nennt, wie viele Flow-Knoten (`flowNodeCount`) und Verbindungen (`flowEdgeCount`) sie hatte. Werte, die ein laufender Flow in Flow-Variablen schreibt, werden nicht erfasst.

## Exportieren

**CSV exportieren** lädt alle aufbewahrten Ereignisse herunter, die zu den angewendeten Filtern passen – einschließlich noch nicht geöffneter Ergebnisseiten. Enthalten sind IDs, Ereignis und Ergebnis, Zeitstempel, Vorgangs-IDs sowie erfasste Details. Noch nicht angewendete Filteränderungen beeinflussen den Export nicht. Formelähnliche Texte werden für Tabellenkalkulationen als Daten maskiert.

## Protokollierung einstellen

Im Reiter **Protokollierung**:

- **Aktivitäten protokollieren** pausiert oder aktiviert die zukünftige Erfassung insgesamt.
- Jeder **Aktivitätsbereich** lässt sich unabhängig auswählen. Änderungen an einem Bereich behalten die übrige Auswahl bei. Von einem installierten Plugin bereitgestellte Bereiche werden erfasst, solange das Plugin installiert ist, und lassen sich über dieselbe Liste abschalten.
- Die **Aufbewahrungsfrist** beträgt 1–3.650 Tage. Ältere Einträge erscheinen nicht mehr in Abfragen und werden automatisch entfernt.

Mit **Speichern** übernehmen Sie die Änderungen. **Verwerfen** stellt die gespeicherten Einstellungen wieder her. Scheitert das Speichern, bleibt der Entwurf für einen erneuten Versuch erhalten. Eine Pause löscht vorhandene Historie nicht; während der Pause ausgeführte Vorgänge werden später nicht nachträglich erfasst.

Die verfügbaren Bereiche richten sich nach Anwendungsversion und Integrationen. Aktivitäten eines installierten Plugins erscheinen in einem eigenen Bereich. Das Audit-Protokoll erfasst ausgewählte administrative und betriebliche Ereignisse. Es speichert keine vollständigen Geräte-Telemetrieströme, Zugangsdaten oder ungefilterten Anfrageinhalte.

## Weitere Informationen

- [Berechtigungen](user-management/permissions.md)
- [Sicherheit und Format der Authentifizierungsprotokolle](settings/security.md)
