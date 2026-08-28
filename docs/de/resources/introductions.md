# Einweisungen

Eine Einweisung ist eine Sicherheitsunterweisung, die einem Benutzer den Zugang zu einer Ressource gewährt. Bevor ein Benutzer eine Nutzungssitzung starten kann, muss er für die Ressource (oder eine Gruppe, die die Ressource enthält) eingewiesen sein.

## So funktionieren Einweisungen

Einweisungen folgen einem einfachen Modell:

- **Einweiser** sind vertrauenswürdige Benutzer, die anderen den Zugang gewähren oder entziehen können
- **Benutzer** erhalten eine Einweisung und können die Ressource anschließend nutzen

Ein Benutzer, der nicht eingewiesen wurde, kann keine Nutzungssitzung an der Ressource starten.

Einige Ressourcen können außerdem **beaufsichtigte Nutzung** erlauben oder erfordern. In einer beaufsichtigten Sitzung startet der Benutzer die Sitzung, während eine qualifizierte **Aufsicht** anwesend ist. Nur ein Einweiser für die Ressource, einschließlich eines Einweisers einer passenden Ressourcengruppe, darf die Aufsicht übernehmen. Beaufsichtigung ist hilfreich für Trainings, erste Versuche oder Ressourcen, bei denen eine zweite anwesende Person vorgeschrieben ist.

## Rollen

| Rolle | Berechtigungen |
|-------|---------------|
| **Benutzer** | Ressource nach erfolgter Einweisung nutzen |
| **Wartender** | Ressource nutzen und steuern sowie Wartungen verwalten — kann jedoch keine Einweisungen erteilen |
| **Einweiser** | Alles, was ein Wartender darf, plus Einweisungen für andere Benutzer erteilen und entziehen |
| **Ressourcenverwalter** | Alle oben genannten Rechte, plus Einweiser/Wartende verwalten und Ressourceneinstellungen anpassen |

Bei beaufsichtigten Sitzungen ist die Aufsicht ein Einweiser, der die Sitzung bestätigt und für die Beaufsichtigung verantwortlich bleibt. Ein Wartender oder Ressourcenverwalter darf nur beaufsichtigen, wenn er zusätzlich Einweiser ist.

> [!NOTE]
> **Einweiser vs. Wartender:** Beide können die Maschine bedienen und in den Wartungsmodus versetzen (oder daraus entfernen). Der Unterschied: Nur ein **Einweiser** kann anderen Benutzern Einweisungen erteilen. Verwende **Wartender** für Personen, die die Maschine warten, aber nicht über den Zugang anderer entscheiden sollen.

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

## Einweiser und Wartende verwalten

Ressourcenverwalter können Benutzer zur Einweiser- oder Wartenden-Rolle befördern:

1. Öffnen Sie die Detailseite der Ressource
2. Scrollen Sie zum Bereich **Personen & Berechtigungen**
3. Klicken Sie auf **Als Einweiser ernennen** (volle Rechte) oder **Als Wartenden ernennen** (nur Wartung und Maschinensteuerung)
4. Wählen Sie den Benutzer aus

Die Rolle jeder Person wird in der Spalte **Rolle** angezeigt, und Sie können die Liste nach Einweisern oder Wartenden filtern. Das Entziehen einer Rolle entfernt die Berechtigungen sofort.

## Gruppeneinweisungen

Statt Benutzer einzeln für jede Ressource einzuweisen, können Sie sie für eine [Ressourcengruppe](resources/resource-groups.md) einweisen. Eine Gruppeneinweisung gewährt Zugang zu **allen Ressourcen** in dieser Gruppe.

Das ist praktisch, wenn Sie mehrere ähnliche Ressourcen haben, zum Beispiel alle 3D-Drucker oder alle Lasercutter.

> [!NOTE]
> Wenn ein Benutzer über eine Gruppe eingewiesen ist, behält er den Zugang zu allen Ressourcen der Gruppe, bis die Gruppeneinweisung entzogen wird. Das Entfernen einer Ressource aus der Gruppe entzieht dem Benutzer ebenfalls den Zugang zu dieser Ressource (sofern der Zugang nur über die Gruppe erteilt wurde).

## Beaufsichtigungsmodus

Ressourcenverwalter können für jede Ressource festlegen, wie Einweisungen und Beaufsichtigung zusammenwirken:

| Modus | Bedeutung |
|-------|-----------|
| **Einweisung erforderlich** | Nur eingewiesene Benutzer dürfen eine Sitzung starten. Dies ist das Standardverhalten. |
| **Beaufsichtigung erlaubt** | Eingewiesene Benutzer dürfen selbst starten. Nicht eingewiesene Benutzer dürfen eine beaufsichtigte Sitzung starten, wenn eine Aufsicht anwesend ist. |
| **Beaufsichtigung erforderlich** | Jede Sitzung erfordert eine anwesende Aufsicht, auch für eingewiesene Benutzer. |

Beaufsichtigte Sitzungen werden im Nutzungsverlauf mit der Aufsicht gespeichert. Dadurch ist sichtbar, wer die Sitzung beaufsichtigt hat, und beaufsichtigte Trainings- oder Probenutzungen lassen sich von regulären selbstständigen Nutzungen unterscheiden.

## Automatische Einweisung

Eine Ressource kann automatisch eine Einweisung erteilen, nachdem ein Benutzer genügend beaufsichtigte Sitzungen abgeschlossen hat. Ressourcenverwalter konfigurieren:

- **Beaufsichtigte Sitzungen bis zur Einweisung**: die Anzahl abgeschlossener beaufsichtigter Sitzungen, nach der der Benutzer automatisch eingewiesen wird
- **Einweisung erteilen für**: ob die automatische Einweisung für diese Ressource oder für eine ausgewählte Ressourcengruppe gilt

Wenn das Ziel **diese Ressource** ist, zählen nur beaufsichtigte Sitzungen an dieser Ressource. Wenn das Ziel **eine Ressourcengruppe** ist, zählen beaufsichtigte Sitzungen über Ressourcen dieser Gruppe hinweg, und der Benutzer erhält beim Erreichen des Schwellenwerts eine Gruppeneinweisung.

Die automatische Einweisung kann deaktiviert werden, indem der Schwellenwert leer bleibt.

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
