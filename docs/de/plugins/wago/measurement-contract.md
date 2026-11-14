# WAGO-Messwert-Wire-Vertrag

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Dieser Vertrag umfasst Kodierung und Parsing der Payloads. Er implementiert oder qualifiziert weder Modbus-Erfassung, Registerzuordnungen, Polling, Geräteprofile noch einen funktionierenden physischen Zähler. ATT-1059 verantwortet diese Arbeit; ATT-978 verantwortet die Ablauffilterung und die Aktualität zwischengespeicherter Zustände.

## Messwerte

Veröffentlichen Sie nicht beibehaltenes (non-retained) JSON auf `<prefix>/v1/controllers/<hardwareId>/measurements`:

```json
{
  "channelId": "current",
  "unit": "milliampere",
  "value": 500,
  "kind": "live",
  "timestamp": "2026-09-05T12:00:00.000Z",
  "streamId": "0feb0339-a34b-4a18-bdbe-a684a20e5396",
  "sequence": 1
}
```

`value` ist eine vorzeichenbehaftete sichere JavaScript-Ganzzahl, kein physikalischer Gleitkommawert. Die konfigurierte Transformation wird als `physicalValue = raw * scale + offset` ausgewertet, gefolgt von `value = physicalValue * 1000`. Der Encoder wertet die kanonischen Dezimalzeichenfolgen der endlichen Eingabezahlen exakt mit Ganzzahlarithmetik aus, einschließlich wissenschaftlicher Notation. So ergibt `65536.001` exakt `65536001` Milli-Einheiten, und Skalierungs- und Offset-Operationen können kein binäres Gleitkommarauschen einführen. Es gibt keine Rundungstoleranz: Eine tatsächliche gebrochene Milli-Einheit führt zu einem Fehler. Rauschen, das bereits in der kanonischen Dezimalzeichenfolge einer Quellzahl steckt, wird nicht als Erfassungsfehler angenommen und nicht weggerundet.

| Konfigurationseinheit | Wire-Einheit     | Beispiel            |
| --------------------- | ---------------- | ------------------- |
| `ampere`              | `milliampere`    | 0.5 A → 500         |
| `volt`                | `millivolt`      | 230.5 V → 230500    |
| `watt`                | `milliwatt`      | -12.25 W → -12250   |
| `watt-hour`           | `milliwatt-hour` | 1234.5 Wh → 1234500 |
| `percent`             | `millipercent`   | 12.345% → 12345     |

Die bevorzugte physikalische Auflösung beträgt 0,001 der konfigurierten Einheit. Der Betrag auf der Leitung darf 9007199254740991 nicht überschreiten. Überschreitet die Milli-Umrechnung diese Grenze, wird ein exakter ganzer physikalischer Wert innerhalb des Bereichs sicherer Ganzzahlen in seiner ursprünglichen Einheit (`ampere`, `volt`, `watt`, `watt-hour` oder `percent`) ausgegeben. Beispielsweise ergibt 10000000000000 Wh `{ "unit": "watt-hour", "value": 10000000000000 }`. Dadurch bleibt der gesamte bisher unterstützte sichere Bereich ganzer Einheiten erhalten, einschließlich negativer Werte. Gebrochene physikalische Werte werden nie in diesen Ausweichfall gerundet oder abgeschnitten: 10000000000000.25 Wh führt zu einem Fehler. Consumer müssen für jeden Messwert die ausdrückliche Einheit verwenden; die Einheit kann wechseln, wenn der Betrag die Milli-Einheiten-Grenze überschreitet.

`kind` ist `live` oder `cumulative`; ausgelassene Konfigurationsarten gelten standardmäßig als `live`. Dieser Abschnitt leitet kein Überlauf- oder Rücksetzverhalten kumulativer Werte ab.

## Veröffentlichungsrhythmus

Die Laufzeit erfasst jeden aktivierten Messkanal in ihrem Abfrageintervall, veröffentlicht einen Messwert aber nur bei Änderung. Ein unveränderter Messwert wird mit der ersten Erfassung mindestens 30 Sekunden nach seiner letzten Veröffentlichung erneut veröffentlicht. Die Grenze von 30 s gilt daher für das, was der Controller veröffentlicht: Weil eine Wiederholung auf die nächste Erfassung wartet, kann ein Consumer einen unveränderten Kanal bis zu etwa 30 s plus Abfrageintervall des Geräts auseinanderliegend sehen, solange der Controller verbunden ist und das Lesen gelingt. Bei einem Abfrageintervall über 30 s (der Editor erlaubt bis zu 3600 s) wird jede Erfassung veröffentlicht. Jeder veröffentlichte Messwert, auch eine solche Wiederholung, ist eine frische Erfassung und trägt den `timestamp` dieses Lesens; die Laufzeit veröffentlicht nie einen alten Messwert mit neuer Zeit erneut. Ein Messwert wird außerdem mit der nächsten Erfassung veröffentlicht, ob geändert oder nicht, nach einem Neustart der Laufzeit, einer neu akzeptierten Konfigurationsrevision, einer Änderung des `hardwareAvailable`-Zustands des Controllers und einem Wiederverbinden zum Broker (der ersten Zustandsveröffentlichung nach dem Verbinden). Ein wiederholter identischer Fehler auf einem Kanal wird ebenfalls unterdrückt, bis ein guter Messwert eintrifft oder 30 Sekunden vergehen. Kanäle mit `enabled: false` werden nie erfasst oder veröffentlicht und erzeugen keine Fehler.

Messwerte werden nicht beibehalten (siehe [Identität und Sequenzierung](#identität-und-sequenzierung)), und weder der Broker noch der Server spielt sie erneut ein. Nach einem Server-Neustart oder einer kurzen Broker-Unterbrechung, die den Controller nicht trennt, hat ein Consumer für einen unveränderten Messwert keinen Wert, bis dieser erneut veröffentlicht wird, was innerhalb von etwa 30 s plus Abfrageintervall des Geräts geschieht.

## Bestehende Konfigurationen und Consumer

Persistierte v1-Konfigurationen behalten ihre vorhandene physikalische Einheit, Skalierung, Offset, Revision und ihren Inhalts-Hash. Der Start der Laufzeit verwendet dieselbe Umrechnung wie neu veröffentlichte Konfigurationen, einschließlich des Ausweichfalls auf ganze Einheiten bei Überlauf; ein Umschreiben von Datenbank oder Schnappschüssen ist nicht nötig. Fehlende Messwerttransformationen behalten den bestehenden Standard Prozent/1/0. Ungültige persistierte Einheiten, Transformationen und Messwerte führen beim Abtasten zu einem Fehler, ohne dass ein Messwert veröffentlicht wird. Werte, die weder in exakte ganzzahlige Milli-Einheiten noch in den sicheren Ausweichfall ganzer Einheiten passen, schlagen ausdrücklich fehl.

Wire-Consumer müssen zusammen mit diesem Vertrag ausgerollt werden: Ausdrückliche Werte in ampere/volt/watt/watt-hour/percent sind ganze physikalische Einheiten, niemals Milli-Einheiten. Der Parser lässt alle zehn ausdrücklichen Einheiten mit Werten als sichere Ganzzahlen zu; fehlende Arten und fehlende Stream-IDs bleiben ungültig. Das kanonische Zeitstempelfeld ist `timestamp`, passend zu ATT-978 / PR1790; `sourceTimestamp` allein wird abgelehnt. Er wird unmittelbar nach dem Abschluss jedes Adapter-Lesens erfasst, vor der Transformation und der Veröffentlichung (UTC ISO 8601 mit Millisekunden, `YYYY-MM-DDTHH:mm:ss.sssZ`). Das ist die Abschlusszeit der Erfassung in der Laufzeit, nicht die Startzeit des Lesens, nicht der Empfangszeitpunkt im Backend und nicht ein geräteinterner Zeitstempel. Die Aktualitätsbehandlung im Backend bleibt Aufgabe von ATT-978.

Zustandsnachrichten behalten ihre erforderliche boolesche Map `outputs` und enthalten optional eine boolesche Map `inputs` für ATT-1056. Ausgelassene `inputs` bleiben abwesend; gelieferte Maps (auch eine leere Map) bleiben erhalten. Null, Arrays, Skalare und nichtboolesche Einträge werden abgelehnt.

## Identität und Sequenzierung

Zustands-, Messwert-, Fehler- und Bestätigungsnachrichten tragen alle `timestamp`, `streamId` und `sequence`. Eine Laufzeitinstanz erzeugt eine zufällige UUID, die von ihren Kategorien gemeinsam genutzt wird. Ein Neustart erzeugt eine andere UUID, auch wenn dieselbe persistierte Konfiguration wiederhergestellt wird; ein Wiederverbinden einer bestehenden Instanz behält ihre UUID und ihre Zähler.

Jede Topic-Kategorie hat einen eigenen Zähler als positive sichere Ganzzahl, der bei 1 beginnt. Messwerte teilen sich einen Zähler über alle Kanäle. Der Ordnungsschlüssel des Consumers ist `(controller, category, streamId)`, niemals Controller allein oder Kanal allein. Verschachtelte Kategorien können keine künstlichen Lücken erzeugen. Eine fehlgeschlagene Veröffentlichung kann eine Sequenznummer verbrauchen; eine tatsächliche Zustellungslücke bleibt beobachtbar. Der Zustand wird beibehalten; Messwerte, Fehler und Bestätigungen nicht. Discovery, Heartbeat und Konfigurationsmeldung behalten ihre jeweils eigenen bestehenden Verträge.

Wechselt der Stream, müssen Consumer den zwischengespeicherten Zustand des alten Streams ungültig machen und den neuen Stream getrennt verfolgen. Die Zeitstempelreihenfolge ersetzt nicht die Stream-Identität. ATT-978 integriert diesen Parser und verantwortet die Richtlinie für Duplikate, Lücken und Aktualität.

## Fehler und Validierung

Messwertfehler verwenden das gewöhnliche Fehler-Topic und -Envelope mit `channelId`, `code` und `message`:

- `unknown_measurement_unit`: nicht unterstützte konfigurierte Einheit.
- `invalid_measurement_transform`: ungültige Skalierung, ungültiger Offset oder ungültige Art, oder nicht darstellbare Ausgabe.
- `invalid_measurement_value`: nichtnumerischer oder nichtendlicher Quellmesswert.
- `measurement_read_failed`: Lesefehler des Adapters.

Fehlerhafte Wire-Messwerte lösen `MeasurementContractError` mit dem Code `invalid_measurement_message` aus; der Parser wandelt keine Zeichenfolgen, Booleans, fehlenden Arten, unbekannten Einheiten, gebrochenen Werte oder unsicheren Ganzzahlen um. Die Envelope-Validierung lehnt fehlende oder ungültige Zeitstempel, leere Stream-IDs und nichtpositive oder nichtganzzahlige Sequenzen ab.

`backend/commissioning/measurement-contract.spec.ts` prüft die echte Laufzeitveröffentlichung über die JSON-Serialisierung bis in den Consumer-Parser, persistierte Schnappschüsse, Neustart- und Verschachtelungsverhalten sowie Simulator-Fixtures für Anfangswerte und Wire-Format bei Live- und kumulativen Messwerten. Die Qualifizierung von Broker und Gerät sowie die Infrastruktur des lauffähigen Simulators bleiben separate Integrationsprüfungen.
