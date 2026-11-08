# Globale Flows

Ein globaler Flow ist ein benannter Flow, der nicht an eine einzelne Ressource gebunden ist. Er reagiert auf Ereignisse **jeder** Ressource sowie auf andere Quellen wie MQTT, Companion, Variablen und Plugins. Verwenden Sie ihn für Regeln, die überall gelten sollen, statt denselben Flow an jeder Ressource neu aufzubauen -- zum Beispiel einen Webhook oder eine MQTT-Benachrichtigung senden, sobald eine beliebige Maschine startet, eine Tür entriegelt wird, eine Ressource nicht mehr gesund ist oder eine Wartungsanfrage eingeht.

Globale Flows nutzen denselben [Flow-Editor](flows/flow-editor.md), dieselben [Payloads](flows/payloads-variables-templates.md) und dieselbe Ausführungs-Engine wie Ressourcen-Flows.

## Wo finde ich globale Flows?

Öffnen Sie in der Seitenleiste **Geräte** → **Flows** (`/devices/flows`). Sie benötigen die Berechtigung `resources.update`, die Administratoren standardmäßig haben.

Die Liste zeigt jeden globalen Flow mit Name, Ein/Aus-Schalter, Anzahl der Knoten sowie Schaltflächen zum Öffnen im Editor, zum Ändern von Name und Beschreibung und zum Löschen (Löschen verlangt eine Bestätigung). **Neuer Flow** öffnet einen Dialog für Name und optionale Beschreibung. Beides lässt sich später über die Schaltfläche für die Details in der Liste oder in der Kopfzeile des Editors ändern.

Jeder Flow öffnet sich in einem eigenen Editor unter `/devices/flows/:flowId`. Der Editor zeigt über der Arbeitsfläche Name und Ein/Aus-Schalter des Flows sowie den Hinweis: _Läuft für jede Ressource; ein fehlerhafter oder langsamer globaler Flow wirkt sich auf Starts und Stopps an allen Maschinen aus._

## Eigenschaften eines globalen Flows

| Eigenschaft      | Beschreibung                                                       |
| ---------------- | ------------------------------------------------------------------ |
| **Name**         | Erforderlicher Name in Liste und Editor                            |
| **Beschreibung** | Optionaler Freitext                                                |
| **Aktiv**        | Standardmäßig an. Ein deaktivierter Flow läuft nie                 |
| Arbeitsfläche    | Eigene Knoten und Verbindungen, bearbeitet wie ein Ressourcen-Flow |

Sie können beliebig viele globale Flows anlegen.

Ein deaktivierter Flow läuft nie: Keiner seiner Trigger passt und seine Keine-Aktivität-Knoten werden übersprungen. Seine MQTT-Topics werden beim Serverstart nicht abonniert. Abonnements, die bereits bestehen, bleiben beim Deaktivieren oder Löschen bis zum nächsten Neustart erhalten; eintreffende Nachrichten starten den Flow aber nicht. Schalten Sie einen Flow aus, während ein Durchlauf läuft, darf dieser Durchlauf noch zu Ende laufen.

## Verfügbare Knoten

Jeder Knoten legt fest, ob er in Ressourcen-Flows, in globalen Flows oder in beiden verwendet werden kann.

- Diese Kernknoten funktionieren **nur in Ressourcen-Flows**: Taste, Messung starten, Messwert abfragen, Messung bereit und Zähler melden.
- Alle anderen Kernknoten funktionieren in beiden.
- Die Knotenpalette zeigt nur Knoten, die den aktuellen Flow-Typ unterstützen.
- Das Speichern oder Importieren eines globalen Flows mit einem nicht unterstützten Knoten schlägt mit einem Validierungsfehler fehl, der den Knoten nennt.
- Plugin-Knoten sind zunächst nur für Ressourcen-Flows verfügbar, bis das Plugin sie freigibt. Siehe [Plugins entwickeln](plugins/developing-plugins.md#flow-knoten).

Die vollständige Liste finden Sie unter [Knotentypen](flows/node-types.md).

## Trigger in globalen Flows

Ein Trigger in einem globalen Flow löst **einmal pro passendem Ereignis** aus, für jede Ressource des passenden Typs:

| Trigger                                             | Löst aus für                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Nutzung gestartet, beendet, übernommen              | Jede Maschine                                                                                                     |
| Tür verriegelt, entriegelt, Falle geöffnet          | Jede Tür                                                                                                          |
| Keine Aktivität                                     | Jede Maschine mit aktiver Sitzung, einmal pro Minute geprüft mit der **Mindestinaktivität (Minuten)** des Knotens |
| Gesundheitsstatus geändert                          | Jede Ressource, bei einer echten Statusänderung                                                                   |
| Wartung erstellt, beendet, Wartungsanfrage erstellt | Jede Ressource                                                                                                    |
| MQTT-Nachricht empfangen                            | Passendes Topic und passender Server, wie in Ressourcen-Flows                                                     |
| Companion-Eingaben                                  | Das gewählte Companion-Gerät                                                                                      |
| Variable geändert                                   | Siehe unten                                                                                                       |
| Plugin-Trigger (z. B. WAGO-Ereignis empfangen)      | Was das Plugin meldet                                                                                             |

Wissenswert:

- **Keine Aktivität:** Jeder Keine-Aktivität-Knoten hat pro Maschine seinen eigenen Zeitplan. Ein Knoten mit 5 Minuten löst nach 5, 10, 15 … Minuten Inaktivität aus, einer mit 10 Minuten nach 10, 20 … Minuten. Globale Knoten und Knoten im Flow der Ressource beeinflussen sich nicht gegenseitig. Siehe [Keine Aktivität](flows/node-types.md#keine-aktivität).
- **Wartungsanfrage erstellt:** Jeder angemeldete Benutzer kann für eine Ressource eine Wartungsanfrage stellen und damit diesen Trigger auslösen. Verbinden Sie ihn nur mit Aktionen, die jeder Benutzer auslösen dürfte.
- **Variable geändert:** Mit dem Bereich `global` löst der Flow aus, wenn sich diese globale Variable ändert. Mit dem Bereich `resource` löst er aus, wenn sich dieser Schlüssel an **irgendeiner** Ressource ändert; diese Ressource wird zur auslösenden Ressource.

## Die auslösende Ressource

Startet ein Ressourcen-Ereignis einen globalen Flow, enthält die Payload die Ressource, die es verursacht hat:

```json
{
  "resource": { "id": 12, "name": "Laserschneider", "type": "machine", "metadata": {} }
}
```

So erkennen Sie, welche Ressource ausgelöst hat. Um nur auf bestimmte Ressourcen zu reagieren, setzen Sie nach dem Trigger einen **Wenn**-Knoten und vergleichen den Pfad `resource.id` oder `resource.type` mit einem Wert.

Trigger, die keine Ressourcen-Ereignisse sind, haben **keine auslösende Ressource**; die Payload enthält dann gar keinen `resource`-Schlüssel. Das gilt für MQTT-Nachrichten, Companion-Eingaben, Änderungen globaler Variablen und Plugin-Trigger.

Knoten, die auf eine Ressource wirken -- Aktive Sitzung beenden, Abrechnungs Position hinzufügen, Aktivität aufzeichnen, Betriebsbeginn/Betriebsende aufzeichnen, Gesundheits-Lebenszeichen senden und Gesundheitszustand setzen sowie Variablen lesen und setzen im Bereich `resource` -- schlagen als normaler Knotenfehler fehl, wenn der Durchlauf keine auslösende Ressource hat oder diese den falschen Typ hat (z. B. Aktive Sitzung beenden für eine Tür). Es gilt das übliche Fehlerverhalten des Knotens. **Aktive Sitzung beenden** mit dem Ziel **Die auslösende Sitzung** beendet die auslösende Sitzung.

**Gesundheits-Lebenszeichen senden** in einem globalen Flow überwacht nur Ressourcen, die seit dem Serverstart mindestens ein Lebenszeichen über diesen Knoten gesendet haben. Sendet eine Ressource nach einem Neustart nie wieder eines, wird sie nicht als ungesund markiert. Lebenszeichen-Knoten in globalen Flows und in Ressourcen-Flows werden getrennt verfolgt; ein Lebenszeichen des einen setzt den Timeout des anderen nicht zurück.

## Ausführung und Blockierung

> [!WARNING]
> Globale Flows laufen **innerhalb** von Starts, Stopps und Übernahmen. Ein fehlerhafter oder langsamer globaler Flow beeinträchtigt jede Maschine.

Bei Nutzung gestartet, beendet und übernommen sowie bei Tür-Ereignissen laufen die passenden Trigger-Knoten aller aktivierten globalen Flows im **selben Durchlauf** wie der eigene Flow der Ressource:

- gleiche Transaktion und derselbe Sitzungswechsel, auf den weitere Sitzungswechsel an dieser Maschine warten
- gleichzeitig mit dem eigenen Flow der Ressource, und es wird gemeinsam darauf gewartet

Das hat dieselben Folgen wie ein Knoten im eigenen Flow der Maschine:

- Ein globaler Knoten mit Fehlerverhalten **Flow abbrechen** oder ein Fehler ohne Fehlerausgang bricht den Start, das Ende oder die Übernahme ab und macht sie rückgängig.
- Ein langsamer globaler Flow (Warten, HTTP-Anfrage senden ohne Timeout, Auf MQTT-Nachricht warten) verzögert Start oder Ende an jeder Maschine.

Wählen Sie das Fehlerverhalten externer Aktionen in globalen Flows bewusst, z. B. **Protokollieren und fortsetzen** für Benachrichtigungen. Siehe [Fehlerverhalten](flows/node-types.md#fehlerverhalten).

Alle anderen Trigger (Gesundheit, Wartung, MQTT, Companion, Variablen, Plugins, Keine Aktivität) laufen wie in Ressourcen-Flows.

### Rückkopplungsschleifen

- Ein globaler Flow, der durch **Gesundheitsstatus geändert** ausgelöst wird und die Gesundheit wieder setzt, löst nur bei einer echten Statusänderung aus und läuft daher nicht in eine Schleife.
- Ein **Variable geändert**-Flow, der dieselbe Variable setzt, die er beobachtet, kann wie in Ressourcen-Flows eine Schleife erzeugen. Siehe [persistente Variablen](flows/payloads-variables-templates.md#dauerhaft-gespeicherte-flow-variablen) zur Schleifenvermeidung.

### Warnungen für gemeinsam genutzte Maschinen

Die Warnung auf der Ressourceneinstellungs-Seite für Maschinen mit mehreren gleichzeitigen Sitzungen listet auch aktivierte globale Flows auf. Sie meldet Flows, deren Start-, Ende- oder Übernahme-Trigger einen Wirkungsknoten ohne `activeSessions`-Prüfung erreichen. Globale Flows erscheinen mit ihrem Namen und verlinken auf `/devices/flows/:flowId`.

## Beispiel: Webhook bei jedem Sitzungsstart

Einen HTTP-Webhook senden, sobald jemand eine beliebige Maschine nutzt.

1. Öffnen Sie **Geräte** → **Flows** und klicken Sie auf **Neuer Flow**.
2. Geben Sie den Namen `Notify on starts` ein, ergänzen Sie optional eine Beschreibung und bestätigen Sie. Der Editor öffnet sich.
3. Fügen Sie aus der Palette den Trigger **Nutzung gestartet** hinzu.
4. Fügen Sie einen **HTTP-Anfrage senden**-Knoten hinzu, setzen Sie die URL und verwenden Sie im Body Vorlagen wie `{{resource.name}}` und `{{user.username}}`. Stellen Sie sein Fehlerverhalten auf **Protokollieren und fortsetzen**, damit ein nicht erreichbarer Webhook keine Starts blockiert.
5. Verbinden Sie **Ausgabe** des Triggers mit **HTTP-Anfrage senden**.
6. Optional: Setzen Sie einen **Wenn**-Knoten mit dem Pfad `resource.id` dazwischen, um nur für eine Maschine zu benachrichtigen.
7. Klicken Sie auf **Speichern**. Der Flow ist standardmäßig aktiv und läuft beim nächsten Start.

## Siehe auch

- [Flows & Automatisierung](flows/overview.md) -- Einführung in Flows
- [Flow-Editor](flows/flow-editor.md) -- Den visuellen Editor verwenden
- [Knotentypen](flows/node-types.md) -- Alle verfügbaren Knotentypen
- [Payloads, Variablen & Vorlagen](flows/payloads-variables-templates.md) -- Knotendaten verwenden
