# Firmware-Updates

Attractap-Leser unterstuetzen OTA-Firmware-Updates (Over-The-Air). Das bedeutet, dass die Leser-Firmware ueber das Attraccess-Backend aus der Ferne aktualisiert wird, ohne physisch auf das Geraet zugreifen zu muessen.

## Wie Firmware-Updates funktionieren

Die Leser-Firmware wird mit Attraccess selbst ausgeliefert: Jedes Attraccess-Release enthaelt den Firmware-Build fuer jede Hardware-Variante. Es gibt nichts hochzuladen und kein Update zu planen.

1. Ein Leser verbindet sich mit dem Backend und meldet Name, Variante und Version seiner Firmware
2. Das Backend vergleicht diese Version mit der im laufenden Attraccess-Release enthaltenen
3. Unterscheiden sich die beiden, sendet das Backend das mitgelieferte Image ueber dieselbe Verbindung an den Leser
4. Der Leser installiert das Update und startet mit der neuen Firmware neu

Sie aktualisieren Ihre Leser also, indem Sie Attraccess aktualisieren. Sobald das Backend ein Release mit neuerer Leser-Firmware ausfuehrt, uebernimmt jeder Leser sie bei seiner naechsten Verbindung.

> [!NOTE]
> Waehrend eines Firmware-Updates ist der Leser voruebergehend nicht verfuegbar. Das Update dauert in der Regel weniger als eine Minute.

## Leser-Firmware pruefen

1. Oeffnen Sie die Gruppe **Geraete** in der Seitenleiste
2. Klicken Sie auf **Attractap-Lesegeraete**
3. Jede Leser-Zeile nennt Firmware und Variante und traegt einen Versions-Chip

Dieser Chip ist die gesamte Firmware-Anzeige:

| Chip | Bedeutung |
|------|-----------|
| `v1.2.0` | Der Leser laeuft mit der Firmware dieses Attraccess-Releases |
| `v1.1.0 -> v1.2.0`, hervorgehoben | Es ist eine andere Version enthalten; der Leser uebernimmt sie bei seiner naechsten Verbindung |

<!-- TODO: Screenshot der Leserliste mit einem verfuegbaren Firmware-Update -->

> [!NOTE]
> Die Weboberflaeche bietet keinen Firmware-Upload und keine Schaltflaeche, um einen einzelnen Leser manuell zu aktualisieren. Beides waere ein Weg, einen Leser mit einer Firmware zu betreiben, die nicht zum Backend passt -- genau das verhindert die Auslieferung der Firmware mit dem Release.

## Firmware-Varianten

Jede Hardware-Variante erfordert ihren eigenen Firmware-Build:

| Hardware-Variante | Firmware-Variante |
|-------------------|------------------|
| Attractap Lite Ethernet | `lite-ethernet` |
| Attractap Touch WiFi | `touch-wifi` |
| Attractap Touch Ethernet | `touch-ethernet` |

Einem Leser wird immer nur der Build zu der Variante angeboten, die er meldet -- ein Leser kann also nicht mit dem falschen Image aktualisiert werden.

> [!TIP]
> Alle Leser einer Variante folgen dem Release gemeinsam -- es gibt keinen Rollout pro Geraet. Um eine neue Firmware vorab auszuprobieren, verbinden Sie einen einzelnen Ersatzleser mit einer Testinstanz, auf der die neue Attraccess-Version laeuft.

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Ein Leser zeigt dauerhaft ein verfuegbares Update | Ueberpruefen Sie, ob er mit dem Netzwerk verbunden ist und das Backend erreichen kann -- das Update wird nur waehrend einer Verbindung angeboten |
| Das Update wird nie fertig | Stellen Sie sicher, dass die Verbindung des Lesers waehrend der gesamten Uebertragung steht; der Leser versucht es bei der naechsten Verbindung erneut |
| Leser reagiert nach dem Update nicht | Warten Sie einige Minuten, bis der Leser neu startet. Falls er sich nicht erholt, kann ein manuelles Flashen erforderlich sein |

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
