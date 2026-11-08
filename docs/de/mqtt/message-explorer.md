# MQTT-Nachrichten-Explorer

Mit dem Nachrichten-Explorer sehen Sie MQTT-Nachrichten live und senden Testnachrichten für jeden in Attraccess eingerichteten MQTT-Server. Er funktioniert mit jedem Broker (Mosquitto, RabbitMQ, EMQX, ...). Nutzen Sie ihn, um Flows mit MQTT-Knoten zu testen und zu debuggen.

## Wer ihn nutzen kann

Alle, die Ressourcen bearbeiten dürfen (Berechtigung `resources.update`) -- dieselbe Berechtigung wie für die MQTT-Server-Seiten und den Flow-Editor. Andere Benutzer sehen den Explorer nicht, und der Server lehnt ihre Anfragen ab.

> **Hinweis:** Die Payloads der Nachrichten sind für alle mit dieser Berechtigung sichtbar. Senden Sie keine Geheimnisse an Topics, die Ressourcen-Bearbeiter nicht lesen sollen.

## Wo Sie ihn finden

### Auf der MQTT-Server-Seite

Öffnen Sie **Geräte → MQTT-Server** und wählen Sie einen Server. Die Karte **Nachrichten-Explorer** zeigt Nachrichten dieses Servers.

### Im Flow-Editor

Klicken Sie in der Werkzeugleiste des Flow-Editors auf die Schaltfläche **MQTT-Explorer** (Antennen-Symbol). Sie erscheint, sobald mindestens ein MQTT-Server existiert.

- Auf einem Desktop-Bildschirm öffnet sich der Explorer als Panel rechts neben der Arbeitsfläche. Die Arbeitsfläche bleibt voll nutzbar: Knoten bearbeiten, speichern und Knoteneinstellungen öffnen, während der Explorer offen ist.
- Auf einem kleinen Bildschirm öffnet sich der Explorer als Seitenleiste (Drawer).
- Der Server wird aus dem Flow vorausgewählt: der MQTT-Server, den die meisten MQTT-Knoten des Flows verwenden, einschließlich noch nicht gespeicherter Änderungen. Mit der Serverauswahl oben im Panel wechseln Sie den Server. Beim Wechsel wird ein laufendes Abonnement neu gestartet und das Protokoll geleert.
- Die Topics der MQTT-Knoten Ihres Flows werden als Schaltflächen angeboten. Ein Klick füllt den Topic-Filter oder das Topic zum Senden. Topics mit Vorlagen (`{{ ... }}`) werden übersprungen.
- Beim Schließen des Panels endet das Abonnement. Beim erneuten Öffnen beginnt es neu. Attraccess merkt sich im Browser, ob das Panel offen war.

Der Explorer ändert den Flow nicht und beeinflusst seinen Speicherstatus nicht.

## Nachrichten beobachten

1. Geben Sie einen **Topic-Filter** ein (Standard `#`, alle Topics) und klicken Sie auf **Abonnieren**.
2. Nachrichten erscheinen mit den neuesten zuerst. Das Protokoll behält die letzten 500 Nachrichten.
3. **Pausieren** hält den Live-Stream an (in dieser Zeit gesendete Nachrichten werden nicht angezeigt), **Leeren** leert das Protokoll, **Filter anwenden** startet mit geändertem Filter ein neues Abonnement.

Payloads werden als formatiertes JSON, als Text oder – bei Binärdaten – als Hex-Vorschau angezeigt. Retained-Nachrichten kommen unmittelbar nach dem Abonnieren an.

### Grenzen

| Grenze | Wert |
|--------|------|
| Topic-Filter | Platzhalter `+` und `#`, jeweils für eine ganze Ebene (`#` nur am Ende), bis 256 Byte. Shared Subscriptions (`$share/...`, `$queue/...`) sind nicht erlaubt |
| Payload | Payloads über 64 KiB werden gekürzt (Hinweis **gekürzt**) |
| Aktive Topics | Pro Viertelsekunde werden höchstens 50 Nachrichten (und etwa 512 KiB) ausgeliefert. Weitere Nachrichten werden verworfen, der Explorer zeigt die Anzahl |

Verwenden Sie auf stark ausgelasteten Brokern einen engen Filter wie `devices/+/status`.

## Nachrichten senden

Füllen Sie das **Topic** (ohne `+` oder `#`), eine optionale **Payload**, die **QoS** und die Option **Retain** aus und klicken Sie auf **Veröffentlichen**.

Das Senden nutzt dieselbe Verbindung wie der Flow-Knoten **MQTT-Nachricht senden**. Die Nachricht verhält sich daher wie eine echte Nachricht: Flows mit passendem Auslöser **MQTT-Nachricht empfangen** laufen, und Geräte, die auf das Topic hören, reagieren. Bitte mit Vorsicht verwenden.

## Eigene Broker-Verbindung

Der Explorer nutzt nicht die Verbindung der Flows. Er öffnet eine eigene, kurzlebige Verbindung zum Broker mit einer Client-ID, die mit `attraccess-x-` beginnt, sobald die erste Person zuschaut, und schließt sie kurz nach dem Ende der letzten Person. Ein breiter Filter wie `#` bremst daher Ihre Flows nicht und löst sie nicht aus. Diese Verbindung kann in der Verbindungsliste des Brokers sichtbar sein.

## Audit-Log

Abonnieren und Senden werden im Audit-Log protokolliert (Bereich **Administration**, Objekt **MQTT-Server**): das Topic, beim Senden zusätzlich Größe, QoS und Retain. Die Payload wird nie aufgezeichnet.

## Siehe auch

- [MQTT-Server einrichten](mqtt/server-setup.md)
- [Flow-Editor](flows/flow-editor.md)
- [Knotentypen](flows/node-types.md)
