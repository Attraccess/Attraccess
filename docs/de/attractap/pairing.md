# Reader koppeln und verschlüsselte Verbindung

Ein gekoppelter Reader besitzt einen eigenen Schlüssel und spricht mit dem Server über eine
authentifizierte, verschlüsselte TLS-1.3-Sitzung innerhalb des normalen WebSockets. Einfaches
`ws://` funktioniert, `wss://` ist optional, und der Reader prüft immer, mit welchem Server er
spricht.

Nicht gekoppelte Reader funktionieren unverändert (Anmeldung per Token), ebenso Reader mit
älterer Firmware. Beides ist gleichzeitig am selben Server möglich.

## Reader-Status

| Status                | Bedeutung                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Nicht gekoppelt**   | Der Reader wurde nie gekoppelt. Diesen Status hat jeder Reader nach einem Update des Servers. Er funktioniert weiter wie bisher.  |
| **Kopplung entfernt** | Ein Admin hat die Kopplung entfernt. Der Reader wird innerhalb einer Sekunde getrennt und ist erst nach erneutem Koppeln nutzbar. |
| **Gekoppelt**         | Der Reader ist gekoppelt und kann genutzt und eingerichtet werden.                                                                |

Nur gekoppelte Reader stehen in den Tabellen **Aktiv** und **Veraltet** und lassen sich bearbeiten.
Alle anderen stehen bis zur Kopplung in der Karte **Nicht gekoppelt** über den Tabellen.

## Reader koppeln

Dafür brauchst du die Berechtigung `resources.update` (im Rollen-Editor als **Ressourcen
bearbeiten** angezeigt). Kopplungsaktionen wirken sofort; du musst den Reader danach nicht
speichern.

1. Auf der Reader-Seite listet die Karte **Nicht gekoppelt** jeden Reader, der gekoppelt werden
   muss, jeweils mit Typ (Touch oder Lite), Name und nur einem Button **Koppeln**:
   - Reader, die nie gekoppelt wurden,
   - Reader, deren Kopplung entfernt wurde (du wählst, welcher wartende Reader den Eintrag
     zurückbekommt), und
   - Einträge **Neuer Reader**: zurückgesetzte oder neue Reader. Hier legst du fest, ob es ein
     neuer Reader ist oder einer, der einen vorhandenen Reader übernimmt.

   Der Reader muss eingeschaltet und verbunden sein. Läuft schon eine Kopplung, steht dort
   **Fortsetzen**. Technisch fordert der Server einen nie gekoppelten Reader über seine bestehende
   Token-Verbindung auf, die Kopplung zu starten, und gibt ihm ein einmaliges Ticket, das die
   Kopplung an den Eintrag bindet; der Token selbst wird nie in Kopplungsnachrichten gesendet.

2. Der Dialog zeigt einen Code und einen Countdown von fünf Minuten.
   - **Touch-Reader** zeigen sechs Ziffern, z. B. `471 903`.
   - **Lite-Reader** zeigen acht farbige LED-Segmente. Segment 1 blinkt am Reader als
     Startmarke. Unter den Punkten listet der Dialog die Farbnamen nach Segment nummeriert auf,
     z. B. „1 Rot, 2 Grün, 3 Blau, …“.
3. Vergleiche den Code mit dem Code am Reader. Stimmt er überein, bestätige im Dialog **und** am
   Reader (Touch: **Codes stimmen überein**; Lite: innerhalb von zwei Minuten eine beliebige
   NFC-Karte an den Reader halten – die Karte wird nicht nachgeschlagen, nichts davon wird
   gesendet).
4. Die Kopplung ist nur abgeschlossen, wenn beide Seiten innerhalb von fünf Minuten bestätigen.
   Bei Erfolg bestätigt eine kurze Meldung das und die Einstellungen des Readers öffnen sich, damit
   du ihn einrichten kannst.
   Abbruch, Zeitüberschreitung oder abweichender Code brechen ab; ein neuer Versuch erzeugt immer
   einen neuen Code. Endet eine Kopplung ohne Erfolg, nennt der Dialog den Grund (z. B. am Reader
   abgebrochen, Reader getrennt oder Zeitüberschreitung).

### Einfaches HTTP

Wird die Admin-Seite über einfaches HTTP geöffnet (weder HTTPS noch localhost), zeigt der Dialog
eine Warnung: Wer das Netzwerk kontrolliert, könnte einen gefälschten Code anzeigen. Nutze HTTPS
oder ein vertrauenswürdiges Netz. Die Kopplung wird nicht blockiert.

## Erneut koppeln, Kopplung entfernen

Diese Aktionen findest du im Tab **Kopplung** der Einstellungen eines gekoppelten Readers. Jede
ist direkt neben ihrem Button erklärt.

- **Erneut koppeln**: nutze das, nachdem die Kopplung am Reader selbst zurückgesetzt wurde, oder
  wenn du einen anderen Reader einsetzt, zum Beispiel nach einem Defekt. Name, Maschinen und
  Einstellungen bleiben; die alte Kopplung funktioniert sofort nicht mehr.
- **Kopplung entfernen**: fragt nach einer Bestätigung und trennt den Reader dann innerhalb einer
  Sekunde. Der Reader zeigt „Kopplung entfernt – bitte einen Admin um erneutes Koppeln“, die
  Einstellungen schließen sich, und der Reader wechselt in die Karte **Nicht gekoppelt**. Er fällt
  nie auf die alte Anmeldung zurück.

Für **Erneut koppeln** muss der Reader zuerst als **Neuer Reader**
erscheinen: Setze die Kopplung am Reader selbst zurück und warte einen Moment. Der Dialog zeigt
jeden wartenden Reader mit Typ und seit wann er wartet, damit du den richtigen wählen kannst.

Der **Verlauf** im Tab Kopplung zeigt jede Kopplung und Entfernung mit Benutzer und
Zeitpunkt. Er bleibt auch erhalten, wenn der Reader gelöscht wird.

## Datensicherung

Die Identität der Installation (eine Zertifizierungsstelle für Reader und das Serverzertifikat)
liegt in der Datenbank; die privaten Schlüssel sind mit `AUTH_SESSION_SECRET` verschlüsselt.
**Sichere Datenbank und `AUTH_SESSION_SECRET` gemeinsam.** Geht das Geheimnis verloren oder wird
es geändert, können die Schlüssel nicht mehr gelesen werden und alle Reader müssen neu gekoppelt
werden. Ein Austausch der Zertifizierungsstelle wird nicht unterstützt.

## Reverse-Proxys

Der Reader wählt den Transport über die WebSocket-Subprotokolle `attractap-session.v1`
(verschlüsselte Sitzung) und `attractap-pairing.v1` (Kopplung). Ein Reverse-Proxy muss den Header
`Sec-WebSocket-Protocol` in beide Richtungen durchreichen. Entfernt er den Header, können
gekoppelte Reader keine Verbindung aufbauen und zeigen einen klaren Fehler; sie fallen nie auf eine
unverschlüsselte Verbindung zurück.

Unbekannte `attractap-*`-Subprotokollversionen (z. B. `attractap-session.v2`) lehnt der Server
beim WebSocket-Upgrade mit HTTP 400 ab. Verbindungen ohne Subprotokoll stammen von älteren
Readern und funktionieren weiter mit Token-Anmeldung.

## Metriken

`attraccess_attractap_sessions_active`, `attraccess_attractap_handshake_queue_depth` und
`attraccess_attractap_handshake_failures_total{reason}`.
