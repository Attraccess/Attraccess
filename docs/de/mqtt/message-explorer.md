# MQTT-Nachrichten-Explorer
<!-- llms-description: Wie Sie MQTT-Nachrichten live ansehen und Testnachrichten für jeden eingerichteten MQTT-Server senden, wer den Explorer nutzen darf und wo Sie ihn finden. -->

Mit dem Nachrichten-Explorer sehen Sie MQTT-Nachrichten live und senden Testnachrichten für jeden in Attraccess eingerichteten MQTT-Server. Er funktioniert mit jedem Broker (Mosquitto, RabbitMQ, EMQX, ...). Nutzen Sie ihn, um Flows mit MQTT-Knoten zu testen und zu debuggen.

## Wer ihn nutzen kann

Alle, die Ressourcen bearbeiten dürfen (Berechtigung `resources.update`) -- dieselbe Berechtigung wie für die MQTT-Server-Seiten und den Flow-Editor. Andere Benutzer sehen den Explorer nicht, und der Server lehnt ihre Anfragen ab.

> **Hinweis:** Die Nutzlasten der Nachrichten sind für alle mit dieser Berechtigung sichtbar. Senden Sie keine Geheimnisse an Themen, die Ressourcen-Bearbeiter nicht lesen sollen.

## Wo Sie ihn finden

### Auf der MQTT-Server-Seite

Öffnen Sie **Geräte → MQTT-Server** und wählen Sie einen Server. Die Karte **Nachrichten-Explorer** zeigt Nachrichten dieses Servers.

### Im Flow-Editor

Klicken Sie in der Werkzeugleiste des Flow-Editors auf die Schaltfläche **MQTT-Explorer** (Antennen-Symbol). Sie erscheint, sobald mindestens ein MQTT-Server existiert.

- Auf einem Desktop-Bildschirm öffnet sich der Explorer als Panel rechts neben der Arbeitsfläche. Die Arbeitsfläche bleibt voll nutzbar: Knoten bearbeiten, speichern und Knoteneinstellungen öffnen, während der Explorer offen ist.
- Auf einem kleinen Bildschirm öffnet sich der Explorer als Seitenleiste (Drawer).
- Der Server wird aus dem Flow vorausgewählt: der MQTT-Server, den die meisten MQTT-Knoten des Flows verwenden, einschließlich noch nicht gespeicherter Änderungen. Mit der Serverauswahl oben im Panel wechseln Sie den Server. Beim Wechsel wird ein laufendes Abonnement neu gestartet und das Protokoll geleert.
- Der Themen-Filter beginnt mit dem ersten Thema, das die MQTT-Knoten Ihres Flows verwenden, oder mit `#` (alle Themen), wenn sie keines verwenden.
- Die Themen der MQTT-Knoten Ihres Flows werden als Schaltflächen angeboten. Ein Klick füllt den Themen-Filter oder das Thema zum Senden. Themen mit Vorlagen (`{{ ... }}`) werden übersprungen.
- Beim Schließen des Panels endet das Abonnement. Beim erneuten Öffnen beginnt es neu. Attraccess merkt sich im Browser, ob das Panel offen war.

Der Explorer ändert den Flow nicht und beeinflusst seinen Speicherstatus nicht.

## Nachrichten beobachten

1. Geben Sie einen **Themen-Filter** ein (Standard `#`, alle Themen) und klicken Sie auf **Abonnieren**.
2. Nachrichten erscheinen mit den neuesten zuerst. Das Protokoll behält die letzten 500 Nachrichten.
3. **Pausieren** hält den Live-Stream an (in dieser Zeit gesendete Nachrichten werden nicht angezeigt), **Leeren** leert das Protokoll, **Filter anwenden** startet mit geändertem Filter ein neues Abonnement.

Nutzlasten werden als formatiertes JSON, als Text oder – bei Binärdaten – als Hex-Vorschau angezeigt. Lange Nutzlasten werden in der Anzeige nach 8 KiB abgeschnitten.

Behaltene Nachrichten (retained) kommen direkt nach dem Abonnieren an, aber nur, wenn der Explorer für den Filter ein neues Broker-Abonnement beginnt. Beobachtet bereits jemand denselben Filter auf demselben Server (oder hat vor weniger als 10 Sekunden damit aufgehört), schließen Sie sich diesem Abonnement an und sehen nur neue Nachrichten.

### Grenzen

| Grenze | Wert |
|--------|------|
| Themen-Filter | Platzhalter `+` und `#`, jeweils für eine ganze Ebene (`#` nur am Ende), bis 256 Byte. Steuerzeichen sowie geteilte oder exklusive Abonnements (`$share/...`, `$queue/...`, `$exclusive/...`) sind nicht erlaubt |
| Thema (beim Veröffentlichen) | Ohne `+` oder `#` und ohne Steuerzeichen, bis 1024 Byte |
| Nutzlast (beim Beobachten) | Nutzlasten über 64 KiB werden gekürzt (Hinweis **gekürzt**). Die Anzeige zeigt höchstens 8 KiB |
| Nutzlast (beim Veröffentlichen) | Bis zu 256 KiB |
| Aktive Themen | Pro Viertelsekunde werden höchstens 50 Nachrichten (und etwa 512 KiB) ausgeliefert. Weitere Nachrichten werden verworfen, der Explorer zeigt die Anzahl |
| Offene Explorer | Höchstens 8 beobachtete Filter pro Person gleichzeitig, über alle Browser-Tabs. Weitere Abonnements werden abgelehnt |
| Fehlgeschlagene Abonnements | Lehnt der Broker die Verbindung oder das Abonnement ab, meldet der Explorer den Live-Stream als nicht verfügbar und versucht diesen Filter 30 Sekunden lang nicht erneut |

Verwenden Sie auf stark ausgelasteten Brokern einen engen Filter wie `devices/+/status`.

## Nachrichten senden

Füllen Sie das **Thema** (ohne `+` oder `#`), eine optionale **Nutzlast**, die **QoS** und die Option **Nachricht behalten (retain)** aus und klicken Sie auf **Veröffentlichen**.

Eine Anfrage über die API ohne QoS oder Retain verwendet die Standardwerte des Servers für das Senden. Bei QoS 1 oder 2 schlägt das Senden fehl, wenn der Broker die Nachricht nicht innerhalb von 10 Sekunden bestätigt.

Das Senden nutzt dieselbe Verbindung wie der Flow-Knoten **MQTT-Nachricht senden**. Die Nachricht verhält sich daher wie eine echte Nachricht: Flows mit passendem Auslöser **MQTT-Nachricht empfangen** laufen, und Geräte, die auf das Thema hören, reagieren. Bitte mit Vorsicht verwenden.

## Eigene Broker-Verbindung

Der Explorer nutzt nicht die Verbindung der Flows. Für jeden beobachteten Filter öffnet er eine eigene, kurzlebige Verbindung zum Broker mit einer Client-ID, die mit `attraccess-x-` beginnt. Die Verbindung öffnet sich, sobald die erste Person den Filter beobachtet, wird von allen geteilt, die ihn beobachten, und schließt sich etwa 10 Sekunden nachdem die letzte Person aufgehört hat. Ein breiter Filter wie `#` bremst daher Ihre Flows nicht und löst sie nicht aus. Diese Verbindungen können in der Verbindungsliste des Brokers sichtbar sein.

Ändern sich die Verbindungseinstellungen des MQTT-Servers (Host, Port, Zugangsdaten oder TLS) oder wird er gelöscht, schließen sich seine Explorer-Verbindungen. Offene Explorer verbinden sich innerhalb von etwa 10 Sekunden mit den neuen Einstellungen neu. Ein neuer Name oder geänderte Standardwerte zum Veröffentlichen lassen sie offen.

## Audit-Log

Abonnieren und Senden werden im Audit-Log protokolliert (Bereich **Administration**, Objekt **MQTT-Server**): das Thema, beim Senden zusätzlich Größe, QoS und Retain. Die Nutzlast wird nie aufgezeichnet.

Ein Abonnement wird pro Person, Server und Filter höchstens einmal in 5 Minuten protokolliert. Pausieren, Fortsetzen oder Neuladen erzeugt daher nicht jedes Mal einen Eintrag. Lange Themen und Servernamen werden im Eintrag auf 256 Zeichen gekürzt.

## Siehe auch

- [MQTT-Server einrichten](mqtt/server-setup.md)
- [Flow-Editor](flows/flow-editor.md)
- [Knotentypen](flows/node-types.md)
