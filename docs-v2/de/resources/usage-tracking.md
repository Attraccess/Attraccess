# Nutzungsverfolgung

Attraccess erfasst, wer welche Ressource wann nutzt. Jede Nutzungssitzung wird aufgezeichnet und ist in der Nutzungshistorie der Ressource einsehbar.

## Was ist eine Nutzungssitzung?

Eine Nutzungssitzung stellt einen einzelnen Nutzungszeitraum einer Ressource dar. Sie wird erstellt, wenn ein Benutzer die Nutzung startet, und abgeschlossen, wenn er sie beendet.

Jede Sitzung enthält:

| Feld | Beschreibung |
|------|-------------|
| **Benutzer** | Wer die Ressource genutzt hat |
| **Startzeit** | Wann die Sitzung begonnen hat |
| **Endzeit** | Wann die Sitzung beendet wurde |
| **Dauer** | Wie lange die Ressource genutzt wurde |
| **Notizen** | Optionale Notizen zur Sitzung |
| **Projekt** | Optionales zugehöriges Projekt |

## Sitzung starten

1. Öffnen Sie die [Detailseite](resources/resource-details.md) der Ressource
2. Klicken Sie auf **Sitzung starten**
3. Je nach Konfiguration der Ressource müssen Sie möglicherweise ein [Formular](forms/overview.md) ausfüllen

> [!NOTE]
> Sie müssen für die Ressource (oder eine Gruppe, die sie enthält) [eingewiesen](resources/introductions.md) sein, bevor Sie eine Sitzung starten können.

<!-- TODO: Screenshot des Sitzungsstarts einfügen -->

## Sitzung beenden

1. Öffnen Sie die Detailseite der Ressource
2. Klicken Sie auf **Sitzung beenden**
3. Je nach Konfiguration der Ressource müssen Sie möglicherweise ein Formular ausfüllen

## Sitzungen mit Projekten verknüpfen

Wenn Sie aktive [Projekte](projects/overview.md) haben, können Sie eine Nutzungssitzung mit einem Projekt verknüpfen. So lässt sich nachverfolgen, welche Ressourcen für welche Projekte verwendet werden.

Die Projektzuordnung wird beim Starten der Sitzung festgelegt.

## Nutzungshistorie

Die Nutzungshistorie wird auf der [Detailseite](resources/resource-details.md) der Ressource in chronologischer Reihenfolge angezeigt. Sie zeigt alle vergangenen und aktuellen Sitzungen.

<!-- TODO: Screenshot der Nutzungshistorie einfügen -->

Ressourcenverwalter und Administratoren können Sitzungen aller Benutzer einsehen. Reguläre Benutzer sehen ebenfalls die vollständige Historie.

## Siehe auch

- [Detailseite](resources/resource-details.md)
- [Einweisungen](resources/introductions.md)
- [CSV-Export](resources/csv-export.md)
- [Projekte](projects/overview.md)
- [Formulare](forms/overview.md)
