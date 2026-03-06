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
