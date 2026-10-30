# Attractap Einrichtung

Diese Anleitung fuehrt Sie durch die Freigabe eines neuen Attractap-Lesers in Attraccess und die Zuweisung zu einer Ressource.

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

## Schritt 2: Leser in Attraccess freigeben

Ein neuer Leser registriert sich nicht von selbst. Sobald er mit Ihrem Netzwerk verbunden ist, zeigt er einen **Code** wie `K7P-3XQ` an und wartet. Der Leser existiert in Attraccess erst, nachdem ein Administrator diesen Code freigegeben hat. So kann niemand Geraete zu Ihrem System hinzufuegen, nur indem er sie einsteckt.

1. Warten Sie, bis der Leser **Dieses Lesegerät in Attraccess freigeben** und einen Code anzeigt. Der Code aendert sich alle 30 Sekunden, der Countdown auf dem Display zeigt wann.
2. Oeffnen Sie Attraccess im Browser und gehen Sie zu **Geräte > Attractap-Lesegeräte**.
3. Klicken Sie auf **Gerät registrieren**.
4. Geben Sie den Code ein. Gross- und Kleinschreibung spielen keine Rolle, der Bindestrich ist optional (`k7p3xq` funktioniert auch).
5. Geben Sie optional einen Namen fuer den Leser ein.
6. Klicken Sie auf **Freigeben** oder druecken Sie die Eingabetaste. Attraccess oeffnet den neuen Leser, damit Sie die Einrichtung abschliessen koennen.

Der Leser erhaelt seine Zugangsdaten und verbindet sich. Er behaelt sie ueber Neustarts hinweg, Sie muessen einen Leser also nur einmal freigeben.

Zum Freigeben benoetigen Sie die Berechtigung, Ressourcen zu aendern (`resources.update`). Weitere Wege, den Dialog zu oeffnen:

- Rufen Sie `<Ihre Attraccess-Adresse>/?enroll=K7P-3XQ` auf. Der Dialog oeffnet sich mit eingetragenem Code.
- Klicken Sie im Dialog auf **Mit Kamera scannen** und scannen Sie einen QR-Code, der auf eine solche Adresse verweist. Die Kamera-Schaltflaeche erscheint nur, wenn Attraccess ueber HTTPS (oder auf `localhost`) geoeffnet ist, da Browser den Kamerazugriff sonst sperren. Die Eingabe des Codes funktioniert immer.

### Leser ohne Display (Attractap Lite)

Ein Lite-Leser hat keinen Bildschirm. Nutzen Sie stattdessen den Web-Flasher (**RFID-Leser Einrichten**): Nach der seriellen Einrichtung zeigt er **Wartet auf Freigabe** mit dem aktuellen Code und eine Schaltflaeche **Freigeben**. Der Code steht auch auf der USB-Seriell-Konsole des Lesers bereit (`api.status.get`, Feld `enrollmentCode`).

### Grenzen und falsche Codes

- Ein Code gilt, solange er angezeigt wird, und noch 30 Sekunden nachdem er ersetzt wurde.
- Ein wartender Leser, der nicht innerhalb von 10 Minuten freigegeben wird, trennt die Verbindung und zeigt nach dem Wiederverbinden einen neuen Code.
- Nach 5 falschen Codes innerhalb einer Minute antwortet Attraccess mit **Zu viele Versuche**. Warten Sie eine Minute und versuchen Sie es erneut.
- Wartende Anfragen liegen nur im Arbeitsspeicher. Ein Neustart von Attraccess vergisst sie, wartende Leser zeigen einfach einen neuen Code.

> [!IMPORTANT]
> **Hinter einem Reverse Proxy muss `TRUST_PROXY` gesetzt sein.** Attraccess begrenzt, wie viele Einrichtungsanfragen eine Netzwerkadresse stellen darf (10 Versuche in 10 Minuten und 20 gleichzeitig wartende Leser). Ohne `TRUST_PROXY` scheinen alle Leser vom Proxy zu kommen und teilen sich ein Limit. Leser, die sich ueber IPv6 verbinden, zaehlen pro /64-Netz, teilen sich in einem IPv6-Netz also diese Limits. Siehe [Sicherheit](settings/security.md#reverse-proxies-und-die-echte-client-ip).

> [!NOTE]
> **Mehrere Attraccess-Server:** Wartende Anfragen liegen auf dem Server, der die Verbindung des Lesers haelt. Geben Sie den Leser auf genau diesem Server frei (z.B. indem Sie ihn direkt aufrufen oder den Load Balancer festlegen), sonst wird der Code als unbekannt gemeldet.

> [!WARNING]
> **Aeltere Leser-Firmware kann sich nicht einrichten.** Firmware vor Version 1.8.0 fordert Zugangsdaten ohne Code an. Attraccess ignoriert solche Anfragen und legt keinen Leser an. Ein solcher Leser wartet einfach. Aktualisieren Sie ihn zuerst per USB mit dem Web-Flasher. Bereits registrierte Leser funktionieren unveraendert weiter.

## Schritt 3: Ressourcen dem Leser zuweisen

Nach der Freigabe des Lesers muessen Sie festlegen, welche Ressource(n) er steuert:

1. Oeffnen Sie den soeben freigegebenen Leser
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
| **Authentifizierung** | Der Leser authentifiziert sich beim Backend mit seinen registrierten Zugangsdaten |

> [!NOTE]
> Wenn Ihr Attraccess-Server HTTPS verwendet, verbindet sich der Leser ueber sicheres WebSocket (WSS). Stellen Sie sicher, dass Ihr SSL-Zertifikat gueltig ist.

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Leser-Display zeigt "Keine Verbindung" | Pruefen Sie die Netzwerkkonnektivitaet und ueberpruefen Sie die Attraccess-Server-URL |
| Leser erscheint nicht in Attraccess oder zeigt keinen Code | Stellen Sie sicher, dass der Leser im selben Netzwerk ist und das Backend erreichen kann, und geben Sie den angezeigten Code unter **Geräte > Attractap-Lesegeräte > Gerät registrieren** frei. Ein Leser mit Firmware aelter als 1.8.0 zeigt nie einen Code an: Aktualisieren Sie ihn zuerst mit dem Web-Flasher |
| Leser zeigt einen Code, Attraccess meldet ihn als unbekannt | Der Code hat sich geaendert (alle 30 s) oder Sie sind auf einem anderen Attraccess-Server als der Leser |
| "Zu viele Versuche" | Mehr als 5 falsche Codes in einer Minute. Warten Sie eine Minute |
| Kartenscan ohne Reaktion | Ueberpruefen Sie, ob die RFID-Karte registriert ist und der Leser eine zugewiesene Ressource hat |

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [RFID-Karten](attractap/rfid-cards.md) -- RFID-Karten registrieren und verwalten
- [Ressourcen](resources/overview.md) -- Maschinen und Tueren verwalten
