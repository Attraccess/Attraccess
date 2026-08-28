# Attractap Einrichtung

Diese Anleitung fuehrt Sie durch die Registrierung eines neuen Attractap-Lesers in Attraccess und die Zuweisung zu einer Ressource.

## Voraussetzungen

Stellen Sie vor Beginn sicher, dass:

- Ihr Attraccess-Server laeuft und erreichbar ist
- Der Attractap-Leser eingeschaltet und mit demselben Netzwerk wie Ihr Server verbunden ist
- Sie Administratorberechtigungen in Attraccess haben

## Schritt 1: Leser mit dem Netzwerk verbinden

### WiFi-Variante

1. Schalten Sie den Attractap-Leser ein
2. Der Leser erstellt einen temporaeren WiFi-Zugangspunkt (z.B. `Attractap-Setup`)
3. Verbinden Sie sich von Ihrem Telefon oder Laptop mit diesem Zugangspunkt
4. Geben Sie Ihren WiFi-Netzwerknamen (SSID) und Ihr Passwort ein
5. Der Leser startet neu und verbindet sich mit Ihrem Netzwerk

### Ethernet-Variante

1. Verbinden Sie den Attractap-Leser ueber ein Ethernet-Kabel mit Ihrem Netzwerk
2. Schalten Sie den Leser ein
3. Der Leser erhaelt automatisch eine IP-Adresse ueber DHCP

> [!NOTE]
> Das Display des Lesers zeigt seinen Verbindungsstatus und seine IP-Adresse an, sobald er verbunden ist.

## Schritt 2: Leser in Attraccess registrieren

1. Oeffnen Sie Attraccess in Ihrem Browser
2. Oeffnen Sie die Gruppe **Geraete** in der Seitenleiste
3. Klicken Sie auf **Attractap-Lesegeraete**
4. Klicken Sie auf **Leser hinzufuegen**
5. Geben Sie die Leserdetails ein:

| Feld | Beschreibung |
|------|-------------|
| **Name** | Ein beschreibender Name (z.B. "Lasercutter-Leser") |
| **Beschreibung** | Optionale Beschreibung des Standorts oder Zwecks des Lesers |

6. Klicken Sie auf **Speichern**

<!-- TODO: Screenshot des Dialogs "Leser hinzufuegen" -->

## Schritt 3: Ressourcen dem Leser zuweisen

Nach der Registrierung des Lesers muessen Sie festlegen, welche Ressource(n) er steuert:

1. Oeffnen Sie den soeben erstellten Leser
2. Klicken Sie im Bereich **Ressourcen** auf **Ressource hinzufuegen**
3. Waehlen Sie die Ressource (Maschine oder Tuer), die dieser Leser steuern soll
4. Klicken Sie auf **Speichern**

> [!TIP]
> Ein einzelner Leser kann einer Ressource zugewiesen werden. Wenn Sie mehrere Maschinen steuern muessen, richten Sie fuer jede einen separaten Leser ein.

<!-- TODO: Screenshot der Ressourcenzuweisung zu einem Leser -->

## Schritt 4: Setup testen

1. Halten Sie eine registrierte NFC-Karte an den Leser
2. Der Leser sollte mit dem Backend kommunizieren und eine Zugangsentscheidung auf dem Display anzeigen
3. Wenn die Karte mit einem Benutzer verknuepft ist, der die Berechtigung fuer die zugewiesene Ressource hat, wird der Zugang gewaehrt

## Verbindungsdetails

Der Leser kommuniziert mit dem Attraccess-Backend ueber WebSocket. Die Verbindung wird automatisch beim Start des Lesers hergestellt.

| Detail | Beschreibung |
|--------|-------------|
| **Protokoll** | WebSocket (WS/WSS) |
| **Verbindung** | Permanent, automatische Wiederverbindung bei Unterbrechung |
| **Authentifizierung** | Der Leser authentifiziert sich beim Backend mit seinen registrierten Zugangsdaten |

> [!NOTE]
> Wenn Ihr Attraccess-Server HTTPS verwendet, verbindet sich der Leser ueber sicheres WebSocket (WSS). Stellen Sie sicher, dass Ihr SSL-Zertifikat gueltig ist.

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Leser-Display zeigt "Keine Verbindung" | Pruefen Sie die Netzwerkkonnektivitaet und ueberpruefen Sie die Attraccess-Server-URL |
| Leser erscheint nicht in Attraccess | Stellen Sie sicher, dass der Leser im selben Netzwerk ist und das Backend erreichen kann |
| Kartenscan ohne Reaktion | Ueberpruefen Sie, ob die NFC-Karte registriert ist und der Leser eine zugewiesene Ressource hat |

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [NFC-Karten](attractap/nfc-cards.md) -- NFC-Karten registrieren und verwalten
- [Ressourcen](resources/overview.md) -- Maschinen und Tueren verwalten
