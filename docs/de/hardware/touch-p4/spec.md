# Spezifikation
<!-- llms-description: Spezifikation der Leserplatine Touch P4: Funktion, Versorgung, Umgebung, Schnittstellen und EMV-Ziele. -->

Was die Attractap-Touch-P4-Leserplatine leisten soll, auf einer Seite, für alle, die sie auswählen,
installieren oder prüfen. Die Werte sind Entwurfswerte, keine Messwerte; ihre Quellen stehen in den
[Designnotizen](hardware/touch-p4/design-notes.md).

## Funktion

Ein wandmontierter Zugangs- und Maschinenleser für Attraccess: Er liest NFC-Karten
und -Tags, zeigt einen Touchscreen und spricht über WLAN oder Ethernet mit dem
Attraccess-Server. Ein ESP32-P4 führt alles aus. Das WLAN-Modul und der NFC-Chip
sind seine Coprozessoren.

| Bestückungsvariante | Enthält |
|---|---|
| wifi | alles außer Ethernet und PoE |
| lan | alles, einschließlich Ethernet mit PoE |

## Versorgung

Jede Quelle speist die 5-V-Schiene über einen Schalter, der Rückstrom sperrt. So
dürfen beliebige Kombinationen angeschlossen sein, und die höchste Spannung speist die Platine.

| Quelle | Bereich | Stromaufnahme | Schutz |
|---|---|---|---|
| DC, Hohlstecker 5,5/2,1 mm oder WAGO-Klemme | 12-V- oder 24-V-Netzteile: Der Wandler startet zwischen 8,5 und 9,4 V (R103/R113), 12 V - 10 % lassen ihn also laufen; bis 28 V dauerhaft; der Wandler hält 35 V aus, 40 V für 0,4 s | typisch 0,23 A bei 12 V (2,8 W); bei der höchsten Leistungsaufnahme der Platine 0,45 A bei 12 V, 0,23 A bei 24 V | PTC-Sicherung 1,1 A Haltestrom, bidirektionale TVS-Diode am Anschluss, 100-V-Verpolschutzdiode, gedämpftes Filter, TVS-Diode am Wandler |
| PoE (Version lan) | IEEE-802.3af-Endgerät (Powered Device), 37 bis 57 V an der Buchse (isoliertes Modul DP9900M-5V) | typisch 3,4 W; bei der höchsten Leistungsaufnahme der Platine etwa 5,6 W | Isolation des Moduls (1500-V-Prüfung), TVS-Diode und Ferritperlen an seinem Eingang, 3 mm Kriechstrecke auf der Platine |
| USB-C (Service) | 5 V, USB-2.0-Port oder Type-C-Quelle | höchstens 0,5 A, wenn USB die einzige Quelle ist (Firmware-Grenze; geschätzt 0,43 A) | eFuse: Sanftanlauf, Strombegrenzung 1,8 bis 2,2 A, Abschaltung über 5,53 bis 5,74 V und unter 3,9 V, Rückstromsperre; ESD-Array |

Höchste Leistungsaufnahme an der 5-V-Schiene: 0,90 A nach den Maximalwerten der Hersteller,
1,65 A nach deren Werten für die Auslegung der Versorgung, mit zwei Firmware-Grenzen: die
LEDs zusammen unter 100 mA und kein Piepton, solange das NFC-Feld an ist. Interne
Schienen: 3,3 V (TLV62569, 2 A, 36 % Reserve bei den Auslegungswerten), 1,1-V-Kern
(TLV62569, vom MCU gesetzt).

## Umgebung

| | |
|---|---|
| Einsatz | in Innenräumen, an einer Wand oder einer Maschine; trocken, nicht kondensierend |
| Umgebungstemperatur | 0 bis 40 °C im Betrieb. Im geschlossenen Gehäuse bei 40 °C mit PoE ergibt die Schätzung 62 °C am Display (Grenze 70 °C) und 79 °C am WLAN-Modul |
| Platine | 86,0 x 143,5 mm, sechs Lagen, 1,6 mm, ENIG, Bauteile auf einer Seite; das Display ist auf die andere Seite geklebt, 1,7 mm von der Platine entfernt |

## Schnittstellen

| Schnittstelle | Bauteil | Details |
|---|---|---|
| Display und Touch | 4,0"-Panel 480 x 480, ST7701S, GT911 | RGB565 parallel, 40-poliges Flexkabel; Touch über I2C |
| NFC | PN532, Platinenspule 35 x 37 mm, 4 Windungen | 13,56 MHz, ISO/IEC 14443 A (MIFARE); I2C zum MCU |
| WLAN und Bluetooth LE | Modul ESP32-C5-MINI-1 (esp-hosted über SDIO) | Wi-Fi 6 auf 2,4 GHz und 5 GHz (EU-Kanäle 36 bis 64 nur in Innenräumen, und 100 bis 140), Bluetooth LE 5; die eigene Platinenantenne des Moduls in der oberen linken Ecke der Platine |
| Ethernet (lan) | PHY IP101GRI, Buchse HY931147C mit Übertrager | 10/100 Mbit/s, RMII |
| USB-C | ESP32-P4 USB Serial/JTAG | Flashen, Konsole und Debugging (USB 2.0 Full Speed) |
| Rückmeldung | 8 RGB-LEDs SK6812MINI-E, Summer | die LEDs leuchten durch die Platine rund um den NFC-Bereich |
| Manipulationsschutz | Beschleunigungssensor LIS2DH12, Näherungssensor VCNL4040, Hall-Schalter DRV5032 | Klopfen und Neigung, der Leser verlässt sein Dock |
| Service | Taster RESET und BOOT, UART0 und Testpunkte der Versorgung | im Gehäuse |

## EMV-, ESD- und Surge-Ziele

Der Leser hat Funkmodule, daher gilt die RED. Die Ziele sind die der EN 301 489-1
mit den Teilen 3 (NFC) und 17 (Wi-Fi), EN 55032 Klasse B für die Störaussendung und EN 55035
für den Ethernet-Anschluss ([Konformitäts-Checkliste](hardware/touch-p4/compliance.md)).

| Prüfung | Ziel | Wo |
|---|---|---|
| Elektrostatische Entladung, IEC 61000-4-2 | 4 kV Kontakt, 8 kV Luft, Kriterium B | alles, was berührt werden kann: Glas und seine Kanten, LED-Fenster, Fugen, Schrauben; die Schirme der Steckverbinder. Schutz je Anschluss in den [Designnotizen](hardware/touch-p4/design-notes.md) |
| Gestrahlte Störfestigkeit | 3 V/m, 80 MHz bis 6 GHz | gesamter Leser |
| Schnelle Transienten, HF-Gleichtakt | 0,5 kV; 3 V | Ethernet; der DC-Eingang, wenn sein Kabel länger als 3 m sein darf |
| Surge | 0,5 kV Leitung gegen Erde | Ethernet mit Innenraumkabeln über 30 m. Der DC-Eingang ist für den Surge der EN 50130-4 Leitung gegen Erde über 42 Ohm ausgelegt (simuliert: höchstens 39,6 V am Wandler, Grenze 40 V) |
| Leitungsgebundene Störaussendung | Klasse B, 150 kHz bis 30 MHz | Ethernet; der DC-Eingang, wenn sein Kabel länger als 3 m sein darf |
| PoE-Isolation | 1500 V effektiv für 60 s, oder 2250 V DC, oder zehn 1,5-kV-Impulse 10/700 us (IEEE 802.3 §33.4.1) | Buchsenkontakte gegen die Masse der Platine |
