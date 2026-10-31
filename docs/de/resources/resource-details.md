# Detailseite

Die Detailseite einer Ressource zeigt alle Informationen und Verwaltungsfunktionen an einem Ort.

## Aufbau

<!-- TODO: Screenshot der Detailseite einfügen -->

### Kopfbereich

- **Ressourcenbild** und **Name**
- **Beschreibung** der Ressource
- **Aktionsleiste** (für Berechtigte):
  - Dokumentation anzeigen/bearbeiten
  - QR-Code erzeugen
  - Flows verwalten
  - Formulare verwalten
  - Ressource bearbeiten/löschen

### Nutzungssitzung

Wenn Sie für die Ressource eingewiesen sind, können Sie hier:

- **Sitzung starten** – Ressourcennutzung beginnen
- **Sitzung beenden** – Nutzung abschließen
- **Sitzung übernehmen** – Laufende Sitzung eines anderen Benutzers übernehmen (wenn erlaubt)

Je nach Konfiguration müssen Sie beim Starten, Übernehmen oder Beenden ein [Formular](forms/overview.md) ausfüllen.

#### Maschinen mit parallelen Sitzungen

Erlaubt die Maschine mehr als eine [parallele Sitzung](resources/creating-resources.md#max-parallele-sitzungen), zeigt der Nutzungsbereich:

- **Ihre eigene Sitzung** mit einer Schaltfläche **Stop**
- **Weitere aktive Sitzungen** als Liste mit Benutzer, Startzeit und gegebenenfalls Aufsicht. Ressourcenverwalter, Wartende, Einweiser und die Aufsicht einer Sitzung sehen bei jedem Eintrag eine Schaltfläche **Sitzung beenden**, um die Sitzung dieser Person zu beenden
- **Startelemente**, solange Plätze frei sind und Sie noch keine Sitzung haben
- **Voll (N/N)**, wenn alle Plätze belegt sind

Jede Person startet und beendet ihre eigene Sitzung. Beenden ohne Auswahl eines Eintrags aus der Liste beendet immer Ihre eigene Sitzung. Wartung und Zustand blockieren nur neue Starts; laufende Sitzungen laufen weiter und können normal beendet werden. Die Ansicht aktualisiert sich live, ohne neu zu laden.

> [!WARNING]
> Bei Maschinen mit parallelen Sitzungen laufen Flows bei jedem Sitzungsstart und -ende, und Zähler sowie Laufzeit werden nur einer einzigen Sitzung berechnet. Siehe [Gemeinsam genutzte Maschinen](resources/usage-tracking.md#gemeinsam-genutzte-maschinen-parallele-sitzungen).

### Nutzungshistorie

Chronologische Liste aller Nutzungssitzungen mit:
- Benutzer
- Start- und Endzeit
- Dauer
- Notizen
- Zugehöriges Projekt

### Weitere Bereiche (für Berechtigte)

| Bereich | Berechtigung | Beschreibung |
|---------|-------------|-------------|
| **Einweisungen** | Einweiser oder Ressourcenverwalter | [Einweisungen](resources/introductions.md) verwalten |
| **Einweiser** | Ressourcenverwalter | Einweiserrechte vergeben |
| **Wartung** | Ressourcenverwalter | [Wartungen](resources/maintenance.md) verwalten |
| **Wartungspläne** | Ressourcenverwalter | Automatische Wartungsauslöser |
| **Gruppen** | Ressourcenverwalter | [Gruppenzugehörigkeit](resources/resource-groups.md) |

## Siehe auch

- [Ressourcen erstellen](resources/creating-resources.md)
- [Einweisungen](resources/introductions.md)
- [Flows](flows/overview.md)
- [Formulare](forms/overview.md)
