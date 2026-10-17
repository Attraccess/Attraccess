# WAGO-Messwert-Wire-Vertrag

Dieser Vertrag deckt Payload-Codierung und Parsing ab. Er implementiert oder qualifiziert weder Modbus-Erfassung, Registerzuordnungen, Abfragen, Geräteprofile noch einen funktionierenden physischen Zähler. ATT-1059 verantwortet diese Arbeit; ATT-978 Flow-Filterung und Aktualität gespeicherter Zustände.

## Messwerte

Veröffentlichen Sie nicht gespeichertes JSON auf `<prefix>/v1/controllers/<hardwareId>/measurements`:

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

`value` ist vorzeichenbehaftete sichere JavaScript-Ganzzahl, kein physischer Gleitkommawert. Die konfigurierte Transformation ist `physicalValue = raw * scale + offset`, danach `value = physicalValue * 1000`. Der Encoder wertet kanonische Dezimalstrings endlicher Eingabezahlen exakt mit Ganzzahlarithmetik aus, einschließlich wissenschaftlicher Notation. Daher ergibt `65536.001` exakt `65536001` Milli-Einheiten, und scale-/offset-Vorgänge können kein binäres Gleitkommarauschen erzeugen. Es gibt keine Rundungstoleranz: echte gebrochene Milli-Einheit verursacht Fehler. Bereits im kanonischen Dezimalstring der Quellzahl vorhandenes Rauschen wird nicht als Erfassungsfehler angenommen und nicht weggerundet.

| Konfigurationseinheit | Wire-Einheit     | Beispiel            |
| --------------------- | ---------------- | ------------------- |
| `ampere`              | `milliampere`    | 0.5 A → 500         |
| `volt`                | `millivolt`      | 230.5 V → 230500    |
| `watt`                | `milliwatt`      | -12.25 W → -12250   |
| `watt-hour`           | `milliwatt-hour` | 1234.5 Wh → 1234500 |
| `percent`             | `millipercent`   | 12.345% → 12345     |

Bevorzugte physische Auflösung ist 0.001 der konfigurierten Einheit. Wire-Betrag darf 9007199254740991 nicht überschreiten. Überschreitet Milli-Konvertierung dieses Limit, wird ein exakter ganzer physischer Wert im sicheren Ganzzahlbereich in ursprünglicher Einheit (`ampere`, `volt`, `watt`, `watt-hour` oder `percent`) gesendet. Beispielsweise liefert 10000000000000 Wh `{ "unit": "watt-hour", "value": 10000000000000 }`. Dies erhält den gesamten zuvor unterstützten sicheren Ganz-Einheiten-Bereich einschließlich negativer Werte. Gebrochene physische Werte werden nie in diesen Fallback gerundet oder abgeschnitten: 10000000000000.25 Wh scheitert. Verbraucher müssen die explizite Einheit jedes Messwerts verwenden; sie kann beim Überqueren des Milli-Limits wechseln.

`kind` ist `live` oder `cumulative`; fehlende Konfigurationsarten fallen auf `live`. Dieser Teilumfang leitet kein kumulatives Überlauf-/Resetverhalten ab.

## Bestehende Konfigurationen und Verbraucher

Gespeicherte v1-Konfigurationen behalten physische Einheit, scale, offset, Revision und Inhalts-Hash. Runtime-Start verwendet dieselbe Konvertierung wie neu veröffentlichte Konfigurationen einschließlich Ganz-Einheiten-Überlauf-Fallback; kein Datenbank- oder Snapshot-Neuschreiben ist nötig. Fehlende Messtransformationen behalten bestehenden Standard percent/1/0. Ungültige gespeicherte Einheiten/Transformationen/Messwerte scheitern beim Abtasten ohne Veröffentlichung. Werte außerhalb exakter ganzzahliger Milli-Einheiten und sicherem Ganz-Einheiten-Fallback scheitern explizit.

Wire-Verbraucher müssen mit diesem Vertrag bereitgestellt werden: explizite ampere-/volt-/watt-/watt-hour-/percent-Werte sind ganze physische Einheiten, niemals Milli-Einheiten. Der Parser erlaubt alle zehn expliziten Einheiten mit sicheren Ganzzahlwerten; fehlende Arten oder Stream-IDs bleiben ungültig. Kanonisches Zeitstempelfeld ist `timestamp`, passend zu ATT-978 / PR1790; allein `sourceTimestamp` wird abgelehnt. Es wird direkt nach Abschluss jedes Adapterlesens vor Transformation und Veröffentlichung erfasst (UTC ISO 8601 mit Millisekunden, `YYYY-MM-DDTHH:mm:ss.sssZ`). Dies ist Runtime-Erfassungsabschlusszeit, keine Lesestart-, Backend-Empfangs- oder geräteinterne Zeit. Backend-Aktualitätsbehandlung bleibt ATT-978s Verantwortung.

Zustandsnachrichten behalten die erforderliche boolesche Map `outputs` und enthalten optional eine boolesche Map `inputs` für ATT-1056. Fehlendes `inputs` bleibt abwesend; gelieferte Maps einschließlich leerer bleiben erhalten. Null, Arrays, Skalare und nicht boolesche Einträge werden abgelehnt.

## Identität und Sequenzierung

Zustands-, Messwert-, Fehler- und Bestätigungsnachrichten tragen alle `timestamp`, `streamId` und `sequence`. Eine Runtime-Instanz erstellt eine zufällige UUID für alle Kategorien. Neustart erstellt eine andere UUID, auch bei Wiederherstellung derselben gespeicherten Konfiguration; Wiederverbindung bestehender Instanz behält UUID und Zähler.

Jede Themenkategorie hat einen unabhängigen positiven sicheren Ganzzahlzähler ab 1. Messwerte teilen einen Zähler über alle Kanäle. Verbraucher-Ordnungskey ist `(controller, category, streamId)`, nie Controller oder Kanal allein. Verschachtelte Kategorien erzeugen keine künstlichen Lücken. Fehlgeschlagene Veröffentlichung kann eine Sequenznummer verbrauchen; echte Zustellungslücke bleibt sichtbar. Zustand wird gespeichert; Messwerte, Fehler und Bestätigungen nicht. Erkennung, Heartbeat und Konfigurationsmeldung behalten separate bestehende Verträge.

Bei Stream-Wechsel müssen Verbraucher alte Stream-Cache-Zustände invalidieren und neuen Stream separat verfolgen. Zeitstempelreihenfolge ersetzt Stream-Identität nicht. ATT-978 integriert diesen Parser und verantwortet Duplikat-/Lücken-/Aktualitätsrichtlinie.

## Fehler und Validierung

Messfehler verwenden gewöhnliches Fehlerthema und Umschlag mit `channelId`, `code` und `message`:

- `unknown_measurement_unit`: nicht unterstützte konfigurierte Einheit.
- `invalid_measurement_transform`: ungültige scale/offset/kind oder nicht darstellbare Ausgabe.
- `invalid_measurement_value`: nicht numerischer oder nicht endlicher Quellmesswert.
- `measurement_read_failed`: Adapterlesefehler.

Fehlerhafte Wire-Messwerte werfen `MeasurementContractError` mit Code `invalid_measurement_message`; der Parser konvertiert weder Strings, Booleans, fehlende Arten, unbekannte Einheiten, Bruchwerte noch unsichere Ganzzahlen. Umschlagvalidierung lehnt fehlende/ungültige Zeitstempel, leere Stream-IDs und nicht positive/nicht ganzzahlige Sequenzen ab.

`backend/commissioning/measurement-contract.spec.ts` prüft reale Runtime-Veröffentlichung durch JSON-Serialisierung in den Verbraucherparser, gespeicherte Snapshots, Neustart-/Verschachtelungsverhalten und Simulatorformat-Initialwert-/Wire-Fixtures für Live- und kumulative Messwerte. Broker-/Gerätequalifikation und Infrastruktur des lauffähigen Simulators bleiben separate Integrationsprüfungen.
