# Zähler und verbrauchsbasierte Abrechnung
<!-- llms-description: Benannte Zähler pro Ressource für Strom, Wasser oder beliebige Werte, mit Sitzungsgrenzen, kumulativen Zählern und optionaler Abrechnung. -->

Jede Ressource kann mehrere benannte Zähler haben. Ein Zähler kann beliebige Werte erfassen: Strom, Wasser, Material, Herzschläge oder andere Messwerte. Attraccess speichert keine Einheit und rechnet neue Messwerte nicht um.

## Zähler erstellen und auswählen

Unter **Zähler → Zähler erstellen** in der Ressourcenübersicht reicht ein Name. Jeder Mess-Knoten im Flow muss einen Zähler dieser Ressource auswählen. Auch im Knoten-Editor gibt es die Schaltfläche **Zähler erstellen**.

Die Übersicht zeigt den **Gesamtverbrauch**, einschließlich Messungen außerhalb von Sitzungen, sowie den Verbrauch der **aktuellen Sitzung**. Die laufende Abrechnung zeigt die einzelnen Zähler und ihre bisherigen Kosten.

## Zähler archivieren oder löschen

Wer die Ressource bearbeiten darf, kann einen Zähler in der Karte **Zähler** außer Betrieb nehmen. Jeder Zähler hat ein **⋮**-Menü mit seinen Aktionen, auch **Umbenennen**:

- **Archivieren** ist für Zähler gedacht, die du nicht mehr brauchst. Der Zähler verschwindet aus der Übersicht, den Abrechnungseinstellungen und der Zählerauswahl der Flow-Knoten. Neue Sitzungen messen ihn nicht mehr und rechnen ihn nicht mehr ab, und die regelmäßige Abfrage endet. Nichts geht verloren: Gesamtverbrauch, Messwerte, Sitzungen und Rechnungen bleiben erhalten. Du kannst ihn jederzeit wiederherstellen.
- **Löschen** entfernt einen Zähler endgültig, zum Beispiel einen versehentlich angelegten. Der Menüeintrag erscheint nur bei einem Zähler ohne Verlauf: Er hat nie einen Wert erfasst, keine Sitzung, keine Messanfrage und kein geteilter Zeitabschnitt verweist auf ihn, und keine laufende Sitzung hat ihn übernommen. Einen Zähler mit Verlauf kannst du nur archivieren.

Solange eine laufende Sitzung (auch eine, die gerade beginnt oder endet) einen Zähler verwendet, kannst du ihn weder archivieren noch löschen. Versuche es nach dem Ende der Sitzung erneut.

Ausstehende und fehlgeschlagene Kosten verhindern das Archivieren nicht. Sie bleiben in der Liste der offenen Zählerkosten, wo du weiterhin **Zähler erneut abfragen** oder **Zählerkosten erlassen** kannst. Ein erneuter Versuch führt wie bisher den Zweig **Messwert abfragen** des Zählers aus. Wenn du diesen Zweig entfernt hast, schlägt der Versuch fehl, und du kannst stattdessen **Zählerkosten erlassen** verwenden.

Flow-Knoten verhindern weder das Archivieren noch das Löschen, und Attraccess ändert sie nicht. Ein Knoten, der einen solchen Zähler noch auswählt, zeigt **Zähler archiviert oder entfernt** und wird mit der englischen Meldung „Choose a meter belonging to this resource“ markiert (wähle einen Zähler dieser Ressource). Du kannst den Flow trotzdem speichern, der Knoten bleibt aber markiert. Bis du einen anderen Zähler wählst oder den Knoten entfernst, schlägt jede Ausführung eines Knotens **Zähler melden** für einen archivierten Zähler mit dem Flow-Fehler `METER_ARCHIVED` fehl und erfasst nichts. Passe diese Flows an, um wiederholte Fehler zu vermeiden.

Archivierte Zähler stehen in der Karte **Zähler** unter **Archivierte Zähler**. Nur wer die Ressource bearbeiten darf, sieht sie. Über ihr **⋮**-Menü kannst du sie wiederherstellen, umbenennen oder, wenn sie keinen Verlauf haben, löschen. Ein neuer Zähler darf den Namen eines archivierten tragen. Solange ein aktiver Zähler denselben Namen hat, wird das Wiederherstellen abgelehnt; benenne zuerst einen der beiden um. Nach dem Wiederherstellen funktionieren Flow-Knoten, die den Zähler auswählen, wieder. Archivieren, Wiederherstellen und Löschen werden im Audit-Log erfasst.

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

## Zähler bei gemeinsam genutzten Maschinen

Bei einer Maschine, deren Limit **Maximale parallele Sitzungen** über 1 liegt, können mehrere Personen gleichzeitig Sitzungen führen. Die Einstellung **Zuordnung** jedes Zählers legt fest, wie sein Verbrauch zugeordnet wird. Sie finden sie in den Zählereinstellungen der Abrechnungskonfiguration der Ressource. Es gibt zwei Werte:

- **Geteilt und aufgeteilt** (Standard, für neue und bestehende Zähler): Der Verbrauch wird einmal für die Maschine gemessen und fair auf die Nutzenden aufgeteilt.
- **Pro Sitzung gemessen**: Jede Sitzung erhält ihren eigenen Messpunkt.

Der Modus wird pro Sitzung beim Start gespeichert; eine Änderung betrifft laufende Sitzungen daher nicht. Änderungen werden im Audit-Log protokolliert. Bei einem Limit von 1 ändert sich nichts.

### Geteilt und aufgeteilt

Jeder Start und jedes Ende einer Sitzung auf der Maschine schließt das aktuelle Zeitsegment und eröffnet ein neues. An jeder Grenze wird der Zähler gelesen:

- Die erste Sitzung auf einer ruhenden Maschine initialisiert den Zähler wie bisher über den Zweig **Messung starten**.
- Jede spätere Grenze bei aktiven Sitzungen ist eine normale Abfrage über den Zweig **Messwert abfragen** (Payload `kind: "boundary"`). Sie setzt den Zähler nicht zurück.
- Das letzte Ende führt die abschließende Abfrage durch.

Jedes geschlossene Segment speichert seinen Zeitraum, den Verbrauch zwischen den beiden Grenzmessungen und die aktiven Sitzungen. Sein Verbrauch wird zu gleichen Teilen auf diese Sitzungen verteilt. Regelmäßige (Zwischen-)Messungen aktualisieren die Live-Ansicht, erzeugen aber nie Grenzen. Die Grenzen einer Maschine sind strikt geordnet.

Beispiel: Eine Maschine verbraucht 8 kWh zu 30 Credits pro kWh. A ist allein für 2 kWh aktiv, A und B zusammen für 2 kWh, B allein für 4 kWh. A zahlt 2 + 1 = 3 kWh = 90 Credits, B zahlt 1 + 4 = 5 kWh = 150 Credits.

Die Laufzeit (Betriebszeit) wird genauso aufgeteilt: Die Betriebszeit der Maschine in jedem Segment wird zu gleichen Teilen auf die in diesem Segment aktiven Sitzungen verteilt. Nutzungsgebühr und Sitzungszeit (die eigene Sitzungsdauer der Person, aufgerundet auf volle Minuten) werden nie aufgeteilt. Die Gebühren jeder Person stehen auf ihrer eigenen Abrechnungstransaktion und zählen für ihr eigenes Projekt, ebenso spätere automatische Korrekturen.

Eine Sitzung, die nie ein Segment mit einer anderen Sitzung geteilt hat, wird wie bisher abgerechnet (Laufzeit auf volle Minuten aufgerundet). Sobald eine Sitzung ein Segment geteilt hat, wird ihre Laufzeit nach exakten Anteilen berechnet, da ein Aufrunden pro Person Guthaben erzeugen würde.

#### Rundung

Anteile werden exakt geführt (Zählerwerte in Einheiten von 1e-9, Zeit in Millisekunden). Gerundet wird erst bei der Berechnung, einmal pro Segment und Gebührenart (jeder Zähler, Laufzeit):

1. Die Credit-Summe eines Segments ist die Summe aller Beteiligten aus exaktem Anteil mal dem jeweils eigenen gespeicherten Tarif, einmal kaufmännisch auf ganze Credits gerundet.
2. Diese Summe wird mit dem Largest-Remainder-Verfahren in ganzzahlige Gebühren aufgeteilt. Bei Gleichstand entscheidet die früher gestartete Sitzung, danach die niedrigere Nutzungs-ID.

Die berechneten Anteile eines Segments ergeben daher immer exakt die Segmentsumme; es geht kein Credit verloren und keiner entsteht. Beispiel: 3 Personen teilen sich 1 Credit: eine zahlt 1 Credit, die anderen 0. 3 Personen teilen sich 2 Credits: zwei zahlen 1.

Die Gebühr einer Person für einen Zähler oder die Laufzeit ist die Summe ihrer ganzzahligen Segmentanteile. Der Abrechnungsfaktor (Prozentsatz) wird danach wie bisher pro Person auf die Bruttosumme angewendet.

#### Fehlgeschlagene Messung an einer Grenze

- **Bei einem Start** wird der Start mit dem Fehler `METER_INITIALIZATION_FAILED` abgelehnt, genau wie wenn ein kostenpflichtiger Zähler nicht initialisiert werden kann. Die laufenden Sitzungen sind nicht betroffen.
- **Bei einem Ende** gelingt das Beenden immer. Das Segment wird mit dem nächsten zusammengeführt und läuft bis zur nächsten erfolgreichen Messung. Das zusammengeführte Segment wird zu gleichen Teilen auf alle verteilt, die darin zu irgendeinem Zeitpunkt aktiv waren. Personen, die bereits beendet haben, erhalten ihren Anteil automatisch als Korrekturbuchung zu ihrer ursprünglichen Abrechnung, sobald das zusammengeführte Segment geschlossen wird. Bis dahin zeigt ihr Beleg die Zählerzeile als **ausstehend**.
- Wird die Maschine inaktiv und schlägt auch die abschließende Messung fehl, gilt für jede betroffene Sitzung die bestehende Behandlung mit ausstehend, erneut abfragen und erlassen.

#### Nicht teilbare Zähler

Zähler, die nur Zuwächse melden (nur ein Knoten **Zähler melden** im Modus increment, ohne Start- und Abfragezweige), lassen sich nicht bei Bedarf lesen; ihr Verbrauch lässt sich daher im Modus **Geteilt und aufgeteilt** nicht aufteilen. Bei einer Maschine mit einem Limit paralleler Sitzungen über 1 zeigt der Zählerstatus für einen solchen Zähler ein Konfigurationsproblem, solange sein Preis über 0 liegt.

- Bei einem Preis über 0 kann immer nur eine Sitzung den Zähler nutzen: Ein Start, der sich mit einer anderen laufenden Sitzung überschneiden würde, wird mit dem Fehler `METER_SHARING_UNSUPPORTED` abgelehnt.
- Bei einem Preis von 0 (nur Erfassung) wird der Zähler für diese Sitzung übersprungen.

Stellen Sie solche Zähler auf **Pro Sitzung gemessen** um, ergänzen Sie ihren Flow um die Zweige **Messung starten** und **Messwert abfragen** oder setzen Sie den Preis auf 0. Bei einem Limit von 1 verhalten sie sich wie bisher.

Ein Zähler mit dem Zweig **Messung starten**, aber ohne den Zweig **Messwert abfragen** ist in keinem Modus vollständig eingerichtet: Solange er kostenpflichtig ist, kann keine Sitzung starten (`METER_NOT_CONFIGURED`), siehe [Optionale Abrechnung](#optionale-abrechnung).

### Pro Sitzung gemessen

Jede Sitzung erhält ihren eigenen Messpunkt: Er wird mit einer eigenen **Messung starten**-Abfolge initialisiert, mit einer eigenen **Messwert abfragen**-Abfolge gelesen und eigenständig abgerechnet, genau wie bei einer einzelnen Sitzung. Andere Sitzungen blockieren oder übernehmen ihn nie. Verwenden Sie diesen Modus, wenn jede Person einen eigenen physischen Zähler hat oder der Zähler nicht aufteilbar ist.

### Meldungen außerhalb eines Messlaufs

Eine Messung, die ein Knoten **Zähler melden** außerhalb eines Messlaufs sendet, wird so zugeordnet:

- Zähler mit **Geteilt und aufgeteilt**: Die Messung gehört zum Zähler. Die Segmente werden durch ihre Grenzmessungen unterschieden, daher benennt die Messung keine Sitzung.
- Zähler mit **Pro Sitzung gemessen**: Die Messung muss die Nutzung benennen, zu der sie gehört. Läuft der Flow in einem Sitzungsablauf (Start, Ende, Übernahme), wird die Nutzung dieses Ablaufs verwendet. Andernfalls setzen Sie im Knoten **Zähler melden** die Vorlage **Nutzungs-ID** auf eine Vorlage, die eine Nutzungs-ID ergibt: in einem Flow, den **Nutzung gestartet** oder **Nutzung beendet** auslöst, `{{ id }}`, in einem Mess-Flow `{{ metering.usageId }}`. Eine **Nutzungs-ID**, die eine andere Nutzung als die des laufenden Sitzungsablaufs benennt, wird abgelehnt. Bei einer Maschine mit mehr als einer laufenden Sitzung wird eine Messung ohne Nutzung mit einem Flow-Fehler abgelehnt und nie geraten. Bei einer laufenden Sitzung gehört die Messung wie bisher zu dieser Sitzung.

### Was die Nutzenden sehen

Bei einer geteilten Sitzung zeigen die Zähler- und Laufzeitzeilen den Anteil der Person am Gesamtwert, zum Beispiel „0,8 — dein Anteil an 2,4“, mit der Markierung **Geteilt**. Eine geteilte Laufzeitzeile zeigt keinen Preis („—“), weil ihr Betrag die Summe gerundeter Segmentanteile ist. Eine Aufschlüsselung listet jedes Segment, an dem die Person beteiligt war: Zeitraum, Anzahl der Personen, Gesamtmenge und Credits des Segments sowie der Anteil der Person. Die Aufschlüsselung erscheint in den Transaktionsdetails des Abrechnungsverlaufs, im Beleg per E-Mail und in der laufenden Abrechnungsansicht der Sitzung. Einzelsitzungen sehen aus wie bisher.

Solange ein Segment, an dem die Person beteiligt war, keine abschließende Messung hat, steht in der Zählerzeile „Ausstehend: Dein Anteil wird separat abgerechnet, sobald der Zähler wieder gelesen werden kann.“ Der Anteil wird später als Korrekturbuchung berechnet; dafür wird keine E-Mail gesendet.

Die laufende Abrechnungsansicht zeigt den bisherigen Anteil, zum Beispiel „0,8 — dein Anteil an 1,2 bisher“: die geschlossenen Segmente plus der aktuelle Verbrauch des offenen Segments, geteilt durch die aktuelle Anzahl der Sitzungen. Er ist als „vorläufig bis zur nächsten Messung“ gekennzeichnet, und die Aufschlüsselung kennzeichnet das offene Segment als vorläufig.

## Bestehende Strommessung

Bestehende Konfigurationen werden zum Zähler **Energy (kWh)**. Alte Abrechnungen und Nachweise bleiben erhalten. Die Migration ersetzt bisherige Flow-Werte und Zähler-Anfangswerte durch normale Vorlagenumrechnungen, damit Wh- oder Joule-Quellen weiterhin kWh liefern. Die Messwertverarbeitung erhält nur Zahlen und enthält keinen energiespezifischen Laufzeitpfad. Neue Zähler verwenden Werte unverändert; notwendige Umrechnungen erfolgen in der Quelle oder im Flow.

Der migrierte Gesamtverbrauch enthält nur zuvor erfasste Sitzungsverbräuche. Frühere Leerlaufverbräuche lassen sich nicht nachträglich rekonstruieren.

Das allgemeine Zählermodell ersetzt die Energieabrechnung vollständig: Alte Tarife und exakte Rechnungsmengen werden in Zähler-Snapshots und Rechnungspositionen migriert; die energiespezifischen Datenbankspalten werden entfernt. Historische Transaktionsbeträge und Audit-Referenzen bleiben erhalten. Ein Rollback auf die vorherige allgemeine Zählerversion erhält die konvertierten Nachweise. Eine Rückkehr zum reinen Energiemodell wird abgelehnt, sobald dabei Zählerhistorie verloren ginge; stattdessen muss eine Sicherung vor der Migration wiederhergestellt werden.

Die Umrechnungsvorlagen benötigen die allgemeinen Vorlagenhilfen dieser Version. Ein Downgrade vor diese Migration wird abgelehnt, wenn die Vorlagen danach nicht mehr funktionieren würden; stattdessen eine Sicherung vor der Migration wiederherstellen.
