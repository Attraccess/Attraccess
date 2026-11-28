# Abrechnungskonfiguration

<!-- llms-description: So aktivieren Sie die Abrechnung pro Ressource, wählen Abrechnungsmodelle, rechnen Zählerverbrauch ab und verwalten Credit-Guthaben. -->

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
| **Preis pro Messwert**         | Optionaler Preis für jeden benannten Zähler. Standardwert ist null.                                                               |

> [!TIP]
> Die Gebühren werden addiert. Beispiel: 10 Credits pro Nutzung + 2 Credits pro Sitzungsminute für eine 30-minütige Sitzung + 3 Credits pro Betriebsminute für 10 Minuten Maschinenbetrieb = 10 + 60 + 30 = 100 Credits, vor Anwendung des Abrechnungsfaktors des Benutzers.

Sitzungsdauer und Betriebsdauer werden unabhängig voneinander auf volle Minuten aufgerundet. Genau eine Minute bleibt eine abgerechnete Minute; eine aufgezeichnete Dauer von null bleibt null. Für die Betriebsdauer sind aufgezeichnete Betriebszustände aus [Flows](flows/node-types.md) erforderlich. Der Start einer Sitzung allein belegt keinen Maschinenbetrieb.

Pauschale, beide zeitabhängigen Tarife und der Abrechnungsfaktor des Benutzers werden beim Sitzungsstart gespeichert. Spätere Konfigurationsänderungen gelten für neue Sitzungen. Der gespeicherte Faktor wird auf die Summe aller Sitzungsposten angewendet, einschließlich zusätzlicher Abrechnungsposten aus Flows. Bei einer übernommenen Sitzung stammen Posten, die Sie sonst beim Beenden ergänzen, aus dem Flow [Nutzung übernommen](flows/node-types.md#nutzung-übernommen), weil **Nutzung beendet** nicht läuft.

## Abrechnung beim Projektwechsel

Die Person, der eine laufende Sitzung gehört, kann [ihr Projekt wechseln](resources/usage-tracking.md#das-projekt-einer-laufenden-sitzung-wechseln). Jeder Abschnitt wird auf einer eigenen Transaktion desselben Benutzers abgerechnet; „einem Projekt berechnet“ bedeutet, dass er in Nutzungsstatistik, Historie und Exporten dieses Projekts erscheint. **Abrechnung beim Projektwechsel** in den Abrechnungseinstellungen der Ressource legt fest, wie:

| Option                              | Gebühr pro Nutzung              | Rundung von Sitzungs- und Betriebsminuten                                    | Guthabenprüfung beim Wechsel |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- | ---------------------------- |
| **Sitzung fortsetzen** (Standard)   | Nur einmal, im ersten Abschnitt | Fortlaufend ab dem ersten Start der Sitzung                                  | Nein                         |
| **Fortsetzen, je Abschnitt runden** | Nur einmal, im ersten Abschnitt | Jeder Abschnitt rundet selbst auf: bis zu eine zusätzliche Minute je Wechsel | Nein                         |
| **Als neue Sitzung abrechnen**      | In jedem Abschnitt              | Jeder Abschnitt rundet selbst auf                                            | Ja, wie beim Start           |

Bei **Sitzung fortsetzen** sind die berechneten Minuten eines Abschnitts die angefangenen Minuten vom ersten Start der Sitzung bis zum Ende des Abschnitts abzüglich derer bis zu seinem Beginn. Alle Abschnitte zusammen kosten daher so viele Zeit-Credits wie eine Sitzung ohne Wechsel; auch der Abrechnungsfaktor wird auf die laufende Summe gerundet. Beispiel mit 10 Credits pro Nutzung und 2 Credits pro Minute: Ein Wechsel nach 2,5 Minuten einer 4-minütigen Sitzung berechnet 10 + 3 × 2 für den ersten und 1 × 2 für den zweiten Abschnitt: 18 Credits, genau wie ohne Wechsel. Für aufgezeichnete Betriebsminuten gilt dieselbe Regel.

Preise und Abrechnungsfaktor bleiben die beim Sitzungsstart gespeicherten; die geltende Option wird mit jedem Wechsel gespeichert. Zählerverbrauch und von Flows ergänzte Posten werden in dem Abschnitt berechnet, in dem sie anfallen; jeder Zähleranteil wird je Abschnitt auf ganze Credits gerundet, wie bei zwei Sitzungen, und auf [gemeinsam genutzten Maschinen](#gemeinsam-genutzte-maschinen) werden Anteile einmal pro Zeitsegment gerundet, ein Wechsel fügt also eine Segmentgrenze hinzu. Ein Abschnitt ohne Kosten hinterlässt keine Transaktion.

### Was die Benutzer sehen

- **Beim Wechsel** zeigt die Web-App **Projekt gewechselt** mit den Kosten des beendeten Abschnitts und sagt, dass die Sitzung weiterlief. Bei einem Abschnitt ohne Kosten erscheint nichts.
- **Während die Sitzung läuft**, bezieht sich die Abrechnungsansicht **Laufende Sitzung** einer Fortsetzung nur auf den Abschnitt seit dem letzten Wechsel: **Zeit seit dem Projektwechsel** und **Voraussichtliche Kosten seit dem Wechsel**. Die Schätzung folgt der Option oben, enthält also keine Gebühr pro Nutzung und keine angefangene Minute, die ein früherer Abschnitt schon bezahlt hat. Außer der Person, der die Sitzung gehört, erhalten nur Abrechnungs- und Ressourcenverwaltende diese Schätzung.
- **Wenn die Sitzung endet**, zeigt die **Abrechnung deiner Sitzung**, was alle Abschnitte zusammen gekostet haben, auch wenn der letzte Abschnitt nichts gekostet hat.
- **Belege per E-Mail** werden für jeden kostenpflichtigen Abschnitt verschickt, wie für eine eigene Sitzung, mit den Zeiten und dem Betrag dieses Abschnitts.

## Zählerverbrauch

Jeder benannte Zähler kann in den Abrechnungseinstellungen einen Preis pro Messwert erhalten. Mehrere Zähler können gemeinsam abgerechnet werden. Namen und Preise werden beim Sitzungsstart gespeichert. Nur Sitzungsverbrauch wird berechnet; Leerlaufverbrauch erhöht den Gesamtverbrauch. Ein Preis von null deaktiviert nur die Abrechnung.

### Gemeinsam genutzte Maschinen

Bei Maschinen mit mehreren parallelen Sitzungen hat jeder Zähler in seinen Zählereinstellungen die Einstellung **Zuordnung**:

- **Geteilt und aufgeteilt** (Standard): Der Verbrauch des Zählers wird zu gleichen Teilen auf die gleichzeitig aktiven Personen verteilt. Anteile werden exakt geführt und einmal pro Zeitsegment auf ganze Credits gerundet, sodass die berechneten Anteile immer die Segmentsumme ergeben.
- **Pro Sitzung gemessen**: Jede Sitzung erhält ihren eigenen Messpunkt und wird eigenständig abgerechnet.

Der Modus wird beim Sitzungsstart gespeichert; Änderungen werden im Audit-Log protokolliert. Die Betriebszeit wird unabhängig von dieser Einstellung immer auf dieselbe Weise auf die gleichzeitig aktiven Personen aufgeteilt. Nutzungsgebühr und Sitzungszeit werden nie aufgeteilt. Ein kostenpflichtiger Zähler, der sich nicht bei Bedarf lesen lässt (nur Zuwächse), kann immer nur von einer Sitzung gleichzeitig genutzt werden, sofern er nicht auf **Pro Sitzung gemessen** steht. Siehe [Zähler bei gemeinsam genutzten Maschinen](flows/energy-metering.md#zähler-bei-gemeinsam-genutzten-maschinen) für Segmente, Rundung, fehlgeschlagene Messungen und Beispiele.

Siehe [Zähler und verbrauchsbasierte Abrechnung](flows/energy-metering.md) für Einrichtung, Meldemodi, Migration und Abrechnung.

## Beispielkonfigurationen

| Anwendungsfall                                  | Credits pro Nutzung | Credits pro Minute |
| ----------------------------------------------- | ------------------: | -----------------: |
| Einfache Pauschalgebuehr (z.B. Werkstattzugang) |                  50 |                  0 |
| Nur zeitbasiert (z.B. 3D-Drucker)               |                   0 |                  5 |
| Grundgebuehr + Zeit (z.B. Lasercutter)          |                  20 |                  3 |

## Credit-Guthaben der Benutzer

Das aktuelle Credit-Guthaben jedes Benutzers wird auf dessen Kontoseite angezeigt. Administratoren mit der Berechtigung **Abrechnung verwalten** koennen die Guthaben aller Benutzer einsehen und anpassen.

> [!NOTE]
> Sind alle Tarife auf null gesetzt, fallen keine automatischen Nutzungsgebühren an. Flows können weiterhin zusätzliche Abrechnungsposten hinzufügen.

## Erforderliche Berechtigung

Die Konfiguration der Abrechnungseinstellungen erfordert die Berechtigung **Abrechnung verwalten**. Siehe [Berechtigungen](user-management/permissions.md).

## Siehe auch

- [Abrechnung Ueberblick](billing/overview.md) -- Wie die Abrechnung funktioniert
- [Zähler](flows/energy-metering.md) -- Zählereinrichtung und Verbrauchsabrechnung
- [Transaktionen](billing/transactions.md) -- Transaktionshistorie einsehen
- [Ressourcen-Detailseite](resources/resource-details.md) -- Ressourcenkonfiguration
- [Berechtigungen](user-management/permissions.md) -- Systemberechtigungen
