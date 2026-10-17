# Attractap Lite LED-Leitfaden

Der Attractap Lite ist ein kompakter RFID-Leser ohne Display. Er verwendet einen kreisförmigen Ring aus 24 WS2812-LEDs zur Anzeige von Gerätestatus und Rückmeldungen. Dieser Leitfaden erklärt jedes LED-Muster, damit Sie den Gerätezustand auf einen Blick erkennen.

## Überblick

Der LED-Ring zeigt:

- **Dauerhafte Zustände** — laufende Animationen für den aktuellen Gerätemodus
- **Einmalige Auslöser** — kurze Lichtsignale für ein Ereignis (Erfolg, Fehler oder Aufmerksamkeit)

## LED-Zustände (dauerhafte Animationen)

Diese Animationen laufen fortlaufend, solange das Gerät im jeweiligen Zustand ist.

| Zustand                        | Farbe        | Animation                                                                                                                | Bedeutung                                                                                                                       |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Konfiguration erforderlich** | Rot / Orange | Drei gleichmäßig verteilte Punkte wechseln zwischen Rot und Orange (kreisförmig) oder sanftes oranges Pulsieren (linear) | Das Gerät ist nicht vollständig konfiguriert. Einrichtung in Attraccess abschließen (z. B. API verbinden, Ressourcen zuweisen). |
| **Initialisierung**            | Blau         | Heller Punkt mit ausblendendem 8-LED-Schweif bewegt sich um den Ring (kreisförmig) oder sanftes Pulsieren (linear)       | Das Gerät startet oder verbindet sich mit Netzwerk und API.                                                                     |
| **Bereit / Wartet auf Karte**  | Grün         | Sechs wechselnde Segmente atmen phasenversetzt (kreisförmig) oder pulsieren sanft (linear)                               | Das Gerät ist bereit. RFID-Karte zur Authentifizierung vorhalten.                                                               |
| **Authentifizierung**          | Cyan         | Schnell bewegter Punkt mit ausblendendem 6-LED-Schweif (kreisförmig) oder schnelles Pulsieren (linear)                   | Eine Karte wird gelesen und authentifiziert.                                                                                    |
| **Keine Ressourcen**           | Orange       | Abwechselndes Ein-/Ausblinken des gesamten Rings                                                                         | Diesem Gerät sind keine Ressourcen zugewiesen. Mindestens eine Ressource in Attraccess zuweisen.                                |
| **Firmware-Update**            | Blau / Weiß  | Statische abwechselnd blaue und weiße Pixel                                                                              | Firmware-Update läuft. Nicht ausschalten.                                                                                       |

## LED-Auslöser (einmalige Rückmeldung)

Diese kurzen Überlagerungen unterbrechen die aktuelle Zustandsanimation für einige hundert Millisekunden und kehren danach zum vorherigen Zustand zurück.

| Auslöser    | Farbe            | Dauer                    | Bedeutung                                                                                   |
| ----------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| **Erfolg**  | Durchgehend grün | ~400 ms                  | Kartenauthentifizierung erfolgreich. Zugang gewährt.                                        |
| **Fehler**  | Rot blinkend     | ~600 ms (3 Blinksignale) | Authentifizierung fehlgeschlagen (ungültige Karte, falscher Schlüssel oder anderer Fehler). |
| **Hinweis** | Gelb blinkend    | ~400 ms (4 Pulse)        | Karte lange am Leser gehalten. Karte entfernen und bei Bedarf erneut versuchen.             |

## Kurzreferenz

| Anzeige                                         | Bedeutung                                           |
| ----------------------------------------------- | --------------------------------------------------- |
| Abwechselnd rote/orange Punkte                  | Konfiguration benötigt                              |
| Bewegter blauer Punkt mit ausblendendem Schweif | Gerät startet oder verbindet sich                   |
| Grün atmende Segmente                           | Bereit — Karte vorhalten                            |
| Schnell bewegter Cyan-Punkt mit Schweif         | Karte wird gelesen                                  |
| Orange blinkender Gesamtring                    | Keine Ressourcen zugewiesen                         |
| Abwechselnd blaue/weiße Pixel (statisch)        | Firmware-Update läuft                               |
| Durchgehend grünes Lichtsignal                  | Erfolg — Zugang gewährt                             |
| Rot blinkend                                    | Fehler — Authentifizierung fehlgeschlagen           |
| Gelb blinkend                                   | Karte zu lange gehalten — entfernen und wiederholen |

## Hardwarehinweise

- **Attractap Lite** verwendet einen kreisförmigen 24-LED-Ring (`USE_CIRCULAR_LED_RING`) mit kreisförmigen Animationen.
- Andere Varianten können einen linearen Streifen mit entsprechenden Zuständen, aber anderen Animationen verwenden (z. B. Pulsieren statt bewegter Punkte).
- LED-Verhalten ist nur auf Geräten mit `HAS_WS2812_LED` verfügbar (Attractap Lite Ethernet).
