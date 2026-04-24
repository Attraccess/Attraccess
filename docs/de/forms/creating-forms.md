# Formulare erstellen

Sie benötigen die Berechtigung **Ressourcen verwalten**, um Formulare zu erstellen und zu bearbeiten.

## Neues Formular anlegen

1. Navigieren Sie zur [Detailseite](resources/resource-details.md) der Ressource
2. Klicken Sie auf den Tab **Formulare**
3. Klicken Sie auf **Formular erstellen**
4. Füllen Sie die Formulareinstellungen aus:

| Einstellung | Pflicht | Beschreibung |
|-------------|---------|-------------|
| **Name** | Ja | Ein beschreibender Name für das Formular (z.B. "Materialverbrauch") |
| **Erforderlich bei** | Ja | Wann das Formular angezeigt wird: Sitzungsbeginn, Sitzungsübernahme oder Sitzungsende |

5. Klicken Sie auf **Speichern**

<!-- TODO: Screenshot des Formular-Erstellungsdialogs -->

## Felder hinzufügen

Nach dem Erstellen eines Formulars fügen Sie Felder hinzu, um festzulegen, welche Daten erfasst werden:

1. Klicken Sie auf **Feld hinzufügen**
2. Konfigurieren Sie das Feld:

| Einstellung | Pflicht | Beschreibung |
|-------------|---------|-------------|
| **Name** | Ja | Feldbeschriftung, die dem Benutzer angezeigt wird (z.B. "Material") |
| **Typ** | Ja | Text, Zahl, Boolean oder Auswahl |
| **Pflichtfeld** | Nein | Ob der Benutzer dieses Feld ausfüllen muss |
| **Beschreibung** | Nein | Hilfetext, der unter dem Feld angezeigt wird |

3. Klicken Sie auf **Speichern**

<!-- TODO: Screenshot der Feldkonfiguration -->

### Pflicht-Boolean-Felder (Zustimmung / Akzeptanz)

Wenn ein **Boolean**-Feld als **Pflichtfeld** markiert ist, muss der Benutzer es explizit auf **Ja** (aktiviert) setzen, um das Formular abzusenden. Wird es auf **Nein** belassen, wird das Absenden mit einem Validierungsfehler blockiert.

Nutzen Sie dieses Muster, um Benutzer dazu zu zwingen, etwas aktiv zu bestätigen, bevor sie fortfahren können -- zum Beispiel:

- Akzeptieren der AGB
- Bestätigung, dass Sicherheitshinweise gelesen wurden
- Bestätigung einer abgeschlossenen Sicherheits-Checkliste

> [!NOTE]
> Die Beschriftung eines Boolean-Feldes wird durch den **Namen** des Feldes bestimmt. Eine separate Checkbox-Beschriftung kann nicht gesetzt werden -- der Feldname ist das, was der Benutzer neben der Checkbox sieht.

### Auswahlfelder konfigurieren

Wenn Sie **Auswahl** als Feldtyp wählen, müssen Sie die verfügbaren Optionen definieren:

1. Setzen Sie den Feldtyp auf **Auswahl**
2. Fügen Sie Optionen hinzu -- jede Option benötigt eine Beschriftung, die im Dropdown angezeigt wird
3. Benutzer wählen beim Ausfüllen des Formulars eine dieser Optionen aus

> [!TIP]
> Verwenden Sie Auswahlfelder statt Textfeldern, wenn Sie einheitliche, vordefinierte Antworten wünschen -- zum Beispiel eine Liste verfügbarer Materialien oder Maschinenprofile.

## Felder bearbeiten

1. Öffnen Sie das Formular im Tab **Formulare**
2. Klicken Sie auf das Feld, das Sie bearbeiten möchten
3. Ändern Sie die gewünschten Einstellungen
4. Speichern Sie die Änderungen

## Felder löschen

1. Öffnen Sie das Formular im Tab **Formulare**
2. Klicken Sie auf das Löschen-Symbol des Feldes, das Sie entfernen möchten
3. Bestätigen Sie die Löschung

> [!WARNING]
> Das Löschen eines Feldes entfernt keine Daten aus bestehenden Formulareinreichungen. Neue Einreichungen enthalten dieses Feld jedoch nicht mehr.

## Formular löschen

1. Öffnen Sie den Tab **Formulare** auf der Ressourcen-Detailseite
2. Klicken Sie auf das Löschen-Symbol des Formulars, das Sie entfernen möchten
3. Bestätigen Sie die Löschung

## Siehe auch

- [Formulare-Überblick](forms/overview.md) -- Was Formulare sind und wie sie funktionieren
- [Detailseite](resources/resource-details.md) -- Ressourcen-Detailseite
- [Flows-Überblick](flows/overview.md) -- Formulardaten in Automatisierungen nutzen
