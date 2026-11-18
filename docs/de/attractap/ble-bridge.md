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
2. Verbinden Sie den Adapter mit den seriellen Lötpunkten: TX an RX, RX an TX (gekreuzt), GND an GND und 3,3 V an 3,3 V.
3. Halten Sie die Download-Taste (**GPIO0**) gedrückt, während Sie den S10 mit Strom versorgen. Er startet im Download-Modus.

> [!WARNING]
> **Versorgen Sie den S10 nie gleichzeitig über USB und PoE mit Strom.** Ziehen Sie das Ethernet-Kabel ab, solange der Adapter angeschlossen ist.
>
> **Verwenden Sie nie einen 5-V-Adapter an den Logik-Pins.** 5 V beschädigen den ESP32. Prüfen Sie vor dem Anschließen, dass Ihr Adapter auf 3,3 V steht.

### Original-Firmware sichern

Sichern Sie vor dem ersten Flashen die Original-Firmware von GL.iNet:

```bash
esptool.py --chip esp32 --port <port> read_flash 0 0x400000 gl-s10-stock.bin
```

Bewahren Sie die Datei privat auf. Mit `esptool.py --chip esp32 --port <port> write_flash 0 gl-s10-stock.bin` stellen Sie die Original-Firmware später wieder her.

### Bridge-Firmware flashen

1. Öffnen Sie in Attraccess die Leser-Seite (**Geräte** > **Attractap-Lesegeräte**) und wählen Sie **Geräte-Einrichtung** > **RFID-Leser Einrichten**.
2. Wählen Sie die Firmware **Attractap BLE Bridge — GL.iNet GL-S10** und lesen Sie den Warnhinweis.
3. Klicken Sie auf **Verbinden** und wählen Sie den seriellen Port Ihres Adapters. Der Browser kann den Chip nicht zurücksetzen; der S10 muss also bereits im Download-Modus sein.
4. Flashen Sie die Firmware. Attraccess verweigert das Flashen, wenn der angeschlossene Chip nicht der erwartete ist.
5. Trennen Sie den S10 kurz vom Strom und schalten Sie ihn wieder ein, **ohne** GPIO0 zu halten. Er startet jetzt die Bridge-Firmware.
6. Die Seite geht auf demselben Port in die Konfiguration über. Legen Sie die PIN, das WLAN (optional) und die API-URL Ihres Attraccess-Servers fest.

> [!NOTE]
> Ein Weg, die Bridge aus der Original-Firmware von GL.iNet heraus über das Netzwerk zu installieren, ist nicht bekannt. Für das erste Flashen brauchen Sie den seriellen Adapter.

## Einrichtung und Kopplung

Die Bridge wird wie jeder andere Leser gekoppelt: Sie wartet mit einem Code, und ein Admin gibt sie einmal frei. Siehe [Reader koppeln](attractap/pairing.md).

In der Leser-Liste erscheint die Bridge als **Bluetooth-Bridge**. Der Schalter **Bluetooth-Nutzung durch Plugins erlauben** ist bereits eingeschaltet. Diese Voreinstellung gilt einmal: Schaltet ein Admin ihn aus, bleibt er aus. Die Einstellungen der Bridge haben keine Optionen für Ressourcen, NFC, Display oder LEDs.

## Ethernet und WLAN

Ethernet (mit PoE) ist die bevorzugte Verbindung.

- Hat Ethernet 30 Sekunden lang keine Verbindung oder keine IP-Adresse und sind WLAN-Zugangsdaten eingerichtet, wechselt die Bridge ins WLAN.
- Sobald Ethernet wieder eine Verbindung und eine IP-Adresse hat, wechselt die Bridge zurück zu Ethernet.

> [!TIP]
> Bevorzugen Sie Ethernet. Beim klassischen ESP32 teilen sich WLAN und Bluetooth ein Funkmodul; über WLAN sind Datenrate und Reichweite von Bluetooth deshalb geringer.

## LEDs

Die drei LEDs sitzen auf der Vorderseite des S10.

| LED          | Zustand        | Bedeutung                                           |
| ------------ | -------------- | --------------------------------------------------- |
| **Power**    | An             | Die Firmware läuft                                  |
| **Netzwerk** | An             | Mit Attraccess verbunden                            |
| **Netzwerk** | Blinkt langsam | Netzwerk steht, aber keine Verbindung zu Attraccess |
| **Netzwerk** | Blinkt schnell | Kein Netzwerk                                       |
| **BT**       | An             | Ein Plugin hat eine offene Bluetooth-Verbindung     |
| **BT**       | Blinkt         | Ein Scan oder eine Advertisement-Beobachtung läuft  |
| **BT**       | Aus            | Leerlauf                                            |

## Taste

Die Taste ist die Reset-Taste am Gehäuse, nicht GPIO0.

| Aktion                 | Ergebnis                                            |
| ---------------------- | --------------------------------------------------- |
| **Kurz drücken**       | Die Bridge startet neu                              |
| **10 Sekunden halten** | Werksreset: löscht WLAN, API-URL und Kopplungsdaten |

Nach 2 Sekunden blinken alle drei LEDs schnell. Lassen Sie die Taste vor Ablauf der 10 Sekunden los, um abzubrechen. Nach 10 Sekunden läuft der Werksreset: Alle LEDs leuchten, und die Bridge startet unkonfiguriert neu.

> [!WARNING]
> Nach einem Werksreset muss die Bridge erneut über die serielle Schnittstelle eingerichtet werden. Dafür müssen Sie das Gehäuse wieder öffnen. Außerdem muss sie neu gekoppelt werden.

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

Secure Boot für die Bridge ist geplant. Es setzt die ESP32-Chiprevision v3.0 oder neuer voraus.

## Siehe auch

- [Bluetooth-Transport für Plugins](plugins/ble-transport.md) -- Wie Plugins Leser und Bridges für Bluetooth nutzen
- [Reader koppeln](attractap/pairing.md) -- Leser freigeben, Sicherheit und Betrieb
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [Firmware-Updates](attractap/firmware-updates.md) -- Leser-Firmware aktualisieren
