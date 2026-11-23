# Ressourcen erstellen
<!-- llms-description: So legen Sie eine Ressource an, bearbeiten und löschen sie; erfordert die Berechtigung Ressourcen verwalten. -->

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
| **Maximale Sitzungsdauer** | Nein | Nur Maschinen: Wie lange eine Sitzung höchstens laufen darf (1 Minute bis 30 Tage, in Stunden und Minuten). Leer bedeutet kein Limit. Türen ignorieren diese Einstellung |
| **Dauerschätzung verlangen** | Nein | Nur Maschinen: Beim Start muss angegeben werden, wie lange die Maschine höchstens genutzt wird. Türen ignorieren diese Einstellung |
| **Standardschätzung für Reader ohne Display (Minuten)** | Nein | Nur Maschinen: Wird verwendet, wenn eine Schätzung verlangt wird und keine maximale Sitzungsdauer gesetzt ist. Standard 60 Minuten |

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
> [Flows](flows/overview.md) laufen bei jedem Sitzungsstart und -ende. Ein Flow, der beim Sitzungsende den Strom abschaltet, schaltet ihn daher für alle Nutzenden der Maschine ab, sofern er nicht die Anzahl aktiver Sitzungen prüft. Zähler und Laufzeit werden fair auf die Personen aufgeteilt, die die Maschine gleichzeitig nutzen; Nutzungsgebühr und Sitzungszeit bleiben pro Person. Lesen Sie [Gemeinsam genutzte Maschinen](resources/usage-tracking.md#gemeinsam-genutzte-maschinen-parallele-sitzungen), bevor Sie parallele Sitzungen an einer Maschine mit Stromsteuerung oder Zählerabrechnung aktivieren.

### Maximale Sitzungsdauer und Dauerschätzung

Diese Einstellungen verhindern, dass eine Maschine dauerhaft blockiert wird. Sie finden sie in den Ressourceneinstellungen unter **Ressourcentyp und Verhalten** (bei ausgewähltem Typ **Maschine**), neben **Maximale parallele Sitzungen**. Türen ignorieren sie und zeigen sie nicht an.

- **Maximale Sitzungsdauer** ist die längste Zeit, die eine Sitzung laufen darf. Der Server beendet jede Sitzung, die sie erreicht, automatisch.
- **Dauerschätzung verlangen**: Die Web-App und geeignete Leser fragen beim Start (auch bei Übernahme, QR-Link und beaufsichtigtem Start), wie lange die Person die Maschine höchstens nutzt. Spätestens dann stoppt die Maschine automatisch. Während die Sitzung läuft, kann die Person sie mit **+1 Std.**, **+2 Std.**, **+4 Std.**, **+6 Std.**, **+12 Std.**, **+24 Std.** oder **Auf Maximum verlängern** verlängern.
- Sind beide Einstellungen gesetzt, kann weder die Schätzung noch eine Verlängerung die Sitzung über die maximale Sitzungsdauer hinaus verlängern. Eine Schätzung über dem Maximum wird abgelehnt.
- **Standardschätzung für Reader ohne Display (Minuten)** gilt nur, wenn eine Schätzung verlangt wird und keine maximale Sitzungsdauer gesetzt ist. Leser, die nicht fragen können (Attractap Lite Ethernet, die GL-S10-Bridge, Plugin-Leser und Touch-Leser mit älterer Firmware), lehnen einen Start nie wegen einer fehlenden Schätzung ab. Ihre Sitzungen enden bei der maximalen Sitzungsdauer, oder ohne Maximum bei der Standardschätzung (60 Minuten, wenn Sie das Feld leer lassen). Die Standardschätzung darf nicht länger als die maximale Sitzungsdauer sein.

Das Ende wird beim Start der Sitzung festgelegt. Änderungen dieser Einstellungen wirken nur auf Sitzungen, die danach starten; laufende Sitzungen bleiben unverändert. Bei parallelen Sitzungen hat jede Sitzung ihr eigenes Ende; eine Übernahme gibt der neuen Person ein neues Ende (und verlangt ihre Schätzung). API-Clients, die Sitzungen starten, müssen bei Ressourcen mit verlangter Schätzung `estimatedDurationMinutes` senden (siehe [API-Referenz](developer/api-reference.md#sitzungsdauer-und-verlängerung)).

> [!WARNING]
> Das automatische Stoppen ist ein normales Sitzungsende: [Flows](flows/overview.md) führen ihren Stopp-Zweig aus. Ein Flow, der den Strom abschaltet, schaltet ihn daher zum Ende der Frist ab, auch mitten in einem Auftrag. Seien Sie vorsichtig bei langen Aufträgen wie 3D-Drucken und bei gemeinsam genutzten Maschinen (parallele Sitzungen), wo das automatische Ende einer Person den Stopp-Flow der Maschine auslöst. Wählen Sie großzügige Grenzen oder lassen Sie den Flow die Zahl aktiver Sitzungen prüfen. Die Abrechnung bleibt unverändert: Die Sitzung endet einfach zu diesem Zeitpunkt.

### Tür-Optionen

Eine Tür bietet standardmäßig **Abschließen** und **Aufschließen**. In den Ressourceneinstellungen unter **Ressourcentyp und Verhalten** (bei ausgewähltem Typ **Tür**) können Sie das ändern:

- **Aufsperren und Falle öffnen separat** fügt die dritte Aktion **Falle öffnen** hinzu, für Türen, deren Schloss und Falle in zwei Schritten geöffnet werden.
- **Nur Zutritt** ist für Türen gedacht, die nicht aufgeschlossen bleiben können, etwa eine Tür, die kurz öffnet und danach von selbst wieder schließt. Die Tür hat dann nur die Aktion **Öffnen**. Abschließen und Falle öffnen werden nicht angeboten und überall abgelehnt: in der Web-App, an Lesern und über die API.

Die beiden Optionen lassen sich nicht kombinieren: Ist eine eingeschaltet, ist die andere gesperrt. Nur Türen können „Nur Zutritt“ sein.

Ein Öffnen wird als Aufschließen gespeichert. Die Nutzungshistorie zeigt es als **Geöffnet**, und [Flows](flows/overview.md) mit dem Auslöser **Tür entriegelt** laufen auch dafür. Der Flow-Editor einer Nur-Zutritt-Tür bietet nur diesen Tür-Auslöser an: **Tür verriegelt** und **Tür-Falle geöffnet** würden nie ausgelöst. Die Bezeichnung in der Historie folgt der aktuellen Einstellung der Tür: Solange eine Tür „Nur Zutritt“ ist, erscheint auch ein früher gespeichertes Aufschließen als **Geöffnet**; ist die Option wieder aus, erscheint ihr Öffnen als **Aufgeschlossen**. Attractap-Leser mit älterer Firmware zeigen bei einer Nur-Zutritt-Tür **Aufschließen** an; das öffnet die Tür. Ihr **Abschließen** wird abgelehnt.

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
