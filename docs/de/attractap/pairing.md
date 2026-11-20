# Reader koppeln und verschlüsselte Verbindung
<!-- llms-description: Wie ein Leser mit einer Admin-Freigabe in die Installation aufgenommen wird: Status, erneutes Koppeln und verschlüsselte Verbindung. -->

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

| Status                | Bedeutung                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wartet**            | Ein neuer Reader zeigt seinen Code und wartet auf einen Admin. Solange er wartet, steht er als Zeile **Neuer Reader** im Block **Nicht gekoppelt**.                                                                          |
| **Gekoppelt**         | Der Reader hat einen eigenen Schlüssel und ein Zertifikat und kann genutzt und eingerichtet werden.                                                                                                                          |
| **Kopplung entfernt** | Ein Admin hat die Kopplung entfernt. Der Reader wird innerhalb einer Sekunde getrennt, zeigt „Kopplung entfernt“ und wartet mit einem neuen Schlüssel wieder auf Freigabe. Sein Eintrag bleibt im Block **Nicht gekoppelt**. |

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
Schlüssel. Das ist kein Fehler: Der Reader zeigt keine Störung und wartet nur kurz auf seinen
nächsten Code. Zeigen zufällig zwei Reader gleichzeitig denselben Code, bittet Attraccess dich, auf
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
- Ein langsam **weiß atmender** Ring bedeutet, dass der Reader noch kein Muster hat (er hat die
  Kopplung angefragt und wartet auf den ersten Code, hat die Verbindung verloren, oder seine
  Anfrage ist nach 10 Minuten abgelaufen). Das ist kein Code.
- Nach der Freigabe blinkt der Ring **grün** bei Erfolg oder **rot**, wenn die Kopplung
  fehlgeschlagen ist. Eine einfach abgelaufene Anfrage blinkt nicht rot.

Vergleiche die acht Farben mit der Farbliste, die die Freigabeseite für den wartenden
Lite-Reader zeigt, und gib den Reader frei. Das Muster wechselt zusammen mit dem Code alle
30 Sekunden. Der LED-Leitfaden für die Lite-Variante liegt nur auf Englisch vor (Seite „LED Guide (Lite)“ der englischen Dokumentation).

Lite-Reader berechnen auch den normalen Code. Öffne den Web-Flasher, verbinde den Reader und
drücke **Freigeben** neben dem angezeigten Code, oder lies die Zeile `Enrollment: code=XXX-XXX`
auf der seriellen Konsole.

## Nach dem Upgrade: jeder Reader koppelt neu

Reader melden sich nicht mehr mit einem Token an. Die Server-Version, die das einführt, entfernt beim
ersten Start alle Reader-Einträge: Die Reader-Liste ist danach leer, und der Server verhält sich, als
hätte er nie einen Reader gekannt. Das gilt auch für Reader, die schon gekoppelt waren. **Jeder Reader
muss mit den Schritten oben neu gekoppelt werden**; Ressourcen, Namen und Einstellungen pro Reader müssen
neu eingerichtet werden, und die Einstellung für das Schreiben von Karten nennt keinen Reader mehr.
Karten, Benutzer und Ressourcen bleiben unberührt.

Ein Reader mit Firmware 2.6.0 oder neuer ohne Zertifikat geht direkt in die Kopplung und zeigt seinen
Code. Ein Reader, der schon über die verschlüsselte Verbindung gekoppelt war (Firmware 1.8.0 bis 2.5.x),
behält seinen Schlüssel, aber der Server kennt ihn nicht mehr. Bei der nächsten Verbindung teilt der
Server ihm mit, dass seine Kopplung nicht mehr gilt, und er zeigt seinen Code wieder.

**Reader mit Firmware älter als 2.6.0, die nur einen Token kennen, lassen sich nicht mehr per Funk
aktualisieren**: Das Update läuft über die verschlüsselte Verbindung. Flashe sie per USB mit dem
Web-Flasher; sie starten dann mit Firmware 2.6.0 und koppeln wie ein neuer Reader. Ein solcher Reader,
der sich weiter mit einem Token anmelden will, wird schon beim Verbindungsaufbau abgewiesen: Der Server
protokolliert `token sign-in no longer supported` und legt nichts an.

Kann der Server nicht beweisen, dass er deine Installation ist, zeigt ein Touch-Reader auf seinem
Verbindungsbildschirm **Server konnte nicht überprüft werden** und versucht es alle 30 Sekunden
erneut; ein Lite-Reader blinkt bei jedem gescheiterten Versuch **rot**. Er meldet sich nicht von
selbst neu an und löscht seine gespeicherte Zertifizierungsstelle und seinen Schlüssel nie aufgrund
einer nicht authentifizierten Nachricht.

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

### Sichere Reader

Ein Reader mit einer sicheren Firmware (Secure Boot und Flash-Verschlüsselung) sendet dem Server bei
jeder Verbindung einen Bericht über seine Sicherheitseinstellungen. Der Server vergleicht ihn mit dem
sicheren Profil und zeigt im Tab **Kopplung** des Readers **Gesichert** oder **Nicht gesichert** samt
den Einstellungen, die nicht passen. Nur ein Release-Build einer regulären Variante, der mit seinem
gekoppelten Schlüssel verbunden ist, kann gesichert werden; Labor-Build (Entwicklungsmodus), einfacher
Build, Demo- und Debug-Build werden nie gesichert, egal was der Bericht sagt. Ein fehlschlagender
Bericht und das Entfernen der Kopplung setzen den Status zurück. Der Bericht ist die eigene Aussage des
Readers und kein Hardware-Nachweis; einfache Reader zeigen hier nichts.

Für **Gesichert** braucht der Server außerdem die Fingerabdrücke der Secure-Boot-Schlüssel des Readers,
die er erst beim Sichern des Readers speichert. Dieser Ablauf ist noch nicht verfügbar, deshalb zeigen
sichere Reader vorerst **Nicht gesichert**. Siehe
[Reader-Sicherheit](attractap/reader-security.md#identität-und-sicherheitsstatus-des-readers).

### Was ein Angreifer kann und was nicht

Der Code wird aus den Schlüsseln und Zufallswerten beider Seiten berechnet. Deine Freigabe ist
deshalb an genau den Reader und den Server gebunden, die ihn berechnet haben. Ein Touch-Reader
prüft deinen Server gegen eine Verpflichtung, die er erhalten hat, bevor der Code berechnet wurde.
Ein Angreifer, der **während der Anmeldung aktiv im Netzwerk** ist, kann einen Reader dazu bringen,
dem Angreifer statt deinem Server zu vertrauen. Er kann ihn aber nicht dazu bringen, deinem Server
so zu vertrauen, dass du es freigeben würdest: Der Code am Reader weicht dann vom Code des Servers
ab, und deine Freigabe schlägt fehl („Dieser Code passt nicht zum Reader“). Wird ein richtig abgelesener Code
abgelehnt, höre auf und prüfe das Netzwerk, bevor du es erneut versuchst. Der Reader berechnet
einen neuen Code nur im 30-Sekunden-Takt deines Servers; ein Angreifer kann ihn also nicht schneller
durch Codes jagen, um einen passenden zu finden.

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
`AUTH_SESSION_SECRET` gemeinsam.** Geht das Geheimnis verloren oder wird es geändert, ohne die
gespeicherten Schlüssel umzuschlüsseln, können die Schlüssel nicht mehr entschlüsselt werden und
alle Reader müssen neu gekoppelt werden. Um das Geheimnis zu wechseln, folgen Sie den Schritten in
den [Sicherheitseinstellungen](settings/security.md); sie schlüsseln diese Schlüssel mit um.

### Reverse-Proxys

Der Reader wählt den Transport über die WebSocket-Subprotokolle `attractap-session.v1`
(verschlüsselte Sitzung) und `attractap-pairing.v1` (Kopplung). Ein Reverse-Proxy muss den Header
`Sec-WebSocket-Protocol` in beide Richtungen durchreichen. Entfernt er den Header, können
gekoppelte Reader keine Verbindung aufbauen: Ab dem zweiten gescheiterten Versuch in Folge zeigt ein
Touch-Reader auf seinem Verbindungsbildschirm **Sichere Verbindung fehlgeschlagen. Server oder Proxy
prüfen.**, und ein Lite-Reader blinkt nach jedem gescheiterten Versuch **rot**. Sie versuchen es weiter und
fallen nie auf eine unverschlüsselte Verbindung zurück.

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

| Reader-Firmware | Verhalten mit diesem Server                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| älter als 1.8.0 | Kann sich nicht verbinden: Er kennt nur die Token-Anmeldung oder die alte Registrierungsanfrage. Flashe ihn mit dem Web-Flasher (USB).                                               |
| 1.8.0 bis 2.5.x | Über die verschlüsselte Verbindung gekoppelt: zeigt nach dem Upgrade seinen Code wieder und koppelt neu. Meldet sich noch per Token an (nie gekoppelt): flashe zuerst 2.6.0 per USB. |
| 2.6.0 und neuer | Koppelt mit dem Ablauf auf dieser Seite und bietet nie einen Token an.                                                                                                               |

### Metriken

`attraccess_attractap_sessions_active`, `attraccess_attractap_handshake_queue_depth` und
`attraccess_attractap_handshake_failures_total{reason}`.
