# Energiemessung und Abrechnung pro kWh

Attraccess kann den Strom abrechnen, den eine Maschine während einer Nutzungssitzung verbraucht. Dafür sind zwei Dinge nötig:

1. Ein **Preis pro kWh** in den Abrechnungseinstellungen der Ressource (siehe [Abrechnungskonfiguration](billing/configuration.md#energie-pro-kwh)).
2. Eine **Zählerdefinition** im [Flow](flows/overview.md) der Ressource, aufgebaut aus vier Knoten der Gruppe **Billing** im Knotenkatalog.

Der Flow beschreibt, wie Attraccess Ihren Zähler ausliest (HTTP, MQTT, ein Plugin, ...). Sitzungsablauf, Berechnung, Abrechnung und Anzeige übernimmt Attraccess.

> [!NOTE]
> Gewöhnliche Flows für **Ressourcennutzung gestartet** / **Ressourcennutzung beendet** (Relais schalten, MQTT-Nachricht senden, ...) benötigen keine Mess-Knoten. Die Mess-Knoten bilden eigene Zweige, die sich nur um das Auslesen des Zählers kümmern.

## Die Mess-Knoten

| Knoten | Typ | Zweck |
|--------|-----|-------|
| **Messung starten** | Trigger | Läuft, wenn eine abgerechnete Sitzung beginnt (oder übernommen wird). Hier stehen die Schritte, die den Zähler vorbereiten. |
| **Messung bereit** | Aktion | Bestätigt, dass der Zähler vorbereitet ist. Beendet den Startzweig. |
| **Messwert abfragen** | Trigger | Läuft für Zwischenwerte während der Sitzung und für den Endwert, wenn sie endet. |
| **Energie melden** | Aktion | Meldet einen Zählerstand an Attraccess zurück. Beendet den Erfassungszweig. |

### Messung starten

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| **Zeitlimit (Sekunden)** | 30 | Wie lange Attraccess darauf wartet, dass der Zweig **Messung bereit** erreicht. |

### Messung bereit

Alle Einstellungen sind optional und sind [Handlebars](https://handlebarsjs.com/)-Vorlagen.

| Einstellung | Beschreibung |
|-------------|--------------|
| **Baseline-Wert** / **Baseline-Einheit** | Nur für **Lifetime-Zähler, die sich nicht zurücksetzen lassen**: der aktuelle Zählerstand. Spätere Summen werden ab diesem Wert gezählt. Leer lassen, wenn Sie den Zähler zurücksetzen. |
| **Quelle** | Eine Bezeichnung des physischen Zählers (wird als Nachweis angezeigt). |

### Messwert abfragen

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| **Zeitlimit (Sekunden)** | 30 | Wie lange Attraccess darauf wartet, dass der Zweig **Energie melden** erreicht. |
| **Zwischenintervall (Minuten)** | 1 | Abstand der Zwischenwerte während einer laufenden Sitzung. `0` deaktiviert Zwischenwerte. Zwischenwerte werden live angezeigt und nie abgerechnet. |
| **Versuche für den Endwert** | 3 | Wie oft Attraccess versucht, beim Sitzungsende einen frischen Endwert zu erhalten. |
| **Pause zwischen Endwert-Versuchen (Sekunden)** | 5 | Pause zwischen den Versuchen für den Endwert. |

### Energie melden

Alle Einstellungen sind [Handlebars](https://handlebarsjs.com/)-Vorlagen.

| Einstellung | Pflicht | Beschreibung |
|-------------|---------|--------------|
| **Wert** | Ja | Die **Gesamtenergie** seit dem Messstart. |
| **Einheit** | Ja | Die Energieeinheit des Werts. |
| **Gemessen am** | Nein | Zeitpunkt, zu dem der Zähler den Wert erfasst hat (ISO-Zeit). Standard: Zeitpunkt der Meldung. |
| **Quelle** | Nein | Eine Bezeichnung des physischen Zählers. |

Unterstützte Energieeinheiten: `Wh`, `kWh`, `MWh`, `mWh`, `J`, `kJ`, `MJ` sowie die Begriffe `watt-hour`, `kilowatt-hour`, `milliwatt-hour`, `megawatt-hour`, `joule`, `kilojoule`, `megajoule`.

## Grundlagen

### Energie, nicht Leistung

Abgerechnet wird **Energie** (kWh: wie viel verbraucht wurde). **Leistung** (kW: wie schnell gerade Energie verbraucht wird) lässt sich nicht abrechnen. Eine Maschine, die eine halbe Stunde lang 2 kW aufnimmt, hat 1 kWh verbraucht. Leistungseinheiten wie `W`, `kW` oder `mW` werden mit einer Erklärung abgelehnt, denn ein Leistungswert ist keine verbrauchte Energie. Verwenden Sie im Flow den Energiezähler des Geräts, nicht die Anzeige der momentanen Leistung.

### Der Wert ist eine Gesamtsumme seit dem Messstart

**Energie melden** muss die **Gesamtenergie seit dem Messstart** liefern, nicht den Zuwachs seit der letzten Abfrage. Wiederholte Abfragen addieren sich nie: Nur der eine finale Gesamtwert wird einmal abgerechnet.

### Messstart ist ein logischer Reset

Der Start einer Messsitzung ist eine logische Grenze, nicht zwingend ein Hardware-Reset. Es gibt zwei Varianten:

| Zählertyp | Startzweig | Meldung |
|-----------|------------|---------|
| **Rücksetzbarer Sitzungszähler** | Gerät zurücksetzen, dann **Messung bereit** (ohne Baseline). | Der Zählerstand unverändert. |
| **Lifetime-Zähler** (nicht rücksetzbar) | Zählerstand auslesen und als **Baseline-Wert** und **Baseline-Einheit** an **Messung bereit** übergeben. | Der aktuelle Zählerstand. Attraccess zieht die Baseline ab. |

Ein Zähler, der innerhalb einer Sitzung sinkt oder unter die Lifetime-Baseline fällt, wird abgelehnt.

## Ablauf einer Sitzung

**Start.** Attraccess bereitet den Zähler vor, *bevor* die normalen Start-Effekte laufen. Schlägt der Zweig **Messung starten** fehl, läuft in ein Timeout oder erreicht **Messung bereit** nie, startet die Sitzung nicht. Es gibt nie eine abgerechnete Sitzung ohne Zähler.

**Während der Sitzung.** In jedem Zwischenintervall läuft **Messwert abfragen**. Der neueste Wert wird live angezeigt (siehe [Live-Werte](#live-werte)), aber nicht abgerechnet.

**Stopp.** Zuerst laufen die normalen Stopp-Effekte, danach die finale Erfassung. Ein Endwert muss **frisch** sein, also nach dem Stopp der Sitzung erfasst. Ein veralteter Wert wird abgelehnt.

**Endwert nicht verfügbar.** Lässt sich nach den konfigurierten Versuchen kein gültiger Endwert ermitteln, endet die Nutzung trotzdem und die Grundgebühr (Pauschale und zeitabhängige Gebühren) wird abgerechnet. Die Energiekosten erscheinen in der Abrechnungskarte der Ressource als **ausstehend**, mit zwei Aktionen:

- **Retry** -- liest den Zähler erneut aus. Bei Erfolg werden die Energiekosten als separate **Korrekturbuchung** für denselben Benutzer abgerechnet; die ursprüngliche Abrechnung bleibt unverändert. Das funktioniert nur, solange keine spätere Sitzung den Zähler verwendet hat; andernfalls wird der Posten als **fehlgeschlagen** markiert.
- **Waive** -- erlässt die Energiekosten, ohne sie abzurechnen. Auch für fehlgeschlagene Posten verfügbar.

Fehlende oder ungültige Daten werden nie zu einer Null-Abrechnung. Ein gültiger Wert von 0 kWh ist dagegen eine gültige Abrechnung über null, erfasst als Energie-Posten mit dem Wert null.

**Übernahme.** Übernimmt ein Benutzer eine laufende Sitzung, wird zuerst der Endwert der ausgehenden Sitzung gelesen. Erst danach wird der Zähler für die neue Sitzung vorbereitet.

## Berechnung des Betrags

- Der Preis wird **beim Sitzungsstart gespeichert**. Spätere Preisänderungen wirken sich nicht auf eine laufende Sitzung aus.
- Betrag = kWh x Preis, berechnet mit exakter Ganzzahlarithmetik und **einmalig** kaufmännisch auf die kleinste Währungseinheit gerundet. Beispiel: 1,5 kWh bei 0,30 EUR/kWh = 0,45 EUR.
- Auf der Abrechnung erscheint ein **Energie**-Posten, der die kWh, den gespeicherten Preis und einen Verweis auf den Messnachweis (Messwerte und Zählerquelle) enthält.
- Der Abrechnungsfaktor des Benutzers wird wie bei allen anderen Posten angewendet.

## Live-Werte

Während eine gemessene Sitzung läuft, zeigt die **Abrechnungskarte in der [Übersicht](resources/resource-details.md) der Ressource** den letzten Zählerwert in kWh, den Zeitpunkt der Erfassung und die bisherigen Energiekosten. Die Anzeige aktualisiert sich etwa im Zwischenintervall. Diese Werte dienen nur der Information; abgerechnet wird ausschließlich der Endwert.

## Beispiel-Einrichtung

### Variante A: Generische HTTP-Quelle

Der Zähler hat eine HTTP-API: Ein `POST` setzt ihn zurück, ein `GET` liefert JSON wie `{"energy_wh": 1500}`.

**Startzweig**

```
Messung starten  ->  HTTP request  ->  Messung bereit
```

- **HTTP request**: Methode `POST`, URL des Reset-Endpunkts des Geräts. Lassen Sie das Abschlussverhalten auf **Acknowledged**, damit der Flow auf die Antwort wartet.
- **Messung bereit**: keine Einstellungen nötig. Optional **Quelle** setzen (z.B. `Shelly Werkstatt`).

**Erfassungszweig**

```
Messwert abfragen  ->  HTTP request  ->  Energie melden
```

- **HTTP request**: Methode `GET`, URL des Auslese-Endpunkts, Abschlussverhalten **Acknowledged**.
- **Energie melden**: **Wert** `{{energy_wh}}`, **Einheit** `Wh`.

> [!NOTE]
> Nach einem **HTTP request** mit Verhalten **Acknowledged** ersetzt der geparste Antwort-Body die Flow-Daten. JSON-Felder stehen daher direkt zur Verfügung (`{{energy_wh}}`), nicht unter einem Präfix `response`. Bei **Dispatch** ist die Antwort nicht verfügbar.

Hat das Gerät nur einen Lifetime-Zähler und keinen Reset, ersetzen Sie den Startzweig durch `Messung starten -> HTTP request (GET) -> Messung bereit` und setzen bei **Messung bereit** **Baseline-Wert** `{{energy_wh}}` und **Baseline-Einheit** `Wh`.

### Variante B: WAGO-Plugin als Quelle (Lifetime-Zähler)

Das [WAGO-Plugin](devices/wago-cc100-commissioning.md) stellt einen Kanal bereit, der einen kumulativen Energiewert meldet. Verwenden Sie dessen Knoten **WAGO read state** (Kategorie `measurement`); er legt den neuesten Wert unter `wago` in die Flow-Daten. Verwendet werden hier die Felder `wago.value`, `wago.unit` (zum Beispiel `milliwatt-hour`), `wago.timestamp` (ISO-Zeit) und `wago.available`.

**Startzweig**

```
Messung starten  ->  WAGO read state  ->  Messung bereit
```

- **WAGO read state**: Controller, Energiekanal und die Kategorie `measurement` auswählen.
- **Messung bereit**: **Baseline-Wert** `{{wago.value}}`, **Baseline-Einheit** `{{wago.unit}}`.

**Erfassungszweig**

```
Messwert abfragen  ->  WAGO read state  ->  Energie melden
```

- **Energie melden**: **Wert** `{{wago.value}}`, **Einheit** `{{wago.unit}}`, **Gemessen am** `{{wago.timestamp}}`.

Verbinden Sie nur den Ausgang **output** von **WAGO read state**. Sind die Daten nicht verfügbar (Controller offline oder veraltet), nutzt der Knoten seinen Ausgang **unavailable**. Lassen Sie ihn unverbunden: Der Zweig meldet dann nichts, und Attraccess wertet das als fehlgeschlagenen Start bzw. nicht verfügbaren Messwert, nie als null.

> [!TIP]
> Attraccess rechnet die Einheit für Sie um, Sie können `milliwatt-hour` also direkt durchreichen. Wenn Sie `wago.timestamp` als **Gemessen am** melden, kann Attraccess prüfen, ob der Endwert frisch ist.

## Siehe auch

- [Abrechnungskonfiguration](billing/configuration.md) -- Preis pro kWh festlegen
- [Knotentypen](flows/node-types.md) -- Alle Flow-Knoten
- [Flow-Editor](flows/flow-editor.md) -- Flows erstellen
- [Transaktionen](billing/transactions.md) -- Abrechnungen einsehen
