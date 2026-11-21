# Formulare erstellen

<!-- llms-description: So erstellen, bearbeiten, verschieben und löschen Sie Formulare und Felder für eine Ressource, eine Ressourcengruppe oder alle Ressourcen; erfordert die Berechtigung Ressourcen verwalten. -->

Sie benötigen die Berechtigung **Ressourcen verwalten**, um Formulare zu erstellen und zu bearbeiten.

## Neues Formular anlegen

Alle Formulare verwalten Sie in der Seitenleiste unter **Geräte** → **Formulare** (`/forms`). Sie können auch bei einer Ressource beginnen: Öffnen Sie auf ihrer [Detailseite](resources/resource-details.md) **Einstellungen** → **Formulare** und klicken Sie auf **Neues Formular**. Das neue Formular gilt dann für diese Ressource.

1. Öffnen Sie in der Seitenleiste **Geräte** → **Formulare**
2. Klicken Sie auf **Neues Formular**
3. Füllen Sie die Formulareinstellungen aus:

| Einstellung                                              | Pflicht | Beschreibung                                                                                                                         |
| -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Formularname**                                         | Ja      | Ein beschreibender Name für das Formular (z.B. "Materialverbrauch")                                                                  |
| **Standardwerte: wann dieses Formular erforderlich ist** | Nein    | Schalter für Sitzungsstart, Übernahme und Sitzungsende. Eine Ressource kann diese Standardwerte anpassen.                            |
| **Geltungsbereich**                                      | Ja      | Wo das Formular gilt: **Ressource** (Ressource auswählen), **Gruppe** (Ressourcengruppe auswählen) oder **Global** (alle Ressourcen) |

4. Fügen Sie mindestens ein Feld hinzu (siehe unten)
5. Klicken Sie auf **Formular speichern**

Die Liste auf der Seite Formulare zeigt für jedes Formular den Geltungsbereich, die Anzahl der Felder und die Anzahl der Ressourcen, für die es gilt. Mit dem Filter nach Geltungsbereich finden Sie Gruppen- und globale Formulare.

<!-- TODO: Screenshot des Formular-Erstellungsdialogs -->

## Felder hinzufügen

Felder legen fest, welche Daten erfasst werden. Sie fügen sie beim Erstellen des Formulars oder später hinzu:

1. Klicken Sie auf **Feld hinzufügen**
2. Konfigurieren Sie das Feld:

| Einstellung      | Pflicht | Beschreibung                                                        |
| ---------------- | ------- | ------------------------------------------------------------------- |
| **Beschriftung** | Ja      | Feldbeschriftung, die dem Benutzer angezeigt wird (z.B. "Material") |
| **Typ**          | Ja      | **Text**, **Zahl**, **Ja / Nein** oder **Einzelauswahl**            |
| **Pflichtfeld**  | Nein    | Ob der Benutzer dieses Feld ausfüllen muss                          |
| **Beschreibung** | Nein    | Hilfetext, der unter dem Feld angezeigt wird                        |

3. Klicken Sie auf **Formular speichern**

<!-- TODO: Screenshot der Feldkonfiguration -->

### Pflichtfelder vom Typ Ja / Nein (Zustimmung / Akzeptanz)

Wenn ein **Ja / Nein**-Feld als **Pflichtfeld** markiert ist, muss der Benutzer es explizit auf **Ja** (aktiviert) setzen, um das Formular abzusenden. Wird es auf **Nein** belassen, wird das Absenden mit einem Validierungsfehler blockiert.

Nutzen Sie dieses Muster, um Benutzer dazu zu zwingen, etwas aktiv zu bestätigen, bevor sie fortfahren können -- zum Beispiel:

- Akzeptieren der AGB
- Bestätigung, dass Sicherheitshinweise gelesen wurden
- Bestätigung einer abgeschlossenen Sicherheits-Checkliste

> [!NOTE]
> Der Text neben dem Ja / Nein-Schalter ist die **Beschriftung** des Feldes. Eine separate Beschriftung für den Schalter selbst gibt es nicht.

### Einzelauswahl-Felder konfigurieren

Wenn Sie **Einzelauswahl** als Feldtyp wählen, müssen Sie die verfügbaren Optionen definieren:

1. Setzen Sie den Feldtyp auf **Einzelauswahl**
2. Klicken Sie für jede Option auf **Option hinzufügen** und geben Sie den Text ein, der im Dropdown angezeigt wird
3. Benutzer wählen beim Ausfüllen des Formulars eine dieser Optionen aus

> [!TIP]
> Verwenden Sie Einzelauswahl-Felder statt Textfeldern, wenn Sie einheitliche, vordefinierte Antworten wünschen -- zum Beispiel eine Liste verfügbarer Materialien oder Maschinenprofile.

## Formular bearbeiten

Öffnen Sie das Formular unter **Geräte** → **Formulare** oder unter **Einstellungen** → **Formulare** der Ressource: Öffnen Sie das Menü **⋮** in der Zeile des Formulars und wählen Sie **Formular bearbeiten**. Die Formularseite listet die Ressourcen, für die das Formular gilt. Gilt es für mehr als eine Ressource, weist ein Hinweis darauf hin, dass Ihre Änderungen für alle gelten.

### Formular in einen anderen Geltungsbereich verschieben

Sie können den Geltungsbereich eines Formulars jederzeit ändern, zum Beispiel um ein Ressourcen-Formular mit einer ganzen Gruppe zu teilen oder es global zu machen. Das Formular behält seine Felder und Einreichungen, und [Flows](flows/overview.md), die seine Antworten verwenden, funktionieren weiter.

Liegt eine Ressource nicht mehr im neuen Geltungsbereich, werden ihre Anpassungen für dieses Formular entfernt.

## Felder bearbeiten

1. Öffnen Sie das Formular
2. Ändern Sie die Einstellungen des Feldes in seiner Karte. Ziehen Sie ein Feld am Griff, um die Reihenfolge zu ändern.
3. Klicken Sie auf **Formular speichern**

## Felder löschen

1. Öffnen Sie das Formular
2. Klicken Sie beim Feld, das Sie entfernen möchten, auf **Feld löschen**. Es wird sofort ohne Rückfrage aus dem Editor entfernt.
3. Klicken Sie auf **Formular speichern**

> [!WARNING]
> Das Löschen eines Feldes entfernt keine Daten aus bestehenden Formulareinreichungen. Neue Einreichungen enthalten dieses Feld jedoch nicht mehr.

## Ein Formular für eine Ressource abschalten

1. Öffnen Sie bei der Ressource **Einstellungen** → **Formulare**
2. Schalten Sie das Formular mit dem Schalter daneben für diese Ressource aus oder ein
3. Um nur für diese Ressource zu ändern, wann das Formular verlangt wird, wählen Sie für Sitzungsstart, Sitzungsübernahme und Sitzungsende **Erben**, **Erforderlich** oder **Nicht erforderlich**

## Einreichungen ansehen

Der Tab **Einreichungen** eines Formulars listet alle Einreichungen, die neuesten zuerst, mit Datum, Benutzer, Ressource und Aktion. Klappen Sie eine Zeile auf, um die Antworten zu sehen. Filtern Sie nach Ressource, um die Antworten an einer Ressource zu sehen. Unter **Einstellungen** → **Formulare** einer Ressource öffnet **Einreichungen** im Menü **⋮** der Formularzeile diese Liste bereits nach der Ressource gefiltert.

## Formular löschen

1. Öffnen Sie das Formular
2. Öffnen Sie das Menü **⋮** neben dem Titel und wählen Sie **Löschen**
3. Bestätigen Sie die Löschung

Das Formular wird von allen Ressourcen entfernt, für die es gilt. Seine Einreichungen bleiben erhalten und in der Nutzungshistorie sichtbar. Die bisherige Adresse des Formulars (`/forms/<id>`) listet sie weiterhin, nur lesend.

> [!NOTE]
> Wenn Sie eine Ressourcengruppe löschen, werden auch ihre Gruppenformulare gelöscht. Deren Einreichungen bleiben erhalten.

## Siehe auch

- [Formulare-Überblick](forms/overview.md) -- Was Formulare sind und wie sie funktionieren
- [Detailseite](resources/resource-details.md) -- Ressourcen-Detailseite
- [Flows-Überblick](flows/overview.md) -- Formulardaten in Automatisierungen nutzen
