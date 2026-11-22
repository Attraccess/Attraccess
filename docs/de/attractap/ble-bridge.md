# Attractap BLE Bridge

<!-- llms-description: Richtet die Attractap BLE Bridge auf einem GL.iNet GL-S10 ein, einem Leser ohne Display, der nur Bluetooth Low Energy für Plugins wie Türschlösser weiterleitet. -->

Die Attractap BLE Bridge ist ein Attractap ohne NFC, Display und Kartenfunktionen. Sie leitet nur Bluetooth Low Energy (BLE) für Plugins weiter, zum Beispiel für Plugins für Bluetooth-Türschlösser. Setzen Sie eine Bridge ein, wenn kein Attractap-Leser nah genug am Schloss hängt.

Attraccess behandelt die Bridge wie einen Leser mit Bluetooth-Fähigkeit. Plugins nutzen sie über `context.ble` wie jeden anderen Leser; siehe [Bluetooth-Transport für Plugins](plugins/ble-transport.md). Eine Bridge kann nie einer Ressource zugewiesen werden, weil sie keine Karten liest.

## Unterstützte Hardware

Die Bridge läuft auf dem BLE-Gateway **GL.iNet GL-S10**.

| Detail       | Beschreibung                                     |
| ------------ | ------------------------------------------------ |
| **Chip**     | Klassischer ESP32 (Bluetooth 4.2 LE), 4 MB Flash |
| **Netzwerk** | Ethernet mit PoE, WLAN                           |
| **v1.x**     | Ethernet-PHY LAN8720                             |
| **v2.x**     | Ethernet-PHY IP101                               |

> [!NOTE]
> Bei Hardware v2.x kann Ethernet Pakete verlieren. Das ist ein bekanntes Problem in ESP-IDF. Wenn Sie es beobachten, verwenden Sie ein Gerät v1.x oder WLAN.

## GL-S10 flashen

Das Gehäuse öffnen Sie nur für das erste Flashen. Alle späteren Updates laufen über das Netzwerk.

Der Micro-USB-Anschluss des S10 dient nur der Stromversorgung; einen USB-Seriell-Chip gibt es nicht. Zum Flashen brauchen Sie einen **USB-TTL-Adapter mit 3,3 V**:

1. Öffnen Sie das Gehäuse.
2. Verbinden Sie den Adapter mit den seriellen Lötpunkten: TX an RX, RX an TX (gekreuzt) und GND an GND. Lassen Sie den 3,3-V-Pin des Adapters frei.
3. Versorgen Sie den S10 über seinen Micro-USB-Anschluss mit Strom. Halten Sie die Download-Taste (**GPIO0**) gedrückt, während Sie die Stromversorgung einstecken; er startet dann im Download-Modus.

> [!WARNING]
> **Versorgen Sie den S10 nie gleichzeitig über USB und PoE mit Strom.** Ziehen Sie das Ethernet-Kabel ab, solange der Adapter angeschlossen ist.
>
> **Verwenden Sie nie einen 5-V-Adapter an den Logik-Pins.** 5 V beschädigen den ESP32. Prüfen Sie vor dem Anschließen, dass Ihr Adapter auf 3,3 V steht.
>
> **Versorgen Sie den S10 nicht über den Adapter.** Der 3,3-V-Ausgang eines USB-TTL-Adapters kann den Funk nicht versorgen: Die Bridge-Firmware startet dann wenige Sekunden nach jedem Start mit einem Brownout neu.

### Original-Firmware sichern

Sichern Sie vor dem ersten Flashen die Original-Firmware von GL.iNet:

```bash
esptool.py --chip esp32 --port <port> read_flash 0 0x400000 gl-s10-stock.bin
```

Bewahren Sie die Datei privat auf. Mit `esptool.py --chip esp32 --port <port> write_flash 0 gl-s10-stock.bin` stellen Sie die Original-Firmware später wieder her.

### Bridge-Firmware flashen

1. Versetzen Sie den S10 in den Download-Modus: Halten Sie GPIO0 gedrückt, während Sie ihn einschalten. Der Browser kann den Chip nicht zurücksetzen; der S10 muss also bereits im Download-Modus sein.
2. Öffnen Sie in Attraccess die Leser-Seite (**Geräte** > **Attractap-Lesegeräte**) und wählen Sie **Attractap einrichten**.
3. Klicken Sie auf **Per USB verbinden** und wählen Sie den seriellen Port Ihres Adapters.
4. Wählen Sie im Tab **Firmware** die Firmware **Attractap BLE Bridge** (ESP32, GL.iNet GL-S10) und klicken Sie auf **Jetzt Installieren**. Lesen Sie den Warnhinweis und bestätigen Sie ihn. Attraccess verweigert das Flashen, wenn der angeschlossene Chip nicht der erwartete ist.
5. Ziehen Sie die Micro-USB-Stromversorgung ab und stecken Sie sie wieder ein, **ohne** GPIO0 zu halten. Er startet jetzt die Bridge-Firmware.
6. Klicken Sie auf **Einrichtung fortsetzen**. Die Seite geht auf demselben Port in die Konfiguration über. Legen Sie die PIN, das WLAN (optional) und die API-URL Ihres Attraccess-Servers fest.

Sie können Schritt 6 auch auslassen, den Adapter abziehen, das Gehäuse schließen und die Bridge stattdessen über Bluetooth einrichten (siehe unten).

> [!NOTE]
> Ein Weg, die Bridge aus der Original-Firmware von GL.iNet heraus über das Netzwerk zu installieren, ist nicht bekannt. Für das erste Flashen brauchen Sie den seriellen Adapter.

## Einrichtung über Bluetooth

Eine noch nicht gekoppelte Bridge (frisch geflasht oder nach einem Werksreset) lässt sich im Browser über Bluetooth einrichten, ohne das Gehäuse zu öffnen.

1. Halten Sie die Taste am Gehäuse **3 Sekunden** gedrückt. Nach 3 Sekunden blinken alle LEDs schnell; lassen Sie die Taste dann los (nach 10 Sekunden würde die Bridge auf Werkseinstellungen zurückgesetzt).
2. Die **BT**-LED blinkt jetzt alle 1,5 Sekunden zweimal kurz: Die Einrichtung ist 10 Minuten lang offen.
3. Öffnen Sie in Attraccess **Geräte** > **Attractap-Lesegeräte**, wählen Sie **Attractap einrichten** und klicken Sie auf **Per Bluetooth einrichten**.
4. Wählen Sie in der Geräteliste des Browsers **Attractap Bridge XXXX**. Ihr Computer oder Smartphone koppelt sich beim ersten Befehl mit der Bridge; bestätigen Sie die Kopplungsabfrage, falls eine erscheint. Solange der Browser verbunden ist, leuchtet die BT-LED dauerhaft.
5. Legen Sie die PIN, das WLAN (mit Ethernet optional) und den Server fest und geben Sie die Bridge dann mit dem angezeigten Code frei.

Die Einrichtung schließt nach 10 Minuten, etwa 10 Sekunden nachdem die Bridge gekoppelt ist, oder bei einem Neustart der Bridge. Von selbst öffnet sie nicht wieder. Bei einer bereits gekoppelten Bridge bewirkt das 3-Sekunden-Halten nichts.

Die Verbindung ist verschlüsselt (Bluetooth LE Secure Connections); das WLAN-Passwort wird also nie im Klartext übertragen. Es gelten dieselben PIN-Regeln wie über die serielle Schnittstelle, mit zwei Ergänzungen für die Funkverbindung: Nach 5 falschen PINs lehnt die Einrichtung jeden weiteren Befehl ab, bis sie erneut geöffnet wird (Bridge neu starten und die Taste halten), und die Bridge trennt eine Verbindung, die nicht innerhalb von 30 Sekunden verschlüsselt ist oder 5 Minuten lang nichts sendet, damit niemand in der Nähe die Einrichtung blockieren kann.

| Browser                                      | Einrichtung über Bluetooth                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Chrome oder Edge unter Windows, macOS, Linux | Unterstützt                                                                                 |
| Chrome unter Android                         | Unterstützt                                                                                 |
| Firefox, Safari, jeder Browser unter iOS     | Nicht unterstützt: Nutzen Sie den seriellen Adapter mit Chrome oder Edge auf einem Computer |

> [!NOTE]
> Die Seite muss über HTTPS (oder `localhost`) geöffnet sein; Browser bieten Bluetooth nur sicheren Seiten an.

## Einrichtung und Kopplung

Die Bridge wird wie jeder andere Leser gekoppelt: Sie wartet mit einem Code, und ein Admin gibt sie einmal frei. Siehe [Reader koppeln](attractap/pairing.md). Die Bridge hat kein Display: Ihr Code steht auf der Einrichtungsseite im Tab **Server**. Geben Sie ihn dort ein, wenn Sie die Bridge stattdessen aus der Leser-Liste freigeben.

In der Leser-Liste erscheint die Bridge als **Bluetooth-Bridge**. Der Schalter **Bluetooth-Nutzung durch Plugins erlauben** ist bereits eingeschaltet. Diese Voreinstellung gilt einmal: Schaltet ein Admin ihn aus, bleibt er aus. Die Einstellungen der Bridge haben keine Optionen für Ressourcen, NFC, Display oder LEDs.

## Ethernet und WLAN

Ethernet (mit PoE) ist die bevorzugte Verbindung.

- Hat Ethernet 30 Sekunden lang keine Verbindung oder keine IP-Adresse und sind WLAN-Zugangsdaten eingerichtet, wechselt die Bridge ins WLAN.
- Sobald Ethernet wieder eine Verbindung und eine IP-Adresse hat, wechselt die Bridge zurück zu Ethernet.

> [!TIP]
> Bevorzugen Sie Ethernet. Beim klassischen ESP32 teilen sich WLAN und Bluetooth ein Funkmodul; über WLAN sind Datenrate und Reichweite von Bluetooth deshalb geringer.

## LEDs

Die drei LEDs sitzen auf der Vorderseite des S10.

| LED          | Zustand                      | Bedeutung                                                      |
| ------------ | ---------------------------- | -------------------------------------------------------------- |
| **Power**    | An                           | Die Firmware läuft                                             |
| **Netzwerk** | An                           | Mit Attraccess verbunden                                       |
| **Netzwerk** | Blinkt langsam               | Netzwerk steht, aber keine Verbindung zu Attraccess            |
| **Netzwerk** | Blinkt schnell               | Kein Netzwerk                                                  |
| **BT**       | An                           | Ein Plugin hat eine offene Bluetooth-Verbindung                |
| **BT**       | Blinkt                       | Ein Scan oder eine Advertisement-Beobachtung läuft             |
| **BT**       | Blinkt doppelt               | Die Bluetooth-Einrichtung ist offen und wartet auf den Browser |
| **BT**       | An (während der Einrichtung) | Der Browser ist mit der Bluetooth-Einrichtung verbunden        |
| **BT**       | Aus                          | Leerlauf                                                       |

## Taste

Die Taste ist die Reset-Taste am Gehäuse, nicht GPIO0.

| Aktion                 | Ergebnis                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| **Kurz drücken**       | Die Bridge startet neu                                                                        |
| **3 Sekunden halten**  | Öffnet die Bluetooth-Einrichtung für 10 Minuten (nur bei einer noch nicht gekoppelten Bridge) |
| **10 Sekunden halten** | Werksreset: löscht WLAN, API-URL, Kopplungsdaten und PIN                                      |

Nach 3 Sekunden blinken alle drei LEDs schnell. Lassen Sie die Taste zwischen 3 und 10 Sekunden los, öffnet sich die Bluetooth-Einrichtung. Nach 10 Sekunden läuft der Werksreset: Alle LEDs leuchten, und die Bridge startet unkonfiguriert neu.

> [!WARNING]
> Nach einem Werksreset muss die Bridge neu eingerichtet (über Bluetooth oder bei geöffnetem Gehäuse über die serielle Schnittstelle) und neu gekoppelt werden.

## Montage und Bluetooth-Reichweite

- Montieren Sie die Bridge wenige Meter vom Schloss entfernt, nach Möglichkeit mit Sichtverbindung.
- Halten Sie sie von Metallgehäusen fern.
- Prüfen Sie nach der Montage die Signalstärke (RSSI) im Plugin.
- Eine Bridge hält **eine Bluetooth-Verbindung zur Zeit**. Solange ein Plugin sie nutzt, werden andere Plugins mit `READER_BUSY` abgewiesen und versuchen es später erneut.

## Firmware-Updates

Alle späteren Firmware-Updates laufen wie bei anderen Lesern über das Netzwerk (OTA). Das Gehäuse müssen Sie dafür nie wieder öffnen. Siehe [Firmware-Updates](attractap/firmware-updates.md).

## Sicherheit

Die Bridge läuft **ohne** das Attractap-Sicherheitsprofil: ohne Secure Boot, ohne Flash-Verschlüsselung, und ihre eFuses sind nicht gebrannt.

- Wenn Ihre Installation für Leser auf das Sicherheitsprofil setzt (siehe [Reader-Sicherheit](attractap/reader-security.md)), beachten Sie, dass Bridges es nicht haben.
- Wer physischen Zugriff auf eine Bridge hat, kann ihren Flash auslesen, einschließlich ihrer Kopplungsdaten. Montieren Sie Bridges so, dass sie nicht einfach mitgenommen werden können. Geht eine Bridge verloren, entfernen Sie ihre Kopplung in Attraccess.

Secure Boot für die Bridge ist geplant. Es setzt die ESP32-Chiprevision v3.0 oder neuer voraus; Geräte mit älterem Chip (zum Beispiel Revision v1.0) können es nie bekommen.

## Siehe auch

- [Bluetooth-Transport für Plugins](plugins/ble-transport.md) -- Wie Plugins Leser und Bridges für Bluetooth nutzen
- [Reader koppeln](attractap/pairing.md) -- Leser freigeben, Sicherheit und Betrieb
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [Firmware-Updates](attractap/firmware-updates.md) -- Leser-Firmware aktualisieren
