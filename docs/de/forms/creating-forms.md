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
| **Typ**          | Ja      | **Text**, **Zahl**, **Ja / Nein**, **Einzelauswahl** oder **Bild**  |
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

### Bildfelder konfigurieren

Verwenden Sie ein **Bild**-Feld, wenn Benutzer Fotos anhängen sollen, zum Beispiel um Schäden bei der Rückgabe einer Maschine zu dokumentieren.

1. Setzen Sie den Feldtyp auf **Bild**
2. Legen Sie **Max. Bilder** fest (1 bis 10, Standard 1). Mehr Fotos können Benutzer nicht hinzufügen.
3. Markieren Sie das Feld als **Pflichtfeld**, wenn mindestens ein Foto nötig ist

Im Web tippen Benutzer auf **Foto aufnehmen** (öffnet auf Smartphones die Kamera, am Computer die Dateiauswahl) oder **Hochladen**. Jedes Foto wird sofort hochgeladen und als Vorschaubild mit einer Schaltfläche zum Entfernen angezeigt. Solange ein Foto noch hochgeladen wird, lässt sich das Formular nicht absenden.

Auf einem [Attractap](attractap/using-the-reader.md)-Touchleser zeigt das Gerät einen QR-Code. Der Benutzer scannt ihn mit dem Smartphone, nimmt die Fotos dort auf oder lädt sie hoch, und das Lesegerät zeigt, wie viele Fotos angekommen sind („N von M Fotos“).

> [!NOTE]
> Der QR-Code führt zur **Anwendungs-URL** aus Ihren Einstellungen. Sie muss von den Smartphones Ihrer Benutzer erreichbar sein, sonst öffnet der Link nichts.

**Die Smartphone-Seite**

- Sie öffnet sich ohne Anmeldung. Wer den Link hat, kann Fotos zu diesem offenen Formular hinzufügen. Der Link ist deshalb kurzlebig: Er funktioniert 15 Minuten lang, endet, sobald das Formular am Lesegerät beendet ist (abgesendet, abgebrochen, abgemeldet oder ein anderer Benutzer meldet sich an), und nimmt keine weiteren Fotos mehr an, sobald die maximale Anzahl hochgeladen wurde (ein entferntes Foto schafft wieder Platz).
- Wer einen abgelaufenen Link öffnet, sieht den Hinweis, das Formular am Lesegerät erneut zu öffnen.
- Die Fotos werden Teil der Einreichung, sobald der Benutzer das Formular am Lesegerät absendet.

**Ältere Lesegeräte.** Lesegeräte, deren Firmware keine Fotofelder unterstützt, überspringen optionale **Bild**-Felder. Gilt ein erforderliches **Bild**-Feld, kann das Lesegerät das Formular nicht abschließen und weist darauf hin, es in der Web-App auszufüllen. Attractap-Lite-Lesegeräte (ohne Display) verhalten sich bei Formularen wie bisher.

**Wer die Fotos sieht.** Der Benutzer, der das Formular abgesendet hat, und Benutzer mit der Berechtigung **Ressourcen verwalten**, nur in der Web-App: als Vorschaubilder im Tab **Einreichungen** des Formulars und in der Nutzungshistorie, per Klick in voller Größe. Fotos haben keine öffentliche Adresse und gehören nicht zu den Daten von [Flows](flows/overview.md). Flows erhalten nur die Foto-IDs.

> [!WARNING]
> Fotos können Personen zeigen. Jedes Foto wird als JPEG neu kodiert, aufrecht gedreht, auf höchstens 2560 px an der langen Seite verkleinert, und **alle Metadaten, auch der GPS-Standort, werden entfernt**. Der Bildinhalt selbst bleibt erhalten.

**Speicher.** Fotos liegen auf dem Server im Speicherverzeichnis (`STORAGE_ROOT`, Unterordner `form-images`) und werden nicht öffentlich ausgeliefert. Ein Foto, das nie abgesendet wird, wird nach 24 Stunden gelöscht. Abgesendete Fotos bleiben so lange wie ihre Einreichung. Fotos brauchen Speicherplatz: Planen Sie die Kapazität und sichern Sie sie zusammen mit dem Speicher-Volume.

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

Der Tab **Einreichungen** eines Formulars listet alle Einreichungen, die neuesten zuerst, mit Datum, Benutzer, Ressource und Aktion. Klappen Sie eine Zeile auf, um die Antworten zu sehen. Fotos erscheinen als Vorschaubilder; ein Klick zeigt sie in voller Größe. Filtern Sie nach Ressource, um die Antworten an einer Ressource zu sehen. Unter **Einstellungen** → **Formulare** einer Ressource öffnet **Einreichungen** im Menü **⋮** der Formularzeile diese Liste bereits nach der Ressource gefiltert.

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
