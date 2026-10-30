# Reader koppeln und verschlüsselte Verbindung

Ein gekoppelter Reader besitzt einen eigenen Schlüssel und spricht mit dem Server über eine
authentifizierte, verschlüsselte TLS-1.3-Sitzung innerhalb des normalen WebSockets. Einfaches
`ws://` funktioniert, `wss://` ist optional, und der Reader prüft immer, mit welchem Server er
spricht.

Nicht gekoppelte Reader funktionieren unverändert (Anmeldung per Token), ebenso Reader mit
älterer Firmware. Beides ist gleichzeitig am selben Server möglich.

## Reader-Status

| Status                  | Bedeutung                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nicht gekoppelt**     | Der Reader meldet sich mit seinem Token an. Diesen Status hat jeder Reader nach einem Update des Servers.                                                  |
| **Wartet auf Kopplung** | Für den Reader läuft eine Kopplung.                                                                                                                        |
| **Gekoppelt**           | Der Reader hat einen eigenen Schlüssel und ein Zertifikat. Die Anmeldung per Token ist für ihn nicht mehr möglich.                                         |
| **Widerrufen**          | Ein Admin hat die Kopplung widerrufen. Die Verbindung endet innerhalb einer Sekunde und das Gerät erscheint in der Reader-Liste unter **Nicht gekoppelt**. |

## Reader koppeln

Dafür brauchst du die Berechtigung `resources.update` (im Rollen-Editor als **Ressourcen
bearbeiten** angezeigt). Kopplungsaktionen wirken sofort; du musst den Reader danach nicht
speichern.

1. Auf der Reader-Seite listet die Karte **Nicht gekoppelt** über den Reader-Tabellen alles, was
   noch gekoppelt werden muss, jeweils mit nur einem Button **Koppeln**:
   - Reader, die sich mit ihrem Token anmelden, und
   - Geräte, die sich ohne gültige Kopplung gemeldet haben (widerrufen, am Gerät zurückgesetzt
     oder neu). Hier legst du fest, ob es ein neuer Reader ist, ein bestehender Eintrag neu
     gekoppelt oder ersetzt wird.

   Der Reader muss online sein. Bei einem Token-Reader fordert der Server ihn über seine
   bestehende Token-Verbindung auf, die Kopplung zu starten, und gibt ihm dafür ein einmaliges
   Kopplungsticket, das die Kopplung an diesen Eintrag bindet. Der Token selbst wird nie in
   Kopplungsnachrichten gesendet. Läuft schon eine Kopplung, steht dort **Fortsetzen**.

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
   Abbruch, Zeitüberschreitung oder abweichender Code brechen ab; ein neuer Versuch erzeugt immer
   einen neuen Code. Endet eine Kopplung ohne Erfolg, nennt der Dialog den Grund (z. B. am Reader
   abgebrochen, Reader getrennt oder Zeitüberschreitung).

### Einfaches HTTP

Wird die Admin-Seite über einfaches HTTP geöffnet (weder HTTPS noch localhost), zeigt der Dialog
eine Warnung: Wer das Netzwerk kontrolliert, könnte einen gefälschten Code anzeigen. Nutze HTTPS
oder ein vertrauenswürdiges Netz. Die Kopplung wird nicht blockiert.

## Neu koppeln, ersetzen, widerrufen

Diese Aktionen findest du im Tab **Sicherheit** des Reader-Editors eines gekoppelten oder
widerrufenen Readers. Jede ist direkt neben ihrem Button erklärt.

- **Neu koppeln**: gleiches Gerät, neuer Schlüssel. Nutze das, nachdem die Kopplung am Gerät
  zurückgesetzt wurde. Der alte Schlüssel wird widerrufen.
- **Ersetzen**: ein anderes Gerät übernimmt Name, Ressourcen und Einstellungen des Readers, zum
  Beispiel nach dem Tausch defekter Hardware. Der alte Schlüssel wird als ersetzt markiert.
- **Widerrufen**: sperrt den Reader sofort aus. Fragt zuerst nach einer Bestätigung und beendet
  dann die Sitzung. Der Reader zeigt „Kopplung entfernt – bitte einen Admin um erneutes
  Koppeln“, fällt nie auf die Token-Anmeldung zurück, bleibt in der Liste, und das Gerät erscheint
  unter **Nicht gekoppelt**.

Für **Neu koppeln** und **Ersetzen** muss das Gerät zuerst unter **Nicht gekoppelt**
erscheinen: Widerrufe die alte Kopplung oder setze die Kopplung am Gerät zurück, warte, bis es
aufgelistet ist, und wähle dann **Neu koppeln** oder **Ersetzen**. Der Dialog zeigt jedes
wartende Gerät mit Typ, Schlüssel und dem Zeitpunkt, zu dem es sich gemeldet hat, damit du das
richtige auswählen kannst.

Jeder Schlüssel bleibt im **Schlüsselverlauf** des Readers erhalten, auch wenn der Reader gelöscht
wird. Jeder Eintrag zeigt den Schlüssel, die Seriennummer des Zertifikats und den Benutzer, der
ihn ausgelöst hat; der Tab **Sicherheit** zeigt außerdem, wer den Reader gekoppelt hat.

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
