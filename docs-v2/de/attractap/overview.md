# Attractap NFC-Leser

Attractap ist ein ESP32-basierter NFC-Kartenleser, der physische Zugangskontrolle fuer Ihren Makerspace ermoeglicht. Er liest NFC-Karten, prueft Benutzerberechtigungen mit dem Attraccess-Backend und steuert den Zugang zu Maschinen und Tueren.

## Was ist Attractap?

Attractap ist ein kompaktes Hardwaregeraet, das Sie neben einer Maschine oder Tuer montieren. Wenn ein Benutzer seine NFC-Karte an den Leser haelt, geschieht Folgendes:

1. Die eindeutige ID der Karte wird gelesen
2. Die ID wird ueber WebSocket an das Attraccess-Backend gesendet
3. Eine Zugangsentscheidung wird empfangen (gewaehrt oder verweigert)
4. Das Ergebnis wird auf dem integrierten Display angezeigt
5. Ein Signalton wird ueber den Buzzer ausgegeben (Erfolgs- oder Fehlerton)

<!-- TODO: Screenshot eines Attractap-Lesers neben einer Maschine montiert -->

## Hauptfunktionen

| Funktion | Beschreibung |
|----------|-------------|
| **NFC-Kartenlesung** | Liest Standard-NFC-Karten (MIFARE, NTAG etc.) ueber PN532-Leser |
| **Echtzeitkommunikation** | Verbindet sich ueber WebSocket mit dem Attraccess-Backend fuer sofortige Zugangsentscheidungen |
| **Display** | Zeigt Statusmeldungen auf integriertem E-Ink- oder LCD-Display |
| **Audio-Feedback** | Buzzer gibt hoerbare Bestaetigung bei Zugang gewaehrt oder verweigert |
| **OTA-Updates** | Firmware kann ueber das Netzwerk ohne physischen Zugang aktualisiert werden |
| **Mehrere Varianten** | Verfuegbar mit Touch-Display oder Basis-Display, WiFi oder Ethernet |

## Funktionsweise

Attractap dient als Bruecke zwischen physischen NFC-Karten und der Attraccess-Software. Der Leser haelt eine permanente WebSocket-Verbindung zu Ihrem Attraccess-Server aufrecht. Wenn eine Karte gescannt wird, prueft das Backend, ob die Karte mit einem Benutzerkonto verknuepft ist und ob dieser Benutzer die Berechtigung hat, die zugewiesene Ressource zu nutzen.

> [!NOTE]
> Attractap benoetigt einen laufenden Attraccess-Backend-Server. Der Leser kann nicht als eigenstaendiges Geraet funktionieren.

## Hardware-Varianten

Es sind mehrere Hardwarekonfigurationen verfuegbar, um verschiedenen Umgebungen gerecht zu werden:

- **Attractap Lite Ethernet** -- Basis-Leser mit kabelgebundener Ethernet-Verbindung
- **Attractap Touch WiFi** -- Leser mit Touch-Display und drahtloser Verbindung
- **Attractap Touch Ethernet** -- Leser mit Touch-Display und kabelgebundener Verbindung

Siehe [Hardware](attractap/hardware.md) fuer detaillierte Spezifikationen jeder Variante.

> [!TIP]
> Fuer die meisten Setups bietet die **Touch WiFi**-Variante die beste Balance aus Funktionsumfang und einfacher Installation -- kein Netzwerkkabel erforderlich.

## Siehe auch

- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [Einrichtung](attractap/setup.md) -- Leser registrieren und konfigurieren
- [NFC-Karten](attractap/nfc-cards.md) -- Benutzer-NFC-Karten verwalten
- [Firmware-Updates](attractap/firmware-updates.md) -- Leser-Firmware aktualisieren
- [Ressourcen](resources/overview.md) -- Maschinen und Tueren verwalten
