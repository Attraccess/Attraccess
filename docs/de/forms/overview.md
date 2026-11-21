# Formulare

<!-- llms-description: Stellt Formulare vor, die bei der Ressourcennutzung abgefragt werden, inklusive Geltungsbereich, Anzeigezeitpunkten, Feldtypen und Einreichungen. -->

Mit Formularen können Sie Informationen von Benutzern erfassen, wenn diese mit einer Ressource interagieren. Sie legen ein Formular einmal an und wählen, wo es gilt: für eine Ressource, für alle Ressourcen einer Ressourcengruppe oder für alle Ressourcen. Ein Formular kann zu verschiedenen Zeitpunkten während einer Nutzungssitzung verlangt werden.

## Was sind Formulare?

Ein Formular ist eine Sammlung von Feldern, die Benutzer während der Ressourcennutzung ausfüllen. Zum Beispiel möchten Sie vielleicht Folgendes erfassen:

- Das Material, das auf einem Lasercutter verwendet wird
- Das Gewicht des verbrauchten Filaments auf einem 3D-Drucker
- Eine Projektreferenz für Abrechnungszwecke

## Wo ein Formular gilt

Jedes Formular hat einen **Geltungsbereich**:

| Geltungsbereich | Das Formular gilt für                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Ressource**   | Eine Ressource                                                                                                                 |
| **Gruppe**      | Alle Ressourcen einer [Ressourcengruppe](resources/resource-groups.md), auch für Ressourcen, die später zur Gruppe hinzukommen |
| **Global**      | Alle Ressourcen                                                                                                                |

Wenn Sie ein Formular bearbeiten, ändert es sich überall, wo es gilt, in der Web-App und auf Attractap-Lesegeräten. Sie müssen denselben Fragebogen nicht auf zehn Maschinen pflegen.

> [!NOTE]
> Die Gruppenmitgliedschaft bestimmt, welche Gruppenformulare eine Ressource abfragt. Fügen Sie eine Ressource einer Gruppe hinzu, gelten ab dann die Formulare der Gruppe für sie. Entfernen Sie sie, gelten sie nicht mehr.

Erreicht eine Ressource dasselbe Formular mehrfach, zum Beispiel über zwei Gruppen, wird es nur einmal abgefragt. Sind mehrere Formulare verlangt, kommen zuerst die globalen Formulare, dann die Gruppenformulare, dann die eigenen Formulare der Ressource.

### Ein Formular für eine Ressource abschalten oder anpassen

Unter **Einstellungen** → **Formulare** einer Ressource sehen Sie alle Formulare, die für sie gelten, auch geerbte Gruppen- und globale Formulare. Für jedes Formular können Sie:

- **Es abschalten** für diese Ressource. Überall sonst gilt das Formular weiter.
- **Festlegen, wann es verlangt wird.** Wählen Sie für Sitzungsstart, Sitzungsübernahme und Sitzungsende jeweils **Erben** (Standard des Formulars), **Erforderlich** oder **Nicht erforderlich**.

Nur diese Einstellungen können je Ressource abweichen. Name und Felder sind überall gleich, wo das Formular gilt.

## Wann werden Formulare angezeigt?

Ein Formular legt für jeden Zeitpunkt im Nutzungszyklus einen Standard fest. Eine Ressource kann diese Standards anpassen (siehe oben):

| Auslöser              | Wann es erscheint                                                       |
| --------------------- | ----------------------------------------------------------------------- |
| **Sitzungsstart**     | Wenn ein Benutzer die Nutzung der Ressource startet                     |
| **Sitzungsübernahme** | Wenn ein Benutzer eine aktive Sitzung eines anderen Benutzers übernimmt |
| **Sitzungsende**      | Wenn ein Benutzer seine Nutzungssitzung beendet                         |

> [!TIP]
> Verwenden Sie **Sitzungsende**-Formulare, um Daten zu erfassen, die erst nach der Nutzung bekannt sind, wie Materialverbrauch oder Druckergebnisse.

## Feldtypen

Formulare unterstützen die folgenden Feldtypen:

| Typ               | Beschreibung                         | Beispiel                                                                               |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| **Text**          | Freitexteingabe                      | Materialname, Anmerkungen                                                              |
| **Zahl**          | Numerische Eingabe                   | Dauer, Gewicht, Menge                                                                  |
| **Ja / Nein**     | Schalter (Ja/Nein)                   | "Arbeitsplatz aufgeräumt?", "Sicherheitscheck durchgeführt?", "Ich akzeptiere die AGB" |
| **Einzelauswahl** | Dropdown mit vordefinierten Optionen | Materialtyp, Projektauswahl                                                            |

> [!TIP]
> Ein **Ja / Nein**-Feld, das als **Pflichtfeld** markiert ist, muss auf **Ja** (aktiviert) gesetzt werden, bevor das Formular abgesendet werden kann. Dies eignet sich ideal dazu, Benutzer zum Akzeptieren der AGB oder zur Bestätigung von Sicherheitshinweisen zu zwingen. Details siehe [Formulare erstellen](forms/creating-forms.md).

Formulare werden bei Maschinen-Ressourcen angezeigt. Ein Formular, das zu keinem Zeitpunkt verlangt wird, wird nie angezeigt.

## Formulare auf Attractap-Lesegeräten

Lesegeräte laden die Felder eines Formulars live, Änderungen kommen also bei der nächsten Abfrage an. Ein Lesegerät zeigt höchstens vier Formulare auf einmal. Sind mehr Formulare verlangt, fragt das Lesegerät die nächsten ab, sobald die ersten ausgefüllt sind. Die Sitzung startet oder endet erst, wenn alle ausgefüllt sind. Dafür ist eine Lesegeräte-Firmware nötig, die das unterstützt; ältere Firmware bleibt nach den ersten vier Formularen stehen.

## Formulareinreichungen

Alle Formulareinreichungen werden automatisch mit der zugehörigen Nutzungssitzung verknüpft und damit mit der Ressource, an der sie abgegeben wurden. Administratoren können die eingereichten Daten in der Nutzungshistorie der Ressource einsehen, und alle Einreichungen eines Formulars über alle Ressourcen hinweg im Tab **Einreichungen** des Formulars, bei Bedarf nach Ressource gefiltert.

Jede Einreichung speichert eine Kopie der Felder, wie sie beim Absenden waren. Spätere Änderungen am Formular ändern frühere Antworten nicht.

Wenn Sie ein Formular löschen, gilt es nirgends mehr, seine Einreichungen bleiben aber in der Nutzungshistorie und, nur lesend, unter der bisherigen Adresse des Formulars sichtbar.

<!-- TODO: Screenshot einer Formulareinreichung in der Nutzungshistorie -->

> [!NOTE]
> Formulardaten können auch von [Flows](flows/overview.md) verwendet werden. So können Sie Automatisierungen erstellen, die auf Benutzereingaben reagieren -- zum Beispiel Abrechnungsposten basierend auf dem ausgewählten Material setzen.

## Siehe auch

- [Formulare erstellen](forms/creating-forms.md) -- Formulare erstellen und konfigurieren
- [Nutzungsverfolgung](resources/usage-tracking.md) -- Formulareinreichungen anzeigen
- [Flows-Überblick](flows/overview.md) -- Automatisierung mit Formulardaten
- [Abrechnung](billing/overview.md) -- Formulare zur Kostenerfassung nutzen
