# Abrechnungskonfiguration

Sie koennen die Abrechnung fuer jede Ressource einzeln aktivieren und konfigurieren. Die Abrechnungseinstellungen befinden sich auf der Detailseite der Ressource.

## Abrechnung fuer eine Ressource einrichten

1. Navigieren Sie zur [Detailseite](resources/resource-details.md) der Ressource
2. Scrollen Sie zum Bereich **Abrechnung**
3. Konfigurieren Sie das Abrechnungsmodell (siehe unten)
4. Speichern Sie die Aenderungen

<!-- TODO: Screenshot der Abrechnungskonfiguration auf der Ressourcen-Detailseite -->

## Abrechnungsmodelle

Sie können die folgenden Optionen pro Ressource kombinieren:

| Einstellung                    | Beschreibung                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Credits pro Nutzung**        | Eine pauschale Anzahl von Credits, die pro Nutzungssitzung berechnet wird. Die Dauer spielt keine Rolle.                          |
| **Credits pro Minute**         | Credits für jede angefangene Minute der Nutzungssitzung.                                                                          |
| **Credits pro Betriebsminute** | Credits für jede angefangene Minute des aufgezeichneten Maschinenbetriebs, die der Sitzung zugeordnet ist. Standardwert ist null. |

> [!TIP]
> Die Gebühren werden addiert. Beispiel: 10 Credits pro Nutzung + 2 Credits pro Sitzungsminute für eine 30-minütige Sitzung + 3 Credits pro Betriebsminute für 10 Minuten Maschinenbetrieb = 10 + 60 + 30 = 100 Credits, vor Anwendung des Abrechnungsfaktors des Benutzers.

Sitzungsdauer und Betriebsdauer werden unabhängig voneinander auf volle Minuten aufgerundet. Genau eine Minute bleibt eine abgerechnete Minute; eine aufgezeichnete Dauer von null bleibt null. Für die Betriebsdauer sind aufgezeichnete Betriebszustände aus [Flows](flows/node-types.md) erforderlich. Der Start einer Sitzung allein belegt keinen Maschinenbetrieb.

Pauschale, beide zeitabhängigen Tarife und der Abrechnungsfaktor des Benutzers werden beim Sitzungsstart gespeichert. Spätere Konfigurationsänderungen gelten für neue Sitzungen. Der gespeicherte Faktor wird auf die Summe aller Sitzungsposten angewendet, einschließlich zusätzlicher Abrechnungsposten aus Flows.

## Beispielkonfigurationen

| Anwendungsfall                                  | Credits pro Nutzung | Credits pro Minute |
| ----------------------------------------------- | ------------------: | -----------------: |
| Einfache Pauschalgebuehr (z.B. Werkstattzugang) |                  50 |                  0 |
| Nur zeitbasiert (z.B. 3D-Drucker)               |                   0 |                  5 |
| Grundgebuehr + Zeit (z.B. Lasercutter)          |                  20 |                  3 |

## Credit-Guthaben der Benutzer

Das aktuelle Credit-Guthaben jedes Benutzers wird auf dessen Kontoseite angezeigt. Administratoren mit der Berechtigung **Abrechnung verwalten** koennen die Guthaben aller Benutzer einsehen und anpassen.

> [!NOTE]
> Sind alle drei Tarife auf null gesetzt, fallen keine automatischen Nutzungsgebühren an. Flows können weiterhin zusätzliche Abrechnungsposten hinzufügen.

## Erforderliche Berechtigung

Die Konfiguration der Abrechnungseinstellungen erfordert die Berechtigung **Abrechnung verwalten**. Siehe [Berechtigungen](user-management/permissions.md).

## Siehe auch

- [Abrechnung Ueberblick](billing/overview.md) -- Wie die Abrechnung funktioniert
- [Transaktionen](billing/transactions.md) -- Transaktionshistorie einsehen
- [Ressourcen-Detailseite](resources/resource-details.md) -- Ressourcenkonfiguration
- [Berechtigungen](user-management/permissions.md) -- Systemberechtigungen
