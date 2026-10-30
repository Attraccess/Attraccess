# Attractap Einrichtung

Diese Anleitung fuehrt Sie durch die Kopplung eines neuen Attractap-Lesers in Attraccess und die Zuweisung zu einer Ressource.

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

## Schritt 2: Leser mit Attraccess koppeln

Ein Leser kann sich nicht selbst registrieren. Er zeigt einen wechselnden Code, den ein Admin einmal freigibt.

1. Der Leser muss die Adresse Ihres Servers kennen. Ein Leser ohne Zugangsdaten startet dann direkt die Kopplung und zeigt einen Code (Touch: auf dem Display und als QR-Code; Lite: als Farbmuster auf dem LED-Ring und im Web-Flasher).
2. Scannen Sie den QR-Code mit Ihrem Smartphone, oder oeffnen Sie in Attraccess die Leser-Seite (**Geraete** > **Attractap-Lesegeraete**), waehlen Sie, einen Leser zu koppeln, und geben Sie den Code ein.
3. Geben Sie optional einen Namen ein (z.B. "Lasercutter-Leser") und geben Sie den Leser frei.

Der Leser verbindet sich und ist einsatzbereit. Details, das LED-Muster der Lite-Variante, Sicherheitshinweise und den Umgang mit frueher registrierten Lesern finden Sie unter [Reader koppeln](attractap/pairing.md).

> [!NOTE]
> Zum Freigeben eines Lesers brauchen Sie die Berechtigung `resources.update`. Leser mit Firmware aelter als 1.8.0 koennen keinen neuen Leser koppeln; aktualisieren Sie sie zuerst mit dem Web-Flasher.

## Schritt 3: Ressourcen dem Leser zuweisen

Nach der Kopplung des Lesers muessen Sie festlegen, welche Ressource(n) er steuert:

1. Oeffnen Sie den soeben gekoppelten Leser
2. Klicken Sie im Bereich **Ressourcen** auf **Ressource hinzufuegen**
3. Waehlen Sie die Ressource (Maschine oder Tuer), die dieser Leser steuern soll
4. Klicken Sie auf **Speichern**

> [!TIP]
> Ein einzelner Leser kann einer Ressource zugewiesen werden. Wenn Sie mehrere Maschinen steuern muessen, richten Sie fuer jede einen separaten Leser ein.

<!-- TODO: Screenshot der Ressourcenzuweisung zu einem Leser -->

## Schritt 4: Setup testen

1. Halten Sie eine registrierte RFID-Karte an den Leser
2. Der Leser sollte mit dem Backend kommunizieren und eine Zugangsentscheidung auf dem Display anzeigen
3. Wenn die Karte mit einem Benutzer verknuepft ist, der die Berechtigung fuer die zugewiesene Ressource hat, wird der Zugang gewaehrt

## Verbindungsdetails

Der Leser kommuniziert mit dem Attraccess-Backend ueber WebSocket. Die Verbindung wird automatisch beim Start des Lesers hergestellt.

| Detail | Beschreibung |
|--------|-------------|
| **Protokoll** | WebSocket (WS/WSS) |
| **Verbindung** | Permanent, automatische Wiederverbindung bei Unterbrechung |
| **Authentifizierung** | Gegenseitig authentifiziertes TLS 1.3 im WebSocket, mit dem Schluessel und Zertifikat, die bei der Kopplung ausgestellt wurden |

> [!NOTE]
> Wenn Ihr Attraccess-Server HTTPS verwendet, verbindet sich der Leser ueber sicheres WebSocket (WSS). Stellen Sie sicher, dass Ihr SSL-Zertifikat gueltig ist.

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Leser-Display zeigt "Keine Verbindung" | Pruefen Sie die Netzwerkkonnektivitaet und ueberpruefen Sie die Attraccess-Server-URL |
| Leser erscheint nicht in Attraccess | Stellen Sie sicher, dass der Leser im selben Netzwerk ist und das Backend erreichen kann. Ein Reverse Proxy muss den Header `Sec-WebSocket-Protocol` durchreichen |
| Code wird abgelehnt | Der Code wechselt alle 30 Sekunden; geben Sie den aktuell angezeigten ein. Scheitert ein korrekt abgelesener Code immer wieder, pruefen Sie Ihr Netzwerk |
| Einstellungen eines Lesers sind gesperrt | Der Leser ist noch nicht gekoppelt; nutzen Sie **Koppeln** in seiner Zeile |
| Kartenscan ohne Reaktion | Ueberpruefen Sie, ob die RFID-Karte registriert ist und der Leser eine zugewiesene Ressource hat |

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Reader koppeln](attractap/pairing.md) -- Leser freigeben, Sicherheit und Betrieb
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [RFID-Karten](attractap/rfid-cards.md) -- RFID-Karten registrieren und verwalten
- [Ressourcen](resources/overview.md) -- Maschinen und Tueren verwalten
