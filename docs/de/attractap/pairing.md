# Reader koppeln und verschlüsselte Verbindung

Ein neuer Attractap-Reader kommt durch **eine einzige Freigabe eines Admins** in deine
Installation. Der Reader zeigt einen kurzen Code, der alle 30 Sekunden wechselt (Touch-Reader auf
dem Display und als QR-Code, Lite-Reader als Farbmuster auf dem LED-Ring). Ein Admin bestätigt
diesen Code in Attraccess. Dieser eine Schritt legt den Reader an, vertraut seinem Schlüssel,
stellt ihm ein Zertifikat aus und lässt ihn die Zertifizierungsstelle deiner Installation
speichern.

Danach spricht der Reader mit dem Server über eine gegenseitig authentifizierte, verschlüsselte
TLS-1.3-Sitzung innerhalb des normalen WebSockets. Einfaches `ws://` funktioniert, `wss://` ist
optional, und der Reader prüft immer, dass er mit _deinem_ Server spricht. Reader können sich nicht
mehr selbst registrieren: Niemand kann einen Reader hinzufügen, ohne dass ein Admin ihn freigibt.

## Reader-Status

| Status                | Bedeutung                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wartet**            | Ein neuer Reader zeigt seinen Code und wartet auf einen Admin. Solange er wartet, steht er als Zeile **Neuer Reader** im Block **Nicht gekoppelt**.                                     |
| **Nicht gekoppelt**   | Ein Reader, der vor dieser Version per Token registriert wurde. Er funktioniert mit seinem Token weiter, bis ein Admin ihn in seiner Zeile koppelt. Die Einstellungen bleiben gesperrt. |
| **Gekoppelt**         | Der Reader hat einen eigenen Schlüssel und ein Zertifikat und kann genutzt und eingerichtet werden.                                                                                     |
| **Kopplung entfernt** | Ein Admin hat die Kopplung entfernt. Der Reader wird innerhalb einer Sekunde getrennt, zeigt „Kopplung entfernt“ und wartet mit einem neuen Schlüssel wieder auf Freigabe.              |

Nur gekoppelte Reader stehen in den Tabellen **Aktive Attractaps** und **Veraltete Attractaps** und lassen sich bearbeiten.

## Neuen Reader koppeln

Dafür brauchst du die Berechtigung `resources.update` (im Rollen-Editor als **Ressourcen
bearbeiten** angezeigt). Die Kopplung wirkt sofort; du musst den Reader danach nicht speichern.

1. Verbinde den Reader mit deinem Netzwerk und trage deine Serveradresse ein (siehe
   [Einrichtung](attractap/setup.md)). Ein Reader ohne Zugangsdaten startet direkt die Kopplung
   und zeigt seinen Code.
2. Lies den Code am Reader ab:
   - **Touch-Reader** zeigen den Code (z. B. `K7P-3XQ`) mit Countdown und einen QR-Code.
     **Scanne den QR-Code** mit dem Smartphone: Er öffnet Attraccess mit eingetragenem Code
     (`<deine Adresse>/?enroll=K7P3XQ`). Melde dich bei Bedarf an und gib den Reader frei. Der
     QR-Code erscheint nur, wenn der Server seine öffentliche Adresse kennt; sonst tippst du den
     Code ein.
   - **Lite-Reader** haben kein Display. Der LED-Ring zeigt ein Farbmuster, und der
     **Web-Flasher** zeigt den Code (siehe unten).
3. Öffne in Attraccess die Reader-Seite (**Geräte** > **Attractap-Lesegeräte**). Der wartende
   Reader steht im Block **Nicht gekoppelt** als **Neuer Reader**. Klicke **Koppeln**, gib den Code
   ein, vergib optional einen Namen und klicke **Freigeben**. Oder folge einfach dem QR-Link: Er
   öffnet denselben Dialog mit eingetragenem Code und zeigt, zu welchem Reader der Code gehört (Typ
   und Firmware).
4. Der Reader zeigt kurz Grün, wechselt in die verschlüsselte Sitzung und ist einsatzbereit. Seine
   Einstellungen öffnen sich, damit du Ressourcen zuweisen kannst.

Codes bestehen aus den Zeichen `23456789ABCDEFGHJKMNPQRSTUVWXYZ`; `0`, `O`, `1`, `I` und `L`
kommen nie vor. Der Code wechselt alle 30 Sekunden; der vorherige Code bleibt bis zum nächsten
Wechsel gültig, ein soeben abgelesener Code funktioniert also noch. Eine wartende Anfrage dauert
höchstens 10 Minuten; danach fragt der Reader mit einem neuen Code erneut an und behält seinen
Schlüssel. Zeigen zufällig zwei Reader gleichzeitig denselben Code, bittet Attraccess dich, auf
den nächsten Code zu warten.

Du kannst auch aus dem Block **Nicht gekoppelt** freigeben: Klicke in der Zeile des Readers auf
**Koppeln** und gib den Code ein, den er zeigt. Touch-Reader verlangen immer den Code: Er beweist, dass du genau diesen
Reader vor dir hast.

### Lite-Reader: LED-Muster

Ein Lite-Reader zeigt das Muster auf seinem Ring aus 24 LEDs, aufgeteilt in **8 Segmente zu je
3 LEDs**:

- Das **Startsegment blinkt**; lies die Segmente von dort **im Uhrzeigersinn**.
- Jedes Segment zeigt eine von sechs Farben: Rot, Grün, Blau, Gelb, Weiß (volle Helligkeit, nicht
  atmend) oder Magenta.
- Ein langsam **weiß atmender** Ring bedeutet, dass der Reader noch kein Muster hat (er verbindet
  sich oder wartet auf den ersten Code). Das ist kein Code.
- Nach der Freigabe blinkt der Ring **grün** bei Erfolg oder **rot**, wenn die Kopplung
  fehlgeschlagen ist.

Vergleiche die acht Farben mit der Farbliste, die die Freigabeseite für den wartenden
Lite-Reader zeigt, und gib den Reader frei. Das Muster wechselt zusammen mit dem Code alle
30 Sekunden. Der LED-Leitfaden für die Lite-Variante liegt nur auf Englisch vor (Seite „LED Guide (Lite)“ der englischen Dokumentation).

Lite-Reader berechnen auch den normalen Code. Öffne den Web-Flasher, verbinde den Reader und
drücke **Freigeben** neben dem angezeigten Code, oder lies die Zeile `Enrollment: code=XXX-XXX`
auf der seriellen Konsole.

## Bereits vorhandenen Reader koppeln

Reader, die vor dieser Version per Token registriert wurden, funktionieren mit diesem Token weiter,
bis sie gekoppelt werden. In ihrer Zeile in der Reader-Liste steht der Button **Koppeln**. Ein
Klick darauf lässt den verbundenen Reader die Kopplung starten und einen Code zeigen. Gib den
Code wie oben frei. Die Kopplung ist an den bestehenden Eintrag gebunden, Name, Maschinen und
Einstellungen bleiben also erhalten. Ist der Reader nicht verbunden, erreicht **Koppeln** ihn
nicht; schalte ihn zuerst ein. Die Einstellungen eines nicht gekoppelten Readers bleiben gesperrt.

Nach der Kopplung fällt ein Reader nie auf seinen Token oder einen unverschlüsselten Kanal
zurück und löscht seine gespeicherte Zertifizierungsstelle und seinen Schlüssel nie aufgrund einer
nicht authentifizierten Nachricht. Scheitert die TLS-Verbindung zum gespeicherten Server, zeigt der
Reader einen Fehler und versucht es erneut; er meldet sich nicht von selbst neu an.

## Kopplung entfernen, erneut koppeln

Diese Aktionen findest du im Tab **Kopplung** der Einstellungen eines gekoppelten Readers.

- **Erneut koppeln**: nutze das, nachdem der Reader zurückgesetzt wurde, oder wenn du einen
  anderen Reader einsetzt (zum Beispiel nach einem Defekt). Der neue Reader zeigt seinen Code, du
  gibst ihn für den bestehenden Eintrag frei. Name, Maschinen und Einstellungen bleiben; die alte
  Kopplung funktioniert sofort nicht mehr.
- **Kopplung entfernen**: fragt nach einer Bestätigung und trennt den Reader dann innerhalb einer
  Sekunde. Er zeigt „Kopplung entfernt“, erzeugt einen **neuen Schlüssel** und wartet wieder auf
  Freigabe. Er nutzt nie seine alte Anmeldung.

Der **Verlauf** im Tab Kopplung zeigt jede Kopplung, jeden Austausch und jede Entfernung mit
Benutzer und Zeitpunkt. Er bleibt auch erhalten, wenn der Reader gelöscht wird.

## Sicherheit

### Einfaches HTTP

Wird die Admin-Seite über einfaches HTTP geöffnet (weder HTTPS noch localhost), zeigt die
Kopplungsseite eine Warnung: Wer das Netzwerk kontrolliert, könnte dir gefälschte Angaben zeigen,
auch einen gefälschten Reader, der nicht deiner ist. Nutze HTTPS oder ein vertrauenswürdiges Netz.
Die Kopplung wird nicht blockiert.

### Was ein Angreifer kann und was nicht

Der Code wird aus den Schlüsseln und Zufallswerten beider Seiten berechnet. Deine Freigabe ist
deshalb an genau den Reader und den Server gebunden, die ihn berechnet haben. Ein Touch-Reader
prüft deinen Server gegen eine Verpflichtung, die er erhalten hat, bevor der Code berechnet wurde.
Ein Angreifer, der **während der Anmeldung aktiv im Netzwerk** ist, kann einen Reader dazu bringen,
dem Angreifer statt deinem Server zu vertrauen. Er kann ihn aber nicht dazu bringen, deinem Server
so zu vertrauen, dass du es freigeben würdest: Der Code am Reader weicht dann vom Code des Servers
ab, und deine Freigabe schlägt fehl („Dieser Code passt nicht zum Reader“). Wird ein richtig abgelesener Code
abgelehnt, höre auf und prüfe das Netzwerk, bevor du es erneut versuchst.

Versuche sind begrenzt: drei pro Minute und Verbindung, zehn pro zehn Minuten und zwanzig
wartende Anfragen pro Adresse, insgesamt 200 wartende Anfragen und fünf falsche Codes pro Admin
und Minute. Damit die Grenzen pro Adresse hinter einem Reverse Proxy funktionieren, setze
`TRUST_PROXY` (siehe unten).

## Betrieb

### Datensicherung

Die Identität der Installation (eine Zertifizierungsstelle für Reader und das Serverzertifikat)
liegt in der Datenbank. Der private Schlüssel der Zertifizierungsstelle und der Serverschlüssel
sind dort **verschlüsselt** gespeichert, mit einem aus `AUTH_SESSION_SECRET` abgeleiteten
Schlüssel; die Zertifikate selbst sind nicht geheim. **Sichere Datenbank und
`AUTH_SESSION_SECRET` gemeinsam.** Geht das Geheimnis verloren oder wird es geändert, können die
Schlüssel nicht mehr entschlüsselt werden und alle Reader müssen neu gekoppelt werden.

### Reverse-Proxys

Der Reader wählt den Transport über die WebSocket-Subprotokolle `attractap-session.v1`
(verschlüsselte Sitzung) und `attractap-pairing.v1` (Kopplung). Ein Reverse-Proxy muss den Header
`Sec-WebSocket-Protocol` in beide Richtungen durchreichen. Entfernt er den Header, können
gekoppelte Reader keine Verbindung aufbauen und zeigen einen klaren Fehler; sie fallen nie auf eine
unverschlüsselte Verbindung zurück.

Unbekannte `attractap-*`-Subprotokollversionen (z. B. `attractap-session.v2`) lehnt der Server
beim WebSocket-Upgrade mit HTTP 400 ab.

Setze [`TRUST_PROXY`](installation/environment-variables.md), damit die Begrenzungen der Kopplung
pro Adresse die echte Adresse des Readers sehen und nicht die des Proxys. Ohne diese Einstellung
teilen sich alle Reader hinter dem Proxy ein Limit.

### Eine Server-Instanz

Attraccess hält wartende Kopplungen und Begrenzungen im Arbeitsspeicher. Betreibe **genau eine
API-Instanz**. Mehrere Instanzen werden nicht koordiniert; ein Reader und ein Admin könnten
dann verschiedene Instanzen erreichen, und die Freigabe schlägt fehl.

### Austausch der Zertifizierungsstelle

Die Zertifizierungsstelle wird einmal pro Installation erzeugt. Ein Austausch ist **nicht
umgesetzt**; es gibt dafür weder einen Button noch einen Befehl. Das Serverzertifikat erneuert
sich selbst.

### Ältere Firmware

| Reader-Firmware              | Verhalten mit diesem Server                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.7.x und älter, registriert | Funktioniert weiter mit seinem Token und wird automatisch per Funk aktualisiert. Danach muss er in seiner Zeile gekoppelt werden (**Koppeln**). Bis dahin bleiben seine Einstellungen gesperrt. |
| 1.7.x und älter, neu         | Kann sich nicht anmelden. Er sendet die alte Registrierungsanfrage und bekommt **keine Antwort**; er wartet. Aktualisiere ihn zuerst mit dem Web-Flasher.                                       |
| 1.8.0 und neuer              | Koppelt mit dem Ablauf auf dieser Seite.                                                                                                                                                        |

### Metriken

`attraccess_attractap_sessions_active`, `attraccess_attractap_handshake_queue_depth` und
`attraccess_attractap_handshake_failures_total{reason}`.
