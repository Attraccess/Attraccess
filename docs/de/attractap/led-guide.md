# LED-Leitfaden für den Attractap Lite
<!-- llms-description: Erklärt die Animationen des LED-Rings und die einmaligen Rückmeldungen des displaylosen Attractap-Lite-Lesers. -->

Der Attractap Lite ist ein kompakter RFID-Leser ohne Display. Er nutzt einen Ring aus 24 WS2812-LEDs, um den Gerätestatus und Rückmeldungen anzuzeigen. Dieser Leitfaden erklärt, was die einzelnen LED-Muster bedeuten, damit Sie den Zustand des Geräts auf einen Blick erkennen.

## Überblick

Der LED-Ring zeigt:

- **Dauerhafte Zustände** — Fortlaufende Animationen, die den aktuellen Gerätemodus widerspiegeln
- **Einmalige Auslöser** — Kurze Blitze, die ein bestimmtes Ereignis anzeigen (Erfolg, Fehler oder Aufmerksamkeit)

## LED-Zustände (dauerhafte Animationen)

Diese Animationen laufen ununterbrochen, solange sich das Gerät in dem jeweiligen Zustand befindet.

| Zustand | Farbe | Animation | Bedeutung |
|-------|-------|------------|---------|
| **Konfiguration erforderlich** | Rot / Orange | Drei gleichmäßig verteilte Punkte, die zwischen Rot und Orange wechseln (Ring) oder sanftes orangefarbenes Pulsieren (Leiste) | Das Gerät ist nicht vollständig konfiguriert. Schließen Sie die Einrichtung in Attraccess ab (z. B. mit der API verbinden, Ressourcen zuweisen). |
| **Initialisierung** | Blau | Heller Punkt mit einem Schweif aus 8 verblassenden LEDs, der um den Ring läuft (Ring) oder sanftes Pulsieren (Leiste) | Das Gerät startet oder verbindet sich mit dem Netzwerk und der API. |
| **Bereit / Warten auf Karte** | Grün | Sechs abwechselnde Segmente, die gegenphasig ein- und ausatmen (Ring) oder sanftes Pulsieren (Leiste) | Das Gerät ist bereit. Legen Sie eine RFID-Karte auf, um sich anzumelden. |
| **Anmeldung läuft** | Cyan | Schnell laufender Punkt mit einem Schweif aus 6 verblassenden LEDs (Ring) oder schnelles Pulsieren (Leiste) | Eine Karte wird gelesen und authentifiziert. |
| **Keine Ressourcen** | Orange | Abwechselndes Ein- und Ausblitzen des gesamten Rings | Diesem Gerät sind keine Ressourcen zugewiesen. Weisen Sie in Attraccess mindestens eine Ressource zu. |
| **Kopplung (wartet auf Freigabe)** | 8 Farbsegmente | 24 LEDs in 8 Segmenten zu je 3. Das Startsegment blinkt, die Farben folgen im Uhrzeigersinn. Ein langsam weiß atmender Ring bedeutet, dass noch kein Muster vorliegt. | Der Leser wartet darauf, dass eine Administration ihn freigibt. Vergleichen Sie die Farben mit der Freigabeseite. Siehe [Reader koppeln](attractap/pairing.md). |
| **Firmware-Update** | Blau / Weiß | Statische, abwechselnd blaue und weiße Pixel | Ein Firmware-Update läuft. Schalten Sie das Gerät nicht aus. |

## LED-Auslöser (einmalige Rückmeldung)

Dies sind kurze Überlagerungen, die die Animation des aktuellen Zustands für einige hundert Millisekunden unterbrechen und dann zum vorherigen Zustand zurückkehren.

| Auslöser | Farbe | Dauer | Bedeutung |
|---------|-------|----------|---------|
| **Erfolg** | Durchgehend grün | ca. 400 ms | Die Anmeldung mit der Karte war erfolgreich. Zugang gewährt. |
| **Fehler** | Rot blinkend | ca. 600 ms (3 Blitze) | Die Anmeldung ist fehlgeschlagen (ungültige Karte, falscher Schlüssel oder anderer Fehler). |
| **Kopplungsergebnis** | Grün oder rot | Ganzer Ring, kurz | Grün: Der Leser wurde freigegeben. Rot: Die Kopplung ist fehlgeschlagen oder wurde abgebrochen; er fragt mit einem neuen Muster erneut an. Eine Anfrage, die nach 10 Minuten einfach abgelaufen ist, blinkt nicht. |
| **Sichere Verbindung fehlgeschlagen** | Rot blinkend | ca. 600 ms (3 Blitze), einmal pro Versuch | Ein gekoppelter Leser konnte den Server nicht überprüfen oder seine verschlüsselte Sitzung nicht aufbauen (zum Beispiel wegen eines Proxys, der `Sec-WebSocket-Protocol` entfernt). Er versucht es weiter. Siehe [Reader koppeln](attractap/pairing.md). |
| **Hinweis** | Gelb blinkend | ca. 400 ms (4 Impulse) | Die Karte liegt schon lange am Leser. Nehmen Sie die Karte weg und versuchen Sie es bei Bedarf erneut. |

## Kurzübersicht

| Was Sie sehen | Was es bedeutet |
|--------------|---------------|
| Rot / orange abwechselnde Punkte | Konfiguration erforderlich |
| Blauer Punkt mit Schweif, der umläuft | Das Gerät startet oder verbindet sich |
| Grün atmende Segmente | Bereit — legen Sie Ihre Karte auf |
| Cyanfarbener, schnell laufender Punkt mit Schweif | Die Karte wird gelesen |
| Orangefarbener Blitz des ganzen Rings | Keine Ressourcen zugewiesen |
| Abwechselnd blaue und weiße Pixel (statisch) | Firmware-Update läuft |
| Farbige Segmente, eines blinkt | Wartet auf die Kopplungsfreigabe; im Uhrzeigersinn ab dem blinkenden Segment lesen |
| Weiß atmender Ring | Noch kein Kopplungsmuster |
| Durchgehend grüner Blitz | Erfolg — Zugang gewährt |
| Rot blinkend | Fehler — Anmeldung fehlgeschlagen, oder (beim Verbinden) die sichere Verbindung zum Server ist fehlgeschlagen |
| Gelb blinkend | Karte zu lange aufgelegt — wegnehmen und erneut versuchen |

## Hinweise zur Hardware

- Der **Attractap Lite** nutzt einen kreisförmigen Ring aus 24 LEDs (`USE_CIRCULAR_LED_RING`) mit kreisförmigen Animationen.
- Andere Varianten können eine lineare Leiste mit gleichwertigen Zuständen, aber anderen Animationsstilen nutzen (z. B. Pulsieren statt laufender Punkte).
- Das LED-Verhalten gibt es nur bei Geräten, die mit `HAS_WS2812_LED` gebaut wurden (Attractap Lite Ethernet).
