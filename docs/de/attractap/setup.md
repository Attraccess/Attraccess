# Attractap Einrichtung
<!-- llms-description: Anleitung, einen neuen Attractap-Leser mit dem Netzwerk zu verbinden, mit Attraccess zu koppeln und Ressourcen zuzuweisen. -->

Diese Anleitung fuehrt Sie durch die Kopplung eines neuen Attractap-Lesers in Attraccess und die Zuweisung zu einer Ressource.

## Voraussetzungen

Stellen Sie vor Beginn sicher, dass:

- Ihr Attraccess-Server laeuft und erreichbar ist
- Der Attractap-Leser eingeschaltet ist und Ihren Server über das Netzwerk (WLAN oder Ethernet) erreicht
- Sie Administratorberechtigungen in Attraccess haben

## Schritt 1: PIN, Netzwerk und Server einstellen

Ein neuer Leser (frisch geflasht oder zurückgesetzt) braucht eine PIN, sein Netzwerk und die Adresse Ihres Attraccess-Servers. Es gibt drei Wege, sie einzustellen:

- **Per USB** mit dem Web-Flasher: Öffnen Sie **Geräte** > **Attractap-Lesegeräte**, wählen Sie **Attractap einrichten** und klicken Sie auf **Per USB verbinden**. Er installiert die Firmware und stellt danach PIN, WLAN und Server ein (Serial Configurator).
- **Am Leser selbst** (Attractap Touch): Ein Leser ohne Serveradresse zeigt seine Einstellungen auf dem Display. Geben Sie dort WLAN, Server und eine PIN ein.
- **Per Bluetooth**, ohne Kabel (ab Firmware 2.8.0): siehe unten.

Ethernet-Varianten (Attractap Lite) erhalten ihre Adresse per DHCP, sobald das Kabel steckt; sie brauchen nur PIN und Server.

### Per Bluetooth einrichten

Ein Leser, der **noch nicht gekoppelt** ist, öffnet seine Bluetooth-Einrichtung von selbst:

| Leser | So öffnet sich die Einrichtung | Was er zeigt |
|-------|--------------------------------|--------------|
| **Attractap Touch** (und Touch V2) | 10 Minuten nach jedem Start. Später öffnet **Bluetooth-Einrichtung** neben **Einstellungen** auf dem Verbindungsbildschirm sie für weitere 10 Minuten. | Auf dem Einstellungs- oder Verbindungsbildschirm: „Bluetooth-Einrichtung offen · 09:41“ und sein Name, zum Beispiel „Attractap Touch 71C8“; und „Bluetooth-Einrichtung: Browser verbunden“, solange Ihr Browser verbunden ist. |
| **Attractap Lite** | 10 Minuten nach jedem Einschalten. Für weitere 10 Minuten trennen Sie ihn kurz vom Strom. | Der LED-Ring pulsiert alle 1,5 Sekunden zweimal blau; solange Ihr Browser verbunden ist, leuchtet er blau. Die Kopplungsfarben haben Vorrang. |
| **BLE-Bridge** | Taster 3 Sekunden gedrückt halten. | Siehe [BLE-Bridge](attractap/ble-bridge.md). |

1. Öffnen Sie in Attraccess **Geräte** > **Attractap-Lesegeräte**, wählen Sie **Attractap einrichten** und klicken Sie auf **Per Bluetooth einrichten**.
2. Wählen Sie den Leser in der Geräteliste des Browsers. Sein Name ist „Attractap Touch“, „Attractap Lite“ oder „Attractap Bridge“ und vier Zeichen; ein Touch zeigt seinen Namen auf dem Display. Bestätigen Sie die Kopplungsanfrage Ihres Computers oder Telefons, falls eine erscheint.
3. Stellen Sie die PIN ein, dann das WLAN (nicht beim Lite) und den Server. Den Firmware-Tab gibt es per Bluetooth nicht: Firmware wird per USB installiert oder über das Netzwerk aktualisiert.
4. Weiter mit Schritt 2: Der Leser bittet um die Kopplung.

Die Einrichtung schließt nach 10 Minuten, etwa 10 Sekunden nachdem der Leser gekoppelt ist (Ihr Browser zeigt dann **Einrichtung abgeschlossen**), oder wenn der Leser neu startet. Ein gekoppelter Leser öffnet sie nie und zeigt keine Schaltfläche **Bluetooth-Einrichtung**. Die Verbindung ist verschlüsselt (Bluetooth LE Secure Connections), das WLAN-Passwort wird also nie im Klartext gesendet, und es gelten dieselben PIN-Regeln wie per USB. Siehe [Leser-Sicherheit](attractap/reader-security.md#einrichtung-per-bluetooth).

| Browser | Bluetooth-Einrichtung |
|---------|-----------------------|
| Chrome oder Edge unter Windows, macOS, Linux | Unterstützt |
| Chrome unter Android | Unterstützt |
| Firefox, Safari, jeder Browser unter iOS | Nicht unterstützt: USB mit Chrome oder Edge auf einem Computer verwenden |

> [!NOTE]
> Die Seite muss über HTTPS (oder `localhost`) geöffnet sein; Browser bieten Bluetooth nur sicheren Seiten an. Solange die Einrichtung offen ist, können Plugins das Bluetooth des Lesers noch nicht nutzen; danach schon.

## Schritt 2: Leser mit Attraccess koppeln

Ein Leser kann sich nicht selbst registrieren. Er zeigt einen wechselnden Code, den ein Admin einmal freigibt.

1. Der Leser muss die Adresse Ihres Servers kennen. Ein Leser ohne Zugangsdaten startet dann direkt die Kopplung und zeigt einen Code (Touch: auf dem Display und als QR-Code; Lite: als Farbmuster auf dem LED-Ring und im Web-Flasher).
2. Scannen Sie den QR-Code mit Ihrem Smartphone, oder oeffnen Sie in Attraccess die Leser-Seite (**Geraete** > **Attractap-Lesegeraete**), klicken Sie im Block **Nicht gekoppelt** beim wartenden Leser auf **Koppeln** und geben Sie den Code ein.
3. Geben Sie optional einen Namen ein (z.B. "Lasercutter-Leser") und klicken Sie auf **Freigeben**.

Der Leser verbindet sich und ist einsatzbereit. Details, das LED-Muster der Lite-Variante, Sicherheitshinweise und den Ablauf nach dem Upgrade auf Firmware 2.6.0, bei dem jeder Leser neu koppelt, finden Sie unter [Reader koppeln](attractap/pairing.md).

> [!NOTE]
> Zum Freigeben eines Lesegeräts brauchen Sie die Berechtigung `resources.update`. Ein Lesegerät, das sich mit einem Token anmeldet (jede Firmware älter als 1.8.0 und ein nie gekoppeltes Lesegerät mit 1.8.0 bis 2.5.x), kann weder koppeln noch per Funk aktualisiert werden; flashen Sie es zuerst mit dem Web-Flasher (USB) auf Firmware 2.6.0.

## Schritt 3: Ressourcen dem Leser zuweisen

Nach der Kopplung des Lesers muessen Sie festlegen, welche Ressource(n) er steuert:

1. Oeffnen Sie den soeben gekoppelten Leser (er oeffnet sich automatisch; spaeter ueber **Bearbeiten** in seiner Zeile)
2. Oeffnen Sie den Tab **Ressourcen**
3. Waehlen Sie die Ressource (Maschine oder Tuer), die dieser Leser steuern soll
4. Klicken Sie auf **Änderungen speichern**

> [!TIP]
> Ein einzelner Leser kann einer Ressource zugewiesen werden. Wenn Sie mehrere Maschinen steuern muessen, richten Sie fuer jede einen separaten Leser ein.

<!-- TODO: Screenshot der Ressourcenzuweisung zu einem Leser -->

### Optional: Bluetooth-Nutzung durch Plugins erlauben

Im Tab **Allgemein** des Leser-Editors ist der Schalter **Bluetooth-Nutzung durch Plugins erlauben** standardmäßig aus. Wenn aktiviert, können Plugins mit der Berechtigung `BLE_TRANSPORT` in der Nähe dieses Lesers nach Bluetooth-Geräten der von ihnen unterstützten Art suchen und sich mit den für sie eingerichteten Geräten verbinden. Beim Ausschalten werden ihre Bluetooth-Verbindungen über diesen Leser sofort beendet. Plugins können nur die Bluetooth-Profile nutzen, die sie selbst registriert haben; siehe [Bluetooth-Transport für Plugins](plugins/ble-transport.md).

Plugin-Bluetooth braucht einen gekoppelten Leser (Schritt 2) mit Firmware **2.5.0 oder neuer**. Ältere Leser aktualisieren Sie per OTA-Firmware-Update über das Attraccess-Backend; siehe [Firmware-Updates](attractap/firmware-updates.md). Mit älterer Firmware wirkt der Schalter nicht, und Plugins erhalten `READER_UNSUPPORTED`; an einem nicht gekoppelten Leser erhalten sie `READER_OFFLINE`. Ein Leser hält eine Bluetooth-Verbindung zur Zeit: Solange ein Plugin sie nutzt, werden andere Plugins mit `READER_BUSY` abgewiesen und versuchen es später erneut. Kartenanmeldung und der Rest des Lesers funktionieren während der Bluetooth-Nutzung weiter.

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
| Liste der Lesegeräte ist nach einem Server-Update leer | Das Release, das die Token-Anmeldung entfernt (Attractap-Firmware 2.6.0), löscht alle Einträge der Lesegeräte. Koppeln Sie jedes Lesegerät neu, siehe [Nach dem Upgrade](attractap/pairing.md#nach-dem-upgrade-jeder-reader-koppelt-neu) |
| Kartenscan ohne Reaktion | Ueberpruefen Sie, ob die RFID-Karte registriert ist und der Leser eine zugewiesene Ressource hat |

## Siehe auch

- [Ueberblick](attractap/overview.md) -- Was ist Attractap?
- [Reader koppeln](attractap/pairing.md) -- Leser freigeben, Sicherheit und Betrieb
- [Hardware](attractap/hardware.md) -- Hardware-Varianten und Komponenten
- [RFID-Karten](attractap/rfid-cards.md) -- RFID-Karten registrieren und verwalten
- [Ressourcen](resources/overview.md) -- Maschinen und Tueren verwalten
