# Abrechnung

Attraccess verfuegt ueber ein Abrechnungssystem, mit dem Sie die Nutzung von Ressourcen berechnen koennen. Credits werden automatisch vom Konto der Benutzer abgezogen, wenn diese Ressourcen verwenden.

## Wie die Abrechnung funktioniert

Das Abrechnungssystem basiert auf **Credits**. Jeder Benutzer hat ein Credit-Guthaben. Wenn ein Benutzer eine Nutzungssitzung an einer Ressource mit aktivierter Abrechnung beendet, werden Credits automatisch von seinem Guthaben abgezogen.

Es gibt zwei Abrechnungsmodelle:

| Abrechnungsmodell | Funktionsweise |
|-------------------|---------------|
| **Pro Nutzung** | Ein Pauschalbetrag wird pro Nutzungssitzung berechnet, unabhaengig von der Dauer. |
| **Pro Minute** | Credits werden basierend auf der Nutzungsdauer der Ressource berechnet. |

Sie koennen beide Modelle fuer dieselbe Ressource konfigurieren. In diesem Fall wird dem Benutzer die Pauschalgebuehr **plus** die zeitbasierte Gebuehr berechnet.

## Credit-System

- Jeder Benutzer hat ein **Credit-Guthaben**, das in seinem Konto angezeigt wird
- Credits werden automatisch abgezogen, wenn eine Nutzungssitzung endet
- Wenn ein Benutzer nicht genuegend Credits hat, kann die Sitzung dennoch aufgezeichnet werden (je nach Konfiguration)
- Administratoren koennen Credit-Guthaben manuell anpassen

<!-- TODO: Screenshot des Benutzer-Credit-Guthabens -->

## Zahlungsintegration

Attraccess unterstuetzt **SumUp** als Zahlungsanbieter. Wenn SumUp konfiguriert ist, koennen Benutzer Credits ueber die Anwendung kaufen.

> [!NOTE]
> Die SumUp-Integration erfordert, dass die Umgebungsvariable `ATTRACCESS_PUBLIC_INTERNET_URL` gesetzt ist, falls sich Ihre oeffentliche URL von der internen `ATTRACCESS_URL` unterscheidet. Siehe [Umgebungsvariablen](installation/environment-variables.md).

## Erforderliche Berechtigung

Um die Abrechnung zu konfigurieren und alle Transaktionen einzusehen, benoetigt ein Benutzer die Berechtigung **Abrechnung verwalten**. Siehe [Berechtigungen](user-management/permissions.md) fuer Details.

> [!TIP]
> Regulaere Benutzer koennen ihr eigenes Credit-Guthaben und ihre Transaktionshistorie jederzeit einsehen, auch ohne die Berechtigung "Abrechnung verwalten".

## Siehe auch

- [Abrechnungskonfiguration](billing/configuration.md) -- Abrechnung fuer Ressourcen einrichten
- [Transaktionen](billing/transactions.md) -- Abrechnungshistorie einsehen
- [Nutzungsverfolgung](resources/usage-tracking.md) -- Wie Sitzungen erfasst werden
- [Berechtigungen](user-management/permissions.md) -- Systemberechtigungen
