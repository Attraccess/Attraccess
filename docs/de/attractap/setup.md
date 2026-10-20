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

## Schritt 2: Lesegerät in Attraccess freigeben

1. Aktualisieren Sie nicht registrierte Geräte auf Firmware ab Version 1.7.0 mit Freigabecodes. Bereits registrierte Geräte verbinden sich mit ihren gespeicherten Zugangsdaten.
2. Verbinden Sie das Gerät mit Ihrer lokalen Attraccess-URL. Das Display zeigt einen kryptografisch zufälligen `XXX-XXX`-Code und QR-Code. Varianten ohne Display geben den Code auf der lokalen seriellen Konsole aus; er gelangt nicht in entfernte Protokolle.
3. Melden Sie sich mit `resources.update` an. Öffnen Sie **Geräte → Attractap-Lesegeräte → Lesegerät hinzufügen** und geben Sie den aktuellen Code ein oder scannen Sie ihn mit der Kamera.
4. Prüfen Sie, ob der Code zum gewünschten Gerät gehört, und klicken Sie **Freigeben**. Scannen füllt nur das Formular; es öffnet keine URL und gibt das Gerät nicht automatisch frei.
5. Erst nach der Freigabe erhält und speichert das Gerät Zugangsdaten. Öffnen Sie anschließend das neue Lesegerät, um Namen und Ressourcen einzurichten.

Der Code wechselt alle 30 Sekunden. Bei Ablauf, Verbindungsverlust, Kollision oder laufender Freigabe verwenden Sie den aktuellen Code und versuchen es erneut. Kamerazugriff benötigt einen sicheren Browser-Kontext; manuelle Eingabe bleibt möglich. QR-Codes für Lesegeräte und Companion sind nicht austauschbar.

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
| Leser erscheint nicht in Attraccess | Stellen Sie sicher, dass der Leser im selben Netzwerk ist und das Backend erreichen kann |
| Kartenscan ohne Reaktion | Ueberpruefen Sie, ob die RFID-Karte registriert ist und der Leser eine zugewiesene Ressource hat |

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [RFID-Karten](attractap/rfid-cards.md) -- RFID-Karten registrieren und verwalten
- [Ressourcen](resources/overview.md) -- Maschinen und Tueren verwalten


## Grenzen und Wiederherstellung der Gerätefreigabe

Eine ausstehende Freigabe lebt nur im Serverprozess der offenen Geräteverbindung. Ein Serverneustart verwirft sie; verbinden Sie das Gerät erneut und verwenden Sie einen neuen Code. Bei mehreren Replikaten muss die Freigabe denselben Prozess erreichen; verteilte Freigaben werden nicht unterstützt. Vor der Freigabe entstehen weder Geräteeintrag noch Token oder Geräteberechtigung. Nach fehlgeschlagener oder unklarer Zustellung werden Zugangsdaten nicht erneut gesendet. Entfernen Sie gegebenenfalls den freigegebenen, aber unerreichbaren Geräteeintrag und beginnen Sie mit einem neuen Code.

| Grenze | Wert |
|--------|------|
| Ausstehende Verbindungen | 128 insgesamt, 8 je Gegenstellen-IP |
| Erste Ankündigung / maximale Verbindungsdauer | 10 Sekunden / 5 Minuten |
| Codegültigkeit / Ankündigungen | 30 Sekunden / 3 je Verbindung pro 30 Sekunden |
| Nachricht vor Anmeldung / Metadaten | 4 KiB (auch fragmentiert) / 1 KiB |
| Verbindungsversuche pro Minute | 10 je Gegenstellen-IP, 100 insgesamt |
| Freigabeversuche pro Minute | 5 je Konto, 20 je IP, 100 insgesamt |
| Zählerkapazität | 10.000 Einträge; bei voller Kapazität werden neue Einträge abgewiesen |

Geräte hinter einem Proxy teilen dessen Gegenstellen-IP-Grenzen. Native Geräte benötigen keinen Origin-Header; ein Browser-Origin muss ausdrücklich erlaubt sein. Freigabe und Wiederverbindung funktionieren mit dem lokalen Server ohne Internet. Das QR-Format lautet `attraccess-enroll:v1:reader:ABC-123`. Veröffentlichen Sie niemals einen aktuellen Code aus einer echten Installation in Bildern oder Protokollen.

## Checkliste zur Hardware-Validierung

Die folgenden Hardware-Prüfungen wurden für ATT-1149 **nicht durchgeführt**. Der Betreiber hat sie wegen fehlender Hardware ausdrücklich übersprungen. Softwaretests und simulierte Geräte belegen diese Ergebnisse nicht.

- [ ] Rotierenden Code auf einem echten Leserdisplay und in der seriellen Ausgabe prüfen.
- [ ] Code des echten Lesers scannen und Registrierung in der Weboberfläche bestätigen.
- [ ] Leser neu starten und Wiederverbindung mit gespeicherten Zugangsdaten ohne erneute Registrierung prüfen.
- [ ] Echte Gerätenutzung starten und beenden, auch bei unterbrochener Internetverbindung.

Bei jeder Prüfung Firmware-Version, Gerätemodell und Ergebnis dokumentieren.
