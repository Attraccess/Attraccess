# Reader-Sicherheit (Secure-Boot-Schlüssel)
<!-- llms-description: Wie Attractap-Touch-V2-Reader über das Netzwerk gesichert werden, damit sie nur mit deinen Schlüsseln signierte Firmware akzeptieren, samt Schlüssel-Backup und Grenzen des Schutzes. -->

Attractap-Touch-V2-Reader können **gesichert** werden: Danach akzeptieren sie nur noch Firmware, die
von _deiner_ Installation signiert ist, und ihr Flash und ihr Einstellungsspeicher sind verschlüsselt.
Diese Seite beschreibt die Schlüssel, die deine Installation dafür braucht, wie du einen Reader über das
Netzwerk sicherst und wogegen ein gesicherter Reader schützt und wogegen nicht.

> **Verfügbarkeit:** Die Schaltfläche **Diesen Reader sichern** erscheint nur bei Reader-Varianten, deren
> sichere Firmware auf echter Hardware geprüft ist. Bis dahin ist sie ausgeblendet und die Reader bleiben,
> wie sie sind; die Schlüssel kannst du schon jetzt erstellen und sichern.

## Identität und Sicherheitsstatus des Readers

Die Identität eines Readers ist der P-256-Schlüssel, den er selbst erzeugt und dem deine Installation
vertraut, sobald ein Admin ihn [gekoppelt](attractap/pairing.md) hat. Auf einem Reader mit sicherer
Firmware schützen Flash-Verschlüsselung und NVS-Verschlüsselung diesen Schlüssel.

Ein sicherer Reader meldet bei jeder Verbindung seine Sicherheitseinstellungen (eFuses), und der Tab
**Kopplung** im Reader-Editor zeigt **Gesichert** oder **Nicht gesichert** samt den Einstellungen, die
nicht passen (siehe [Sichere Reader](attractap/pairing.md#sichere-reader)). Für **Gesichert** braucht der Server außerdem die Fingerabdrücke der Secure-Boot-Schlüssel des Readers,
die er beim Sichern des Readers speichert (siehe [Einen Reader sichern](#einen-reader-sichern)). Ein
Reader mit sicherer Firmware ohne diese Fingerabdrücke, zum Beispiel ein Reader aus dem Gerätelabor,
zeigt **Nicht gesichert**.

Reader-Liste und Reader-Editor zeigen diese Chips:

| Chip                                       | Bedeutung                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gesichert**                              | Der letzte Sicherheitsbericht passte zum sicheren Release-Profil und zu den Secure-Boot-Schlüsseln, die diese Installation gespeichert hat.                  |
| **Laborschlüssel (nicht gesichert)**       | Der Reader läuft mit einem Gerätelabor-Build, signiert mit den öffentlichen Laborschlüsseln. Jeder kann Firmware dafür signieren; er wird nie gesichert. |
| Sicherungsschritt (z. B. **Übertragung**)  | Für diesen Reader läuft gerade **Diesen Reader sichern**.                                                                                                 |

Öffne **Einstellungen → Reader-Sicherheit** (Berechtigung `system.settings.manage`).

## Die zwei Schlüssel

| Schlüssel                       | Zweck                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Signaturschlüssel**           | Signiert die Firmware, die deine Reader akzeptieren. Der Server speichert ihn verschlüsselt mit einem aus `AUTH_SESSION_SECRET` abgeleiteten Schlüssel.                                                            |
| **Wiederherstellungsschlüssel** | Ein Ersatz, dem jeder gesicherte Reader ebenfalls vertraut. Du lädst ihn einmal herunter, bewahrst ihn offline auf und weist nach, dass du ihn hast. Dann löscht der Server seine Kopie des privaten Schlüssels. |

Beide sind RSA-3072-Schlüssel. Die Seite zeigt nur ihre Fingerabdrücke.

## Einrichten

1. Klicke auf **Schlüssel erstellen**. Der Status lautet _Schlüssel erstellt, Prüfung des Wiederherstellungsschlüssels offen_.
2. Klicke auf **Wiederherstellungsschlüssel herunterladen**, wähle eine Passphrase mit mindestens
   12 Zeichen (zweimal eingeben) und bewahre Datei und Passphrase sicher auf. Der Download lässt sich
   wiederholen, bis die Prüfung bestanden ist.
3. Klicke auf **Wiederherstellungsschlüssel prüfen**, lade die Datei hoch und gib die Passphrase ein.
   Passt sie, löscht der Server seine Kopie des privaten Wiederherstellungsschlüssels und der Status
   wird **Bereit**.

Vor Schritt 3 kann kein Reader gesichert werden. Das erzwingt der Server, nicht nur die Seite.

## Backup

- **Backup des Signaturschlüssels herunterladen** ist möglich, sobald Schlüssel existieren. Es verlangt
  eine Passphrase mit mindestens 12 Zeichen (zweimal eingeben), genau wie beim Wiederherstellungsschlüssel.
  Bewahre Datei und Passphrase auf.
- Sichere außerdem `AUTH_SESSION_SECRET` (ohne ihn lassen sich die gespeicherten Schlüssel nicht
  entschlüsseln), die Datenbank und die Wiederherstellungsdatei samt Passphrase.
- Datenbank-Backups von vor der Prüfung enthalten noch den privaten Wiederherstellungsschlüssel,
  verschlüsselt mit `AUTH_SESSION_SECRET`. Schütze sie wie die Wiederherstellungsdatei.

> **Warnung:** Der Signaturschlüssel des Servers geht verloren, wenn die Datenbank oder
> `AUTH_SESSION_SECRET` verloren geht. Hast du dann weder ein Backup des Signaturschlüssels noch den
> Wiederherstellungsschlüssel, können gesicherte Reader nie wieder aktualisiert werden.

Die heruntergeladenen Dateien sind verschlüsselte PKCS#8-PEM-Dateien. `openssl` liest sie mit der
Passphrase. `espsecure` kann verschlüsselte Schlüssel nicht lesen, entschlüssele deshalb zuerst eine
temporäre Kopie, zum Beispiel um eine Notfall-Firmware mit dem Wiederherstellungsschlüssel zu signieren
(Syntax von esptool 5.x; ältere Versionen nutzen `espsecure.py sign_data`):

```bash
umask 077                                    # nur du kannst die unverschlüsselte Kopie lesen
openssl pkey -in attraccess-recovery-key.pem -out /dev/shm/recovery-key-plain.pem   # fragt nach der Passphrase
espsecure sign-data --version 2 --keyfile /dev/shm/recovery-key-plain.pem --output app-signed.bin app.bin
rm /dev/shm/recovery-key-plain.pem           # /dev/shm liegt im Arbeitsspeicher, nichts landet auf der Platte
```

## Wiederherstellen

**Wiederherstellen** akzeptiert ein Backup des Signaturschlüssels oder die Wiederherstellungsdatei,
jeweils mit Passphrase, so wie sie von dieser Seite heruntergeladen wurden (unverschlüsselte
Schlüsseldateien und die öffentlichen Laborschlüssel werden abgelehnt). Es ist nur möglich, wenn die
Installation keinen nutzbaren Signaturschlüssel hat (keinen, oder einen, der sich nicht mehr
entschlüsseln lässt, weil sich `AUTH_SESSION_SECRET` geändert hat) oder kein Reader mit dem aktuellen
gesichert ist. Existieren schon Schlüssel, ersetzt die Wiederherstellung den aktuellen
Signaturschlüssel. Sind Reader mit einem Schlüssel gesichert, der sich nicht mehr entschlüsseln lässt,
wird nur ein Schlüssel angenommen, dem diese Reader vertrauen (das Backup des Signaturschlüssels oder
die Wiederherstellungsdatei).

Nach einer Wiederherstellung aus der **Wiederherstellungsdatei** wird dieser Schlüssel zum
Signaturschlüssel (die Reader vertrauen ihm als zweitem Schlüssel) und es wird ein **neuer
Wiederherstellungsschlüssel** erzeugt. Der Status zeigt _Wiederhergestellt, Prüfung des
Wiederherstellungsschlüssels offen_, bis der neue Wiederherstellungsschlüssel die Prüfung bestanden hat;
vorher kann kein weiterer Reader gesichert werden.

Eine Wiederherstellung aus einem **Backup des Signaturschlüssels** ersetzt nur den Signaturschlüssel;
Wiederherstellungsschlüssel und sein Status bleiben unverändert. Ein Schlüssel, der bereits der
Signaturschlüssel ist, wird abgelehnt, ebenso die Wiederherstellungsdatei, wenn sie als Backup des
Signaturschlüssels hochgeladen wird. Hat die Installation keinen nutzbaren Wiederherstellungsschlüssel,
wird ein neuer erzeugt, der die Prüfung bestehen muss.

**Schlüssel neu erzeugen** ersetzt beide Schlüssel, Wiederherstellungsdateien und Backups der alten
Schlüssel sind danach nutzlos. Es ist nur möglich, solange bei keinem Reader die Schlüssel dieser
Installation eingebrannt sind.

## Einen Reader sichern

Das Sichern macht aus einem gekoppelten Reader mit der normalen (einfachen) Firmware einen gesicherten
Reader, über das Netzwerk und ohne ihn zu öffnen. Der Reader behält seine Kopplung und seine Einstellungen.

### Bevor du anfängst

Die Schaltfläche **Diesen Reader sichern** liegt im Tab **Kopplung** des Reader-Editors, im
Sicherheitsbereich. Sie ist deaktiviert, und ein Tooltip nennt den Grund, solange nicht alles hiervon gilt:

- Du hast die Berechtigung `system.settings.manage`.
- Die Schlüssel sind **Bereit**: Die Prüfung des Wiederherstellungsschlüssels ist bestanden (das erzwingt
  der Server).
- Der Reader ist gekoppelt und online.
- Die Firmware des Readers unterstützt das Sichern (aktualisiere sie zuerst, wenn der Tooltip das sagt).
- Der Reader läuft mit einem Release-Build einer regulären Variante: kein Entwicklungs-, Demo-, Debug-
  oder Labor-Build.
- Gerade wird kein anderer Reader gesichert. Eine Installation sichert immer nur einen Reader gleichzeitig.

Stelle außerdem sicher, dass

- der Reader während des ganzen Ablaufs zuverlässig mit Strom versorgt ist und niemand ihn absteckt;
- du ein **Backup des Signaturschlüssels** und den **Wiederherstellungsschlüssel** samt Passphrasen hast,
  dazu Backups der Datenbank und von `AUTH_SESSION_SECRET` (siehe [Backup](#backup)). Ohne sie lässt sich
  ein gesicherter Reader unter Umständen nie wieder aktualisieren.

### Ablauf

1. Klicke auf **Diesen Reader sichern**. Eine Warnung erklärt die Risiken: die zwei kurzen Zeiträume, in
   denen ein Stromausfall den Reader unbrauchbar machen kann, dass der Reader Strom behalten muss, dass er
   danach nicht mehr aus dem Browser oder per USB geflasht werden kann, dass er nur noch von dieser
   Installation signierte Updates annimmt und dass ein Umzug in eine andere Installation nicht unterstützt
   wird. Sie erinnert dich auch an deine Schlüssel-Backups.
2. Gib zur Bestätigung den Namen des Readers ein.
3. Der Server fordert vom Reader einen **Vorabprüfungs**-Bericht an und zeigt das Ergebnis als Liste:
   Chip, Flash-Größe, Partitionstabelle, freie Schlüsselblöcke, Secure Boot und Flash-Verschlüsselung noch
   aus, freier Speicher, Variante und Firmware-Profil. Am Reader wird dabei noch nichts verändert. Schlägt
   eine Prüfung fehl, kann der Ablauf nicht starten.
4. Klicke auf **Starten**. Die Fortschrittsansicht aktualisiert sich etwa alle 2 Sekunden und zeigt den
   aktuellen Schritt und den Übertragungsfortschritt in Prozent.

Der Ablauf durchläuft diese Schritte:

| Schritt                     | Was passiert                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vorabprüfung**            | Der Reader meldet seine Hardware und Sicherheitseinstellungen, der Server prüft sie.                                                                                                                          |
| **Übertragung**             | Der Reader lädt die sichere Firmware und den Bootloader herunter, beide von dieser Installation signiert, legt ein Backup seiner Kopplung und Einstellungen an und prüft beide Signaturen.                     |
| **Schlüssel eingebrannt**   | Der Server hat die Fingerabdrücke von Signatur- und Wiederherstellungsschlüssel gespeichert. Der Reader schreibt sie dauerhaft in seine eFuses und meldet zurück, was er dort gelesen hat.                     |
| **Bootloader geschrieben**  | Der Reader macht die alte Firmware unstartbar, schreibt den neuen Bootloader, prüft ihn und startet neu.                                                                                                      |
| **Verschlüsselung**         | Der neue Bootloader schaltet Secure Boot ein und verschlüsselt den Flash. Der Reader ist in diesem Schritt offline.                                                                                           |
| **Migration**               | Die sichere Firmware verschlüsselt den Einstellungsspeicher, stellt Kopplung und Einstellungen aus dem Backup wieder her, prüft sie, löscht das Backup und sperrt den Leseschutz der eFuses.                   |
| **Gesichert**               | Der Reader verbindet sich wieder und sein Sicherheitsbericht besteht die Prüfung.                                                                                                                             |

Der Server speichert die Schlüssel-Fingerabdrücke, _bevor_ er den Reader anweist, sie zu schreiben, und er
speichert die Rückmeldung des Readers, bevor er weitermacht. Meldet der Reader andere Werte, bricht der
Ablauf mit _Schlüssel stimmen nicht überein_ ab.

### Nicht abstecken: die zwei kritischen Zeiträume

In zwei Zeiträumen kann ein Stromausfall den Reader unbrauchbar machen. Der Reader zeigt währenddessen
bildschirmfüllend **Nicht abstecken**, und die Fortschrittsansicht zeigt einen Hinweis:

1. **Schreiben des Bootloaders** (Ende von _Bootloader geschrieben_): etwa _N_ Sekunden (wird noch gemessen).
2. **Einschalten von Secure Boot und Verschlüsseln des Flashs** (_Verschlüsselung_ und direkt danach
   _Migration_): etwa _N_ Minuten (wird noch gemessen).

Außerhalb dieser Zeiträume schadet eine Unterbrechung nicht: Der Ablauf pausiert und geht weiter, sobald
der Reader wieder da ist.

### Abbrechen, Fehler und erneuter Versuch

- **Abbrechen** ist möglich, bis die Schlüssel eingebrannt sind (_Vorabprüfung_ und _Übertragung_). Der
  Reader löscht, was er heruntergeladen hat, und läuft mit seiner bisherigen Firmware weiter.
- **Geht der Reader offline**, bevor der Bootloader geschrieben ist, pausiert der Ablauf nur. Verbindet er
  sich wieder, geht es dort weiter, wo er aufgehört hat, zum Beispiel an derselben Stelle der Übertragung.
- **Fehlgeschlagen** zeigt den Grund, zum Beispiel eine fehlgeschlagene Vorabprüfung, eine ungültige
  Signatur, ein abgelehntes oder abweichendes Einbrennen der Schlüssel oder eine fehlgeschlagene
  Sicherheitsprüfung nach dem Sichern. **Erneut versuchen** wird angeboten, wenn es sicher ist: wenn der
  Ablauf fehlschlug, bevor der Bootloader geschrieben war. Nach dem Einbrennen der Schlüssel prüft ein
  erneuter Versuch die heruntergeladene Firmware noch einmal und macht dort weiter.
- **Unterbrochen** heißt: Der Reader ist seit mehr als 15 Minuten offline, nachdem der Bootloader
  geschrieben wurde, und noch nicht gesichert. Er hat womöglich in einem kritischen Zeitraum den Strom
  verloren. Bring ihn wieder online; verbindet er sich, geht der Ablauf mit dem weiter, was der Reader
  meldet. Tut er es nicht, muss er vermutlich ersetzt werden.

### Nach dem Sichern

- Der Reader startet nur noch Firmware, die diese Installation signiert hat. Updates kommen wie gewohnt
  über das Netzwerk; der Server signiert jedes Update für diesen Reader und bietet nie eines mit einer
  niedrigeren Sicherheitsversion an, als der Reader schon hat.
- Der Reader lässt sich nicht mehr aus dem Browser oder per USB flashen und hat keine USB-Konsole.
- Hat der Server keinen Schlüssel mehr, dem der Reader vertraut (zum Beispiel nach dem Verlust der
  Datenbank ohne Backup), zeigt der Reader-Editor **Kein Signaturschlüssel für diesen Reader**, und der
  Reader bekommt keine Updates mehr. Stelle das Backup des Signaturschlüssels oder die
  Wiederherstellungsdatei wieder her (siehe [Wiederherstellen](#wiederherstellen)).
- Du kannst das Registrieren und Zurücksetzen von Karten auf gesicherte Reader beschränken: Wähle unter
  **Einstellungen → RFID-Kartenregistrierung** die Option **Nur gesicherten Readern** (siehe
  [RFID-Karten](attractap/rfid-cards.md#welche-reader-karten-registrieren-und-zurücksetzen-dürfen)).
- Ein gesicherter Reader gehört zu dieser Installation. Ihn oder die Schlüssel in eine andere Installation
  umzuziehen wird nicht unterstützt. Das Entfernen der Kopplung macht das Sichern nicht rückgängig; der
  Reader kann wieder mit derselben Installation gekoppelt werden.

## Einrichtung per Bluetooth

Reader nehmen PIN, WLAN und Serveradresse per Bluetooth an ([Attractap Einrichtung](attractap/setup.md#per-bluetooth-einrichten)),
gesicherte Reader ebenfalls, denn sie haben keine USB-Einrichtung:

- Nur solange der Reader **nicht gekoppelt** ist: Ein gekoppelter Reader öffnet die Bluetooth-Einrichtung nie.
- Nur über eine **verschlüsselte** Verbindung (Bluetooth LE Secure Connections). Jedes Einrichtungsfenster nutzt
  eine neue Bluetooth-Adresse und speichert keine Kopplung: Ein Computer koppelt sich für jedes Fenster neu.
- Mit **denselben PIN-Regeln** wie per USB: Sobald eine PIN gesetzt ist, braucht jede Änderung sie.
- Nach **5 falschen PINs** lehnt der Reader jeden Befehl ab, der die PIN braucht, auch die richtige, bis jemand am
  Gerät ihn zurücksetzt: kurz vom Strom trennen oder beim Touch **Bluetooth-Einrichtung** drücken, sobald das
  Fenster geschlossen ist. Eigene Neustarts des Readers behalten den Zähler.
- Ein gesicherter Reader hat weiterhin **keinen USB-Konfigurator**: Seine USB-Konsole bleibt aus.

Da ein ungekoppelter Reader die Einrichtung nach dem Start 10 Minuten lang von selbst öffnet, kann ihn in dieser
Zeit jeder in Bluetooth-Reichweite einrichten, solange keine PIN gesetzt ist; ist sie gesetzt, geht es nur mit
ihr. Beim Touch ist das nicht mehr, als seine Einstellungen auf dem Display ohnehin erlauben; ein Lite oder ein
gesicherter Reader, die bisher ein Kabel brauchten oder gar keine Einrichtung hatten, lassen sich jetzt aus der
Nähe einrichten. Setzen Sie die PIN zuerst. Für einen gekoppelten Reader gilt das nie. Ein so eingerichteter Reader
kann trotzdem nichts tun, bis ein Admin seine Kopplung in Attraccess freigibt: Geben Sie nur den Reader frei, den
Sie erwarten (vergleichen Sie Code oder Farbmuster).

## Angreifermodell und Grenzen

Ein gesicherter Reader schützt gegen einen Angreifer, der das Gehäuse öffnen und bis zu etwa 7 Tage mit
üblichen Werkzeugen und einem Budget von etwa 1.000 EUR daran arbeiten kann: Ein solcher Angreifer soll
keine eigene Firmware darauf ausführen, seinen Kopplungsschlüssel oder seine Einstellungen nicht aus dem
Flash lesen und ihn nicht als gesichert ausgeben können.

Was er nicht verspricht:

- Keinen Schutz gegen Fehlerinjektion (Glitching), Seitenkanal- oder invasive Angriffe auf den Chip. Das
  schließt das Espressif-Advisory AR2026-005 ein.
- Der Sicherheitsbericht ist die eigene Aussage des Readers, gelesen von seiner Firmware, keine
  Remote-Attestierung: Ein Reader, dessen Firmware mit einem der obigen Angriffe ersetzt wurde, könnte
  alles melden.
- Widerruf und Rotation der Schlüssel bereits gesicherter Reader werden noch nicht unterstützt.
- Ein gesicherter Reader kann nicht in eine andere Installation umziehen.
