# Audit-Protokoll

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

**Ereignis anzeigen** öffnet die Detailansicht mit ausführendem Benutzer, Ziel, Zeitpunkt, Ergebnis, Quelle und Vorgangs-ID. Enthält das Ereignis freigegebene Vorher-/Nachher-Werte, stellt **Was hat sich geändert?** diese gegenüber. Andere Ereignisse enthalten beispielsweise eine Entscheidung, ein Ergebnis oder eine kompakte Zusammenfassung. Auch WAGO-Konfigurationszusammenfassungen erscheinen in der Vergleichsansicht.

Als **aktuell** gekennzeichnete Namen werden beim Lesen nachgeschlagen und können sich seit dem Ereignis geändert haben. **Erfasste** Namen wurden mit dem Ereignis gespeichert. Die IDs bleiben in der Detailansicht und im Export erhalten, auch wenn ein Benutzer, eine Ressource oder ein anderes Ziel gelöscht wurde.

Die Details zeigen außerdem API-Token-ID, Integrations-ID, IP-Adresse und User-Agent, sofern diese Informationen erfasst wurden. Bei Hintergrund- oder Geräteaktionen können Benutzer und Authentifizierungsmethode unbekannt sein; fehlende Angaben werden nicht aus anderen Ereignissen abgeleitet.

Protokolleinträge sind historische Aufzeichnungen und lassen sich in der Anwendung nicht bearbeiten. Ein Ereignis enthält die für diesen Vorgang erfassten Informationen; es ist keine vollständige Kopie des zugrunde liegenden Objekts. Fehlt bei einem geänderten Feld ein gespeicherter Vorher- oder Nachher-Wert, erscheint **Nicht erfasst**.

## Exportieren

**CSV exportieren** lädt alle aufbewahrten Ereignisse herunter, die zu den angewendeten Filtern passen – einschließlich noch nicht geöffneter Ergebnisseiten. Enthalten sind IDs, Ereignis und Ergebnis, Zeitstempel, Vorgangs-IDs sowie erfasste Details. Noch nicht angewendete Filteränderungen beeinflussen den Export nicht. Formelähnliche Texte werden für Tabellenkalkulationen als Daten maskiert.

## Protokollierung einstellen

Im Reiter **Protokollierung**:

- **Aktivitäten protokollieren** pausiert oder aktiviert die zukünftige Erfassung insgesamt.
- Jeder **Aktivitätsbereich** lässt sich unabhängig auswählen. Änderungen an einem Bereich behalten die übrige Auswahl bei.
- Die **Aufbewahrungsfrist** beträgt 1–3.650 Tage. Ältere Einträge erscheinen nicht mehr in Abfragen und werden automatisch entfernt.

Mit **Speichern** übernehmen Sie die Änderungen. **Verwerfen** stellt die gespeicherten Einstellungen wieder her. Scheitert das Speichern, bleibt der Entwurf für einen erneuten Versuch erhalten. Eine Pause löscht vorhandene Historie nicht; während der Pause ausgeführte Vorgänge werden später nicht nachträglich erfasst.

Die verfügbaren Bereiche richten sich nach Anwendungsversion und Integrationen. WAGO-Controller haben einen eigenen Bereich. Das Audit-Protokoll erfasst ausgewählte administrative und betriebliche Ereignisse. Es speichert keine vollständigen Geräte-Telemetrieströme, Zugangsdaten oder ungefilterten Anfrageinhalte.

## Weitere Informationen

- [Berechtigungen](user-management/permissions.md)
- [Sicherheit und Format der Authentifizierungsprotokolle](settings/security.md)
