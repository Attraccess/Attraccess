# Einweisungen

Eine Einweisung ist eine Sicherheitsunterweisung, die einem Benutzer den Zugang zu einer Ressource gewährt. Bevor ein Benutzer eine Nutzungssitzung starten kann, muss er für die Ressource (oder eine Gruppe, die die Ressource enthält) eingewiesen sein.

## So funktionieren Einweisungen

Einweisungen folgen einem einfachen Modell:

- **Einweiser** sind vertrauenswürdige Benutzer, die anderen den Zugang gewähren oder entziehen können
- **Benutzer** erhalten eine Einweisung und können die Ressource anschließend nutzen

Ein Benutzer, der nicht eingewiesen wurde, kann keine Nutzungssitzung an der Ressource starten.

## Rollen

| Rolle | Berechtigungen |
|-------|---------------|
| **Benutzer** | Ressource nach erfolgter Einweisung nutzen |
| **Einweiser** | Einweisungen für andere Benutzer erteilen und entziehen |
| **Ressourcenverwalter** | Alle oben genannten Rechte, plus Einweiser verwalten und Ressourceneinstellungen anpassen |

## Einweisung erteilen

Sie benötigen die Rolle **Einweiser** oder **Ressourcenverwalter** für die jeweilige Ressource.

1. Öffnen Sie die [Detailseite](resources/resource-details.md) der Ressource
2. Scrollen Sie zum Bereich **Einweisungen**
3. Klicken Sie auf **Einweisung hinzufügen**
4. Suchen Sie den Benutzer und wählen Sie ihn aus
5. Fügen Sie optional einen Kommentar hinzu (z.B. "Sicherheitsschulung am 15.01.2025 abgeschlossen")
6. Bestätigen Sie

<!-- TODO: Screenshot einer Einweisungserteilung einfügen -->

## Einweisung entziehen

1. Öffnen Sie die Detailseite der Ressource
2. Scrollen Sie zum Bereich **Einweisungen**
3. Finden Sie den Benutzer in der Liste
4. Klicken Sie auf **Entziehen**
5. Fügen Sie optional einen Kommentar mit der Begründung hinzu
6. Bestätigen Sie

> [!WARNING]
> Das Entziehen einer Einweisung entzieht dem Benutzer sofort die Möglichkeit, neue Sitzungen an der Ressource zu starten. Falls der Benutzer gerade eine aktive Sitzung hat, wird diese nicht unterbrochen.

## Einweiser verwalten

Ressourcenverwalter können Benutzer zur Einweiser-Rolle befördern:

1. Öffnen Sie die Detailseite der Ressource
2. Scrollen Sie zum Bereich **Einweiser**
3. Klicken Sie auf **Einweiser hinzufügen**
4. Wählen Sie den Benutzer aus

## Gruppeneinweisungen

Statt Benutzer einzeln für jede Ressource einzuweisen, können Sie sie für eine [Ressourcengruppe](resources/resource-groups.md) einweisen. Eine Gruppeneinweisung gewährt Zugang zu **allen Ressourcen** in dieser Gruppe.

Das ist praktisch, wenn Sie mehrere ähnliche Ressourcen haben, zum Beispiel alle 3D-Drucker oder alle Lasercutter.

> [!NOTE]
> Wenn ein Benutzer über eine Gruppe eingewiesen ist, behält er den Zugang zu allen Ressourcen der Gruppe, bis die Gruppeneinweisung entzogen wird. Das Entfernen einer Ressource aus der Gruppe entzieht dem Benutzer ebenfalls den Zugang zu dieser Ressource (sofern der Zugang nur über die Gruppe erteilt wurde).

## Protokoll (Audit Trail)

Jede Einweisungsänderung wird protokolliert mit:

| Feld | Beschreibung |
|------|-------------|
| **Zeitstempel** | Wann die Aktion stattfand |
| **Benutzer** | Wer die Aktion durchgeführt hat |
| **Aktion** | Erteilung oder Entzug |
| **Kommentar** | Optionale Begründung oder Notiz |

Dieses Protokoll ist auf der Detailseite der Ressource einsehbar und ermöglicht die Nachverfolgung, wer wann Zugang erteilt oder entzogen hat.

## Siehe auch

- [Detailseite](resources/resource-details.md)
- [Ressourcengruppen](resources/resource-groups.md)
- [Nutzungsverfolgung](resources/usage-tracking.md)
