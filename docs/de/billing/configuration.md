# Abrechnungskonfiguration

Sie koennen die Abrechnung fuer jede Ressource einzeln aktivieren und konfigurieren. Die Abrechnungseinstellungen befinden sich auf der Detailseite der Ressource.

## Abrechnung fuer eine Ressource einrichten

1. Navigieren Sie zur [Detailseite](resources/resource-details.md) der Ressource
2. Scrollen Sie zum Bereich **Abrechnung**
3. Konfigurieren Sie das Abrechnungsmodell (siehe unten)
4. Speichern Sie die Aenderungen

<!-- TODO: Screenshot der Abrechnungskonfiguration auf der Ressourcen-Detailseite -->

## Abrechnungsmodelle

Sie koennen eine oder beide der folgenden Optionen pro Ressource festlegen:

| Einstellung | Beschreibung |
|-------------|-------------|
| **Credits pro Nutzung** | Eine pauschale Anzahl von Credits, die pro Nutzungssitzung berechnet wird. Die Dauer spielt keine Rolle. |
| **Credits pro Minute** | Credits, die fuer jede Minute der Nutzung berechnet werden. Die Gesamtkosten haengen von der Sitzungsdauer ab. |

> [!TIP]
> Wenn Sie beide Werte festlegen, wird dem Benutzer die Pauschalgebuehr plus die zeitbasierte Gebuehr berechnet. Beispiel: 10 Credits pro Nutzung + 2 Credits pro Minute fuer eine 30-minuetige Sitzung = 10 + 60 = 70 Credits.

## Beispielkonfigurationen

| Anwendungsfall | Credits pro Nutzung | Credits pro Minute |
|----------------|--------------------:|-------------------:|
| Einfache Pauschalgebuehr (z.B. Werkstattzugang) | 50 | 0 |
| Nur zeitbasiert (z.B. 3D-Drucker) | 0 | 5 |
| Grundgebuehr + Zeit (z.B. Lasercutter) | 20 | 3 |

## Credit-Guthaben der Benutzer

Das aktuelle Credit-Guthaben jedes Benutzers wird auf dessen Kontoseite angezeigt. Administratoren mit der Berechtigung **Abrechnung verwalten** koennen die Guthaben aller Benutzer einsehen und anpassen.

> [!NOTE]
> Wenn fuer eine Ressource keine Abrechnungswerte konfiguriert sind (beide auf 0 gesetzt), werden fuer Nutzungssitzungen an dieser Ressource keine Credits berechnet.

## Erforderliche Berechtigung

Die Konfiguration der Abrechnungseinstellungen erfordert die Berechtigung **Abrechnung verwalten**. Siehe [Berechtigungen](user-management/permissions.md).

## Siehe auch

- [Abrechnung Ueberblick](billing/overview.md) -- Wie die Abrechnung funktioniert
- [Transaktionen](billing/transactions.md) -- Transaktionshistorie einsehen
- [Ressourcen-Detailseite](resources/resource-details.md) -- Ressourcenkonfiguration
- [Berechtigungen](user-management/permissions.md) -- Systemberechtigungen
