# CSV-Export

Exportieren Sie Nutzungs- und Abrechnungsdaten als CSV-Datei zur Analyse, für Berichte, die Buchhaltung oder den Upload in andere Systeme. Sie legen fest, welche Spalten die Datei enthält, wie ihre Überschriften heißen und in welcher Reihenfolge sie stehen. Gespeicherte **Vorlagen** machen dieselbe Konfiguration wiederverwendbar.

## Berechtigungen

| Export | Erforderliche Berechtigung |
|--------|----------------------------|
| **Ressourcen-Nutzung** | `resources.reports.export` |
| **Abrechnungstransaktionen** | `billing.manage` (und das Abrechnungsmodul) |

Die Seite **CSV-Export** steht zur Verfügung, wenn Sie mindestens eine dieser Berechtigungen haben. Export-Typen, die Sie nicht verwenden dürfen, werden nicht angezeigt.

## Daten exportieren

1. Öffnen Sie die Seite **CSV-Export** über die Seitenleisten-Navigation.
2. Wählen Sie einen Zeitraum über eine Voreinstellung (z. B. *Letzte 30 Tage*) oder einen eigenen Zeitraum.
3. Klicken Sie auf die Karte des gewünschten Export-Typs. Damit öffnet sich die Konfigurationsseite dieses Exports (`/csv-export/resource-usage-hours` oder `/csv-export/billing-transactions`).
4. Wählen Sie eine Vorlage oder konfigurieren Sie die Spalten (siehe unten). Die Vorschau zeigt die ersten Zeilen genau so, wie sie in der Datei stehen werden.
5. Klicken Sie auf **CSV herunterladen**. Die Datei wird auf Ihren Computer heruntergeladen, sobald alle Daten geladen sind.

Der Zeitraum ist Teil der Seitenadresse (`?start=…&end=…`). Neu laden oder den Link teilen behält ihn daher bei. Fehlt der Zeitraum in der Adresse oder ist er ungültig, werden die letzten 30 Tage verwendet. Mit **Zurück** gelangen Sie zur Zeitraumauswahl.

<!-- TODO: Screenshot der CSV-Export-Konfigurationsseite einfügen -->

## Spalten konfigurieren

Ohne Vorlage startet der Export mit den Standardspalten seines Typs. Unterhalb des Vorlagenbereichs können Sie sie ändern:

- **Feldspalte**: Wählen Sie ein beliebiges verfügbares Datenfeld. Verwenden Sie **Feldspalte hinzufügen**.
- **Konstantenspalte**: Schreibt in jede Zeile denselben festen Wert, z. B. eine Kostenstelle oder eine vom Zielsystem verlangte Organisations-ID. Verwenden Sie **Konstantenspalte hinzufügen**. Eine Konstante darf leer sein.
- **Überschrift**: Jede Spalte hat eine eigene Überschrift. Bleibt sie leer, wird die Standardbezeichnung des Felds verwendet (als Platzhalter angezeigt).
- **Reihenfolge**: Mit den Pfeiltasten verschieben Sie eine Spalte nach oben oder unten. Die Datei enthält die Spalten genau in dieser Reihenfolge.
- **Entfernen**: Entfernt die Spalte aus dem Export.

Der Download ist deaktiviert, solange keine Spalten oder keine Zeilen vorhanden sind oder Daten geladen werden.

### Nach Benutzer und Ressource gruppieren (Ressourcen-Nutzung)

Die Option bleibt wie bisher erhalten. Die Gruppierung selbst ist noch nicht umgesetzt und hat derzeit keine Auswirkung auf die Datei.

## Vorlagen

Eine Vorlage speichert die komplette Spaltenkonfiguration (Felder, Konstanten, eigene Überschriften, Reihenfolge) unter einem Namen. Vorlagen gehören zu einem Export-Typ und sind für **alle sichtbar**, die den CSV-Export verwenden dürfen. Vorlagennamen sind pro Export-Typ eindeutig.

- **Vorlage auswählen** lädt ihre Spalten in den Editor. **Keine Vorlage (Standardspalten)** stellt die Standardspalten wieder her.
- **Als neue Vorlage speichern** fragt nach einem Namen und speichert die aktuelle Konfiguration.
- **Änderungen speichern** überschreibt die ausgewählte Vorlage mit der aktuellen Konfiguration. Der Name kann vor dem Speichern geändert werden.
- **Vorlage löschen** entfernt die Vorlage nach Bestätigung für alle.

Nach dem Laden einer Vorlage können Sie weiter bearbeiten, ohne zu speichern. Der Download verwendet immer, was Sie aktuell im Editor sehen. Existiert bereits eine Vorlage mit diesem Namen, wird eine Fehlermeldung angezeigt und nichts gespeichert.

> [!NOTE]
> Enthält eine Vorlage ein Feld, das in den aktuellen Daten fehlt (z. B. einen Ressourcen-Metadatenschlüssel, den keine Ressource im gewählten Zeitraum hat), wird die Spalte trotzdem mit ihrer Überschrift und leeren Werten exportiert. Der Editor markiert sie mit *In den aktuellen Daten nicht verfügbar* und behält sie in der Vorlage.

## Verfügbare Felder

### Ressourcen-Nutzung

| Feld | Beschreibung |
|------|--------------|
| Ressourcen-ID / Ressourcen-Name | Die genutzte Ressource |
| Benutzer-ID / Benutzer-Name | Der Benutzer der Sitzung |
| **Benutzer-E-Mail** | E-Mail-Adresse des Benutzers |
| **Externe Benutzerkennung** | Die externe Kennung des Benutzers (z. B. von Ihrem SSO-Anbieter) |
| Startzeit / Endzeit | Passend zu Ihrer Sprache formatiert (auch als ISO-Zeitstempel verfügbar) |
| Nutzung in Minuten / Stunden | Dauer der Sitzung |
| Exakte Sitzungsdauer (ms) | Sitzungsdauer in Millisekunden |
| Betriebsdauer (ms, Sitzung) | Der Sitzung zugeordnete Betriebszeit (sofern Betriebsdaten vorliegen) |
| Status der Betriebsdaten | Ob die Betriebsdauer final, vorläufig oder nicht verfügbar ist |
| Start-Notizen / End-Notizen | Notizen zu Beginn und Ende der Sitzung |
| Betreuer-ID / Betreuer-Name | Der betreuende Benutzer, falls vorhanden |
| **Betreuer-E-Mail** | E-Mail-Adresse des betreuenden Benutzers |
| **Ressourcen-Metadaten: \<Schlüssel\>** | Ein Feld für jeden Metadatenschlüssel, der bei den Ressourcen der geladenen Zeilen vorkommt |

### Abrechnungstransaktionen

| Feld | Beschreibung |
|------|--------------|
| ID, Erstellt am, Betrag, Status, Externe Referenz | Die Transaktion |
| Benutzer, **Benutzer-ID**, **Benutzer-E-Mail**, **Externe Benutzerkennung** | Der belastete Benutzer |
| Initiator, **Initiator-E-Mail** | Der Benutzer, der die Transaktion ausgelöst hat |
| Ressource / Nutzung | Name der Ressource der zugehörigen Nutzung |
| Erstattung von / Korrektur von | IDs zugehöriger Transaktionen |
| Positionen | Rechnungspositionen |
| **Ressourcen-Metadaten: \<Schlüssel\>** | Ein Feld für jeden Metadatenschlüssel der Ressource der zugehörigen Nutzung |

Werte der Ressourcen-Metadaten werden als Text geschrieben. Objekte und Listen werden als JSON geschrieben.

> [!NOTE]
> E-Mail-Adressen von Benutzern sind ausschließlich in den Daten des CSV-Exports enthalten. Andere Teile der API geben sie nicht aus.

## Format der CSV-Datei

- Spalten werden durch ein Semikolon (`;`), Zeilen durch einen Zeilenumbruch getrennt. Das Trennzeichen ist nicht konfigurierbar.
- Zellen und Überschriften mit Semikolon, doppeltem Anführungszeichen oder Zeilenumbruch werden in doppelte Anführungszeichen gesetzt. Doppelte Anführungszeichen innerhalb einer Zelle werden verdoppelt (`"` wird zu `""`), wie es Tabellenkalkulationen erwarten.
- Fehlende Werte werden als leere Zellen geschrieben.

> [!TIP]
> Sie können die CSV-Datei in Tabellenkalkulationsprogrammen wie Microsoft Excel, Google Sheets oder LibreOffice Calc zur weiteren Analyse öffnen.

## Siehe auch

- [Nutzungsverfolgung](resources/usage-tracking.md)
- [Ressourcen](resources/overview.md)
