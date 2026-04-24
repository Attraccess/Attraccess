# Formulare

Mit Formularen können Sie Informationen von Benutzern erfassen, wenn diese mit einer Ressource interagieren. Jedes Formular ist an eine bestimmte Ressource gebunden und kann zu verschiedenen Zeitpunkten während einer Nutzungssitzung angezeigt werden.

## Was sind Formulare?

Ein Formular ist eine Sammlung von Feldern, die Benutzer während der Ressourcennutzung ausfüllen. Zum Beispiel möchten Sie vielleicht Folgendes erfassen:

- Das Material, das auf einem Lasercutter verwendet wird
- Das Gewicht des verbrauchten Filaments auf einem 3D-Drucker
- Eine Projektreferenz für Abrechnungszwecke

## Wann werden Formulare angezeigt?

Jedes Formular wird so konfiguriert, dass es zu einem bestimmten Zeitpunkt im Nutzungszyklus erscheint:

| Auslöser | Wann es erscheint |
|----------|-------------------|
| **Sitzungsbeginn** | Wenn ein Benutzer die Nutzung der Ressource startet |
| **Sitzungsübernahme** | Wenn ein Benutzer eine aktive Sitzung eines anderen Benutzers übernimmt |
| **Sitzungsende** | Wenn ein Benutzer seine Nutzungssitzung beendet |

> [!TIP]
> Verwenden Sie **Sitzungsende**-Formulare, um Daten zu erfassen, die erst nach der Nutzung bekannt sind, wie Materialverbrauch oder Druckergebnisse.

## Feldtypen

Formulare unterstützen die folgenden Feldtypen:

| Typ | Beschreibung | Beispiel |
|-----|-------------|---------|
| **Text** | Freitexteingabe | Materialname, Anmerkungen |
| **Zahl** | Numerische Eingabe | Dauer, Gewicht, Menge |
| **Boolean** | Checkbox (Ja/Nein) | "Arbeitsplatz aufgeräumt?", "Sicherheitscheck durchgeführt?", "Ich akzeptiere die AGB" |
| **Auswahl** | Dropdown mit vordefinierten Optionen | Materialtyp, Projektauswahl |

> [!TIP]
> Ein **Boolean**-Feld, das als **Pflichtfeld** markiert ist, muss auf **Ja** (aktiviert) gesetzt werden, bevor das Formular abgesendet werden kann. Dies eignet sich ideal dazu, Benutzer zum Akzeptieren der AGB oder zur Bestätigung von Sicherheitshinweisen zu zwingen. Details siehe [Formulare erstellen](forms/creating-forms.md).

## Formulareinreichungen

Alle Formulareinreichungen werden automatisch mit der zugehörigen Nutzungssitzung verknüpft. Administratoren können die eingereichten Daten in der Nutzungshistorie der Ressource einsehen.

<!-- TODO: Screenshot einer Formulareinreichung in der Nutzungshistorie -->

> [!NOTE]
> Formulardaten können auch von [Flows](flows/overview.md) verwendet werden. So können Sie Automatisierungen erstellen, die auf Benutzereingaben reagieren -- zum Beispiel Abrechnungsposten basierend auf dem ausgewählten Material setzen.

## Siehe auch

- [Formulare erstellen](forms/creating-forms.md) -- Formulare erstellen und konfigurieren
- [Nutzungsverfolgung](resources/usage-tracking.md) -- Formulareinreichungen anzeigen
- [Flows-Überblick](flows/overview.md) -- Automatisierung mit Formulardaten
- [Abrechnung](billing/overview.md) -- Formulare zur Kostenerfassung nutzen
