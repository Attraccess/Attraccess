# Reader-Sicherheit (Secure-Boot-Schlüssel)

Attractap-Touch-V2-Reader können **abgesichert** werden: Danach akzeptieren sie nur noch Firmware, die
von _deiner_ Installation signiert ist, ihr Flash ist verschlüsselt und ihre Server-Identität ist an den
Chip gebunden. Diese Seite beschreibt die Schlüssel, die deine Installation dafür braucht. Einen Reader
abzusichern ist noch nicht verfügbar; die Schaltfläche erscheint in einer späteren Version, sobald der
Ablauf auf echter Hardware geprüft ist.

Öffne **Einstellungen → Reader-Sicherheit** (Berechtigung `system.settings.manage`).

## Die zwei Schlüssel

| Schlüssel                       | Zweck                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Signaturschlüssel**           | Signiert die Firmware, die deine Reader akzeptieren. Der Server speichert ihn verschlüsselt mit einem aus `AUTH_SESSION_SECRET` abgeleiteten Schlüssel.                                                            |
| **Wiederherstellungsschlüssel** | Ein Ersatz, dem jeder abgesicherte Reader ebenfalls vertraut. Du lädst ihn einmal herunter, bewahrst ihn offline auf und weist nach, dass du ihn hast. Dann löscht der Server seine Kopie des privaten Schlüssels. |

Beide sind RSA-3072-Schlüssel. Die Seite zeigt nur ihre Fingerabdrücke.

## Einrichten

1. Klicke auf **Schlüssel erstellen**. Der Status lautet _Schlüssel erstellt, Prüfung des Wiederherstellungsschlüssels offen_.
2. Klicke auf **Wiederherstellungsschlüssel herunterladen**, wähle eine Passphrase mit mindestens
   12 Zeichen (zweimal eingeben) und bewahre Datei und Passphrase sicher auf. Der Download lässt sich
   wiederholen, bis die Prüfung bestanden ist.
3. Klicke auf **Wiederherstellungsschlüssel prüfen**, lade die Datei hoch und gib die Passphrase ein.
   Passt sie, löscht der Server seine Kopie des privaten Wiederherstellungsschlüssels und der Status
   wird **Bereit**.

Vor Schritt 3 kann kein Reader abgesichert werden. Das erzwingt der Server, nicht nur die Seite.

## Sichern

- **Backup des Signaturschlüssels herunterladen** ist möglich, sobald Schlüssel existieren. Es verlangt
  eine Passphrase mit mindestens 12 Zeichen (zweimal eingeben), genau wie beim Wiederherstellungsschlüssel.
  Bewahre Datei und Passphrase auf.
- Sichere außerdem `AUTH_SESSION_SECRET` (ohne ihn lassen sich die gespeicherten Schlüssel nicht
  entschlüsseln), die Datenbank und die Wiederherstellungsdatei samt Passphrase.
- Datenbank-Backups von vor der Prüfung enthalten noch den privaten Wiederherstellungsschlüssel,
  verschlüsselt mit `AUTH_SESSION_SECRET`. Schütze sie wie die Wiederherstellungsdatei.

> **Warnung:** Der Signaturschlüssel des Servers geht verloren, wenn die Datenbank oder
> `AUTH_SESSION_SECRET` verloren geht. Hast du dann weder ein Backup des Signaturschlüssels noch den
> Wiederherstellungsschlüssel, können abgesicherte Reader nie wieder aktualisiert werden.

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
abgesichert ist. Existieren schon Schlüssel, ersetzt die Wiederherstellung den aktuellen
Signaturschlüssel. Sind Reader mit einem Schlüssel abgesichert, der sich nicht mehr entschlüsseln lässt,
wird nur ein Schlüssel angenommen, dem diese Reader vertrauen (das Backup des Signaturschlüssels oder
die Wiederherstellungsdatei).

Nach einer Wiederherstellung aus der **Wiederherstellungsdatei** wird dieser Schlüssel zum
Signaturschlüssel (die Reader vertrauen ihm als zweitem Schlüssel) und es wird ein **neuer
Wiederherstellungsschlüssel** erzeugt. Der Status zeigt _Wiederhergestellt, Prüfung des
Wiederherstellungsschlüssels offen_, bis der neue Wiederherstellungsschlüssel die Prüfung bestanden hat;
vorher kann kein weiterer Reader abgesichert werden.

Eine Wiederherstellung aus einem **Backup des Signaturschlüssels** ersetzt nur den Signaturschlüssel;
Wiederherstellungsschlüssel und sein Status bleiben unverändert. Ein Schlüssel, der bereits der
Signaturschlüssel ist, wird abgelehnt, ebenso die Wiederherstellungsdatei, wenn sie als Backup des
Signaturschlüssels hochgeladen wird. Hat die Installation keinen nutzbaren Wiederherstellungsschlüssel,
wird ein neuer erzeugt, der die Prüfung bestehen muss.

**Schlüssel neu erzeugen** ersetzt beide Schlüssel, Wiederherstellungsdateien und Backups der alten
Schlüssel sind danach nutzlos. Es ist nur möglich, solange bei keinem Reader die Schlüssel dieser
Installation eingebrannt sind.

## Grenzen

- Widerruf und Rotation der Schlüssel bereits abgesicherter Reader werden noch nicht unterstützt.
- Ein abgesicherter Reader kann nicht in eine andere Installation umziehen.
- Der Schutz richtet sich gegen Angreifer mit kurzem physischem Zugriff. Er macht keine Aussagen gegen
  Glitching, Seitenkanal- oder invasive Angriffe, und das DS-Modul (Digital Signature) des Chips belegt
  die Schlüsselnutzung, ist aber keine Remote-Attestierung.
