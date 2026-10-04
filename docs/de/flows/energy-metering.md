# Zähler und verbrauchsbasierte Abrechnung

Jede Ressource kann mehrere benannte Zähler haben. Ein Zähler kann beliebige Werte erfassen: Strom, Wasser, Material, Herzschläge oder andere Messwerte. Attraccess speichert keine Einheit und rechnet neue Messwerte nicht um.

## Zähler erstellen und auswählen

Unter **Zähler → Zähler erstellen** in der Ressourcenübersicht reicht ein Name. Jeder Mess-Knoten im Flow muss einen Zähler dieser Ressource auswählen. Auch im Knoten-Editor gibt es die Schaltfläche **Zähler erstellen**.

Die Übersicht zeigt den **Gesamtverbrauch**, einschließlich Messungen außerhalb von Sitzungen, sowie den Verbrauch der **aktuellen Sitzung**. Die laufende Abrechnung zeigt die einzelnen Zähler und ihre bisherigen Kosten.

## Werte melden

**Zähler melden** akzeptiert eine Zahl oder eine Handlebars-Vorlage wie `{{reading.value}}`:

- **total**: kumulativer Zählerstand. Die erste Messung außerhalb einer Sitzung legt die Basis fest. Spätere Zuwächse erhöhen den Gesamtverbrauch. Wiederholte identische Werte werden nicht doppelt gezählt; sinkende Werte werden abgelehnt.
- **increment**: diesen Betrag hinzufügen. Jede neue Flow-Ausführung erhöht den Gesamtverbrauch und während einer Sitzung auch deren Verbrauch. Die Wiederholung desselben Knotens innerhalb einer Flow-Ausführung zählt den Betrag nicht erneut.

Beide Modi funktionieren auch in gewöhnlichen MQTT- oder Schaltflächen-Flows ohne laufende Sitzung. Dieselbe Verbrauchsmenge darf nicht als Zählerstand und zusätzlich als Zuwachs gemeldet werden.

Werte müssen nichtnegative Dezimalzahlen sein. Die Berechnung erfolgt exakt mit neun Nachkommastellen. **Gemessen am** kann den ISO-Zeitstempel der Quelle enthalten. Ungültige, veraltete oder zukünftige Messungen und sinkende Zählerstände werden abgelehnt, nicht als null gewertet.

## Sitzungsgrenzen für kumulative Zähler

Für eine genaue Zuordnung und Abrechnung benötigt jeder kumulative Zähler diese Zweige:

```
Messung starten → Zähler lesen oder zurücksetzen → Messung bereit
Messwert abfragen → Zähler lesen → Zähler melden
```

In allen vier Knoten denselben Zähler auswählen. Bei einem Gesamtzähler muss **Messung bereit** den aktuellen **Basiswert** erhalten. Nur wenn der Start-Zweig den physischen Zähler auf null zurücksetzt, bleibt der Basiswert leer. Ein neuer Basiswert nach einem physischen Reset erhält den bereits erfassten Gesamtverbrauch.

**Messwert abfragen** läuft regelmäßig, auch außerhalb von Sitzungen, und liest beim Sitzungsende den finalen Wert. Das Intervall `0` deaktiviert regelmäßige Abfragen. Zeitlimit, finale Versuche und Wiederholungsverzögerung steuern Fehlerfälle.

Ein Zähler mit ausschließlich **increment**-Meldungen benötigt keine Start- oder Abfragezweige. Die gespeicherten Zuwächse werden beim Sitzungsende abgerechnet. Kumulative Meldungen ohne diese Zweige erfassen nur den Gesamtverbrauch: Ein übermittelter Zählerstand kann Leerlaufverbrauch seit der letzten Meldung enthalten und legt deshalb keine sichere Sitzungsgrenze fest.

## Optionale Abrechnung

In den Abrechnungseinstellungen pro Zähler einen Preis **pro Messwert** festlegen. `0` deaktiviert die Abrechnung, während die Erfassung weiterläuft. Mehrere Zähler können eigene Positionen auf derselben Sitzungsabrechnung erzeugen.

Name und Preis werden beim Sitzungsstart gespeichert. Spätere Änderungen beeinflussen die laufende Sitzung nicht. Betrag = Sitzungsverbrauch × gespeicherter Preis; einmalig kaufmännisch auf die kleinste Währungseinheit gerundet. Der Abrechnungsfaktor gilt wie üblich. Verbrauch außerhalb einer Sitzung wird keinem Benutzer berechnet.

Bei kostenpflichtigen kumulativen Zählern müssen Start- und Abfragezweige vollständig sein. Ein fehlgeschlagener Start eines kostenlosen Zählers blockiert die Ressourcennutzung nicht; dieser Zähler wird für die Sitzung übersprungen. Fehlt die finale Messung, endet die Sitzung mit abgerechneter Grundgebühr und ausstehender Zählerabrechnung. Eine Wiederholung muss eine gespeicherte Messung liefern, deren **Gemessen am** exakt dem Endzeitstempel der Sitzung entspricht. Ein aktueller Zählerstand könnte Leerlaufverbrauch enthalten und wird abgelehnt. Erneut abfragen oder erlassen bleibt möglich, bis eine spätere Sitzung, ein Reset oder ein gemeldeter Zuwachs außerhalb der Sitzung die Zuordnung unmöglich macht. Danach kann der Betrag nur erlassen werden. Erfolgreiche Wiederholungen erzeugen Korrekturbuchungen; die ursprüngliche Abrechnung bleibt unverändert.

## Bestehende Strommessung

Bestehende Konfigurationen werden zum Zähler **Energy (kWh)**. Alte Abrechnungen und Nachweise bleiben erhalten. Migrierte Flow-Knoten behalten die bisherige Einheitenumrechnung intern bei, damit Wh- oder Joule-Quellen weiterhin kWh liefern. Neue Zähler verwenden Werte unverändert; notwendige Umrechnungen erfolgen in der Quelle oder im Flow.

Der migrierte Gesamtverbrauch enthält nur zuvor erfasste Sitzungsverbräuche. Frühere Leerlaufverbräuche lassen sich nicht nachträglich rekonstruieren.

Das allgemeine Zählermodell ersetzt die Energieabrechnung vollständig: Alte Tarife und exakte Rechnungsmengen werden in Zähler-Snapshots und Rechnungspositionen migriert; die energiespezifischen Datenbankspalten werden entfernt. Historische Transaktionsbeträge und Audit-Referenzen bleiben erhalten. Ein Rollback auf die vorherige allgemeine Zählerversion erhält die konvertierten Nachweise. Eine Rückkehr zum reinen Energiemodell wird abgelehnt, sobald dabei Zählerhistorie verloren ginge; stattdessen muss eine Sicherung vor der Migration wiederhergestellt werden.
