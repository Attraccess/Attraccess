# Attractap Hardware

Attractap-Leser sind in mehreren Hardwarevarianten verfuegbar. Diese Seite beschreibt die verschiedenen Konfigurationen, ihre Komponenten und Verbindungsmoeglichkeiten.

## Hardware-Varianten

| Variante | Display | Konnektivitaet | Ideal fuer |
|----------|---------|----------------|------------|
| **Attractap Lite Ethernet** | Basis-LCD | Kabelgebundenes Ethernet | Stationaere Setups mit vorhandener Netzwerkverkabelung |
| **Attractap Touch WiFi** | Touch-LCD | WiFi | Flexible Platzierung ohne Netzwerkkabel |
| **Attractap Touch Ethernet** | Touch-LCD | Kabelgebundenes Ethernet | Zuverlaessige Verbindung mit Touch-Interface |

> [!TIP]
> Waehlen Sie eine Ethernet-Variante, wenn Sie maximale Zuverlaessigkeit benoetigen. Waehlen Sie WiFi, wenn das Verlegen eines Netzwerkkabels zum Montageort unpraktisch ist.

## Kernkomponenten

Jeder Attractap-Leser enthaelt die folgenden Komponenten:

| Komponente | Beschreibung |
|------------|-------------|
| **ESP32 MCU** | Mikrocontroller, der die Attractap-Firmware ausfuehrt und alle Peripheriegeraete verwaltet |
| **PN532 NFC-Leser** | Liest NFC-Karten (MIFARE Classic, MIFARE Ultralight, NTAG-Serien) |
| **Display** | Zeigt Statusinformationen, Benutzer-Feedback und Zugangsentscheidungen. LCD oder Touch-LCD je nach Variante |
| **Buzzer** | Gibt Audio-Feedback -- kurzer Piepton bei Zugang gewaehrt, Fehlerton bei Verweigerung |

<!-- TODO: Screenshot der Attractap-Hardware mit beschrifteten Komponenten -->

## Konnektivitaet

### WiFi

WiFi-Varianten verbinden sich mit Ihrem lokalen drahtlosen Netzwerk. Bei der Ersteinrichtung erstellt der Leser einen temporaeren Zugangspunkt zur Konfiguration.

| Einstellung | Beschreibung |
|-------------|-------------|
| **SSID** | Ihr WiFi-Netzwerkname |
| **Passwort** | Ihr WiFi-Passwort |
| **Kanal** | Automatisch erkannt |
| **Sicherheit** | WPA2 empfohlen |

### Ethernet

Ethernet-Varianten werden ueber ein Standard-RJ45-Kabel verbunden. DHCP wird standardmaessig fuer die automatische Netzwerkkonfiguration verwendet.

| Einstellung | Beschreibung |
|-------------|-------------|
| **IP-Adresse** | Per DHCP zugewiesen (Standard) oder statisch |
| **Gateway** | Automatisch ueber DHCP erkannt |
| **DNS** | Automatisch ueber DHCP erkannt |

> [!NOTE]
> Ethernet-Varianten benoetigen Power over Ethernet (PoE) oder eine separate USB-Stromversorgung, abhaengig von Ihrer Hardware-Revision.

## Firmware-Updates

Alle Varianten unterstuetzen OTA-Firmware-Updates (Over-The-Air). Updates werden ueber das Attraccess-Backend verwaltet und ueber das Netzwerk an die Lesegeraete uebertragen.

Siehe [Firmware-Updates](attractap/firmware-updates.md) fuer Details zur Firmware-Verwaltung.

## Montage

Attractap-Leser sind fuer die Montage neben einer Maschine oder Tuer konzipiert. Beachten Sie Folgendes bei der Wahl des Montageorts:

- Der NFC-Leserbereich muss fuer Benutzer zugaenglich sein
- Das Display sollte gut ablesbar sein
- WiFi-Varianten benoetigen ein ausreichendes Funksignal am Montageort
- Ethernet-Varianten benoetigen Zugang zu einem Netzwerkanschluss

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
- [Firmware-Updates](attractap/firmware-updates.md) -- Leser-Firmware aktualisieren
