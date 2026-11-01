# Ressourcen erstellen

Sie benötigen die Berechtigung **Ressourcen verwalten**, um neue Ressourcen anzulegen.

## Neue Ressource anlegen

1. Navigieren Sie zur Ressourcenübersicht (Startseite)
2. Klicken Sie auf den **+** Button
3. Füllen Sie das Formular aus:

| Feld | Pflicht | Beschreibung |
|------|---------|-------------|
| **Name** | Ja | Name der Ressource (z.B. "Lasercutter Trotec") |
| **Typ** | Ja | Maschine oder Tür |
| **Beschreibung** | Nein | Detaillierte Beschreibung |
| **Bild** | Nein | Foto der Ressource (JPG, PNG) |
| **Übernahme erlauben** | Nein | Nächster Benutzer kann Sitzung übernehmen, ohne dass der vorherige sie beendet. Wirkt nur, wenn **Maximale parallele Sitzungen** 1 ist |
| **Maximale parallele Sitzungen** | Nein | Nur Maschinen: Wie viele Personen die Maschine gleichzeitig nutzen dürfen (1–1000, Standard 1). Türen ignorieren diese Einstellung |

4. Klicken Sie auf **Speichern**

<!-- TODO: Screenshot des Erstellungsformulars einfügen -->

### Maximale parallele Sitzungen

Standardmäßig kann eine Maschine jeweils von einer Person genutzt werden. Wenn mehrere Personen eine Maschine sicher gleichzeitig verwenden können (zum Beispiel eine Werkbank oder eine gemeinsame Werkzeugstation), erhöhen Sie **Maximale parallele Sitzungen** in den Ressourceneinstellungen unter **Ressourcentyp und Verhalten** (bei ausgewähltem Typ **Maschine**), neben **Übernahme erlauben**.

- Bei einem Limit von **1** (Standard) kann die Maschine nur von einer Person gleichzeitig genutzt werden.
- Bei einem Limit von **N** können bis zu N verschiedene Personen gleichzeitig jeweils eine eigene aktive Sitzung haben. Jede Person kann pro Maschine nur eine aktive Sitzung haben.
- Sind alle Plätze belegt, werden weitere Starts mit der Meldung **Maschine ist voll** abgelehnt.
- **Übernahme erlauben** gilt nur bei einem Limit von 1. Bei Maschinen mit höherem Limit wird keine Übernahme angeboten.
- Einweisung, Berechtigung, [Beaufsichtigungsmodus](resources/introductions.md), Formulare, Guthaben, Wartung und Zustand werden für jede Person einzeln geprüft.

Das Limit kann jederzeit gesenkt werden. Laufende Sitzungen werden nie automatisch beendet; neue Starts sind blockiert, bis weniger Sitzungen als das Limit aktiv sind. Liegt das neue Limit unter der Zahl der aktuell aktiven Sitzungen, zeigt die Einstellungsseite einen Hinweis an. Wird das Limit über 1 erhöht, erscheint außerdem eine Warnung zu Flows.

> [!WARNING]
> [Flows](flows/overview.md) und Abrechnung berücksichtigen nicht, wie viele Sitzungen laufen. Flows laufen bei jedem Sitzungsstart und -ende. Ein Flow, der beim Sitzungsende den Strom abschaltet, schaltet ihn daher für alle Nutzenden der Maschine ab. Zähler und Laufzeit werden nur einer einzigen Sitzung berechnet. Lesen Sie [Gemeinsam genutzte Maschinen](resources/usage-tracking.md#gemeinsam-genutzte-maschinen-parallele-sitzungen), bevor Sie parallele Sitzungen an einer Maschine mit Stromsteuerung oder Zählerabrechnung aktivieren.

## Ressource bearbeiten

1. Öffnen Sie die [Detailseite](resources/resource-details.md) der Ressource
2. Klicken Sie auf **Bearbeiten**
3. Ändern Sie die gewünschten Felder
4. Speichern Sie die Änderungen

## Ressource löschen

1. Öffnen Sie die Detailseite der Ressource
2. Klicken Sie auf **Löschen**
3. Bestätigen Sie die Löschung

> [!WARNING]
> Das Löschen einer Ressource entfernt auch alle zugehörigen Einweisungen, Nutzungshistorie und Flows. Diese Aktion kann nicht rückgängig gemacht werden.

## Siehe auch

- [Detailseite](resources/resource-details.md)
- [Dokumentation hinzufügen](resources/documentation.md)
- [Einweisungen verwalten](resources/introductions.md)
