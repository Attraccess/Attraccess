# CSV-Export

Administratoren können Ressourcen-Nutzungsdaten als CSV-Datei exportieren, um sie weiterzuverarbeiten, Berichte zu erstellen oder zu archivieren.

## Berechtigungen

Sie benötigen **Administrator**-Berechtigungen, um auf den CSV-Export zuzugreifen.

## Nutzungsdaten exportieren

1. Öffnen Sie die Seite **CSV-Export** über die Seitenleisten-Navigation
2. Konfigurieren Sie die Exportoptionen, falls verfügbar (z.B. Zeitraum, Ressourcenfilter)
3. Klicken Sie auf **Exportieren**
4. Die CSV-Datei wird auf Ihren Computer heruntergeladen

<!-- TODO: Screenshot der CSV-Export-Seite einfügen -->

## Inhalt der CSV-Datei

Die exportierte CSV-Datei enthält Nutzungssitzungsdaten, darunter:

| Spalte | Beschreibung |
|--------|-------------|
| **Ressource** | Name der Ressource |
| **Benutzer** | Name des Benutzers |
| **Startzeit** | Wann die Sitzung begonnen hat |
| **Endzeit** | Wann die Sitzung beendet wurde |
| **Dauer** | Länge der Sitzung |
| **Projekt** | Zugehöriges Projekt (falls vorhanden) |

> [!TIP]
> Sie können die CSV-Datei in Tabellenkalkulationsprogrammen wie Microsoft Excel, Google Sheets oder LibreOffice Calc zur weiteren Analyse öffnen.

## Siehe auch

- [Nutzungsverfolgung](resources/usage-tracking.md)
- [Ressourcen](resources/overview.md)
