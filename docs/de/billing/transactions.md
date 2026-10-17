# Abrechnungstransaktionen

Das Abrechnungs-Dashboard zeigt alle Credit-Transaktionen im gesamten System. Verwenden Sie es, um Belastungen zu verfolgen, Nutzungskosten von Ressourcen zu ueberwachen und die Aktivitaet einzelner Benutzer zu ueberpruefen.

## Transaktionen anzeigen

1. Klicken Sie auf **Abrechnung** in der Seitenleiste
2. Die Transaktionsliste wird in chronologischer Reihenfolge angezeigt (neueste zuerst)

<!-- TODO: Screenshot des Abrechnungs-Dashboards -->

## Transaktionsdetails

Jede Transaktion enthaelt folgende Informationen:

| Feld            | Beschreibung                               |
| --------------- | ------------------------------------------ |
| **Benutzer**    | Der Benutzer, dem Credits berechnet wurden |
| **Ressource**   | Die genutzte Ressource                     |
| **Credits**     | Anzahl der berechneten Credits             |
| **Zeitstempel** | Wann die Transaktion stattfand             |

Für neue Nutzungssitzungen speichern abgeschlossene zeitabhängige Abrechnungsposten die gemessene Dauer, die aufgerundeten Minuten und den beim Sitzungsstart gespeicherten Tarif. Spätere Änderungen an Preisen, Abrechnungsfaktoren oder Betriebsverläufen berechnen abgeschlossene Transaktionen nicht neu.

Bei einer Gesamtsumme ungleich null zeigt der Standardbeleg per E-Mail getrennte Berechnungen für Sitzungs- und Betriebsdauer sowie den gespeicherten Abrechnungsfaktor. Bei einer Gesamtsumme von null wird keine Abrechnungs-E-Mail versendet. Angepasste E-Mail-Vorlagen bleiben beim Aktualisieren des Standardbelegs erhalten; Administratoren können die Vorlage auf den Standard zurücksetzen, um das neue Layout zu übernehmen. Historische Transaktionen werden nicht umgeschrieben.

## Transaktionen filtern

Sie koennen die Transaktionsliste filtern, um bestimmte Eintraege zu finden:

- Filtern Sie nach **Benutzer**, um die Belastungen einer bestimmten Person einzusehen
- Filtern Sie nach **Ressource**, um zu sehen, wie stark eine Ressource genutzt wurde
- Filtern Sie nach **Zeitraum**, um einen bestimmten Zeitabschnitt zu ueberpruefen

> [!TIP]
> Verwenden Sie die Transaktionsliste, um zu ueberpruefen, ob die Abrechnung fuer Ihre Ressourcen korrekt konfiguriert ist. Starten Sie eine Testsitzung und pruefen Sie, ob die erwarteten Credits berechnet wurden.

## Erforderliche Berechtigung

Das Einsehen aller Transaktionen erfordert die Berechtigung **Abrechnung verwalten**. Regulaere Benutzer koennen ihre eigene Transaktionshistorie auf ihrer Kontoseite einsehen.

## Siehe auch

- [Abrechnung Ueberblick](billing/overview.md) -- Wie die Abrechnung funktioniert
- [Abrechnungskonfiguration](billing/configuration.md) -- Abrechnung fuer Ressourcen einrichten
- [Nutzungsverfolgung](resources/usage-tracking.md) -- Sitzungsverfolgung
- [Berechtigungen](user-management/permissions.md) -- Systemberechtigungen
