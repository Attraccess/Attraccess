# Matter: Backup und Wiederherstellung

<!-- llms-description: Backup und Wiederherstellung der Matter-Fabric: Inhalt, automatische und manuelle Backups, Wiederherstellungsschlüssel, Restore, Disaster Recovery, degradierte Zustände und Garantien. -->

> **Bewahren Sie Ihren Wiederherstellungsschlüssel außerhalb des Servers auf.** Die Matter-Fabric ist die Identität, der jedes in Betrieb genommene Gerät vertraut. Geht die Fabric verloren, muss jedes Gerät auf Werkseinstellungen zurückgesetzt und neu in Betrieb genommen werden. Attraccess speichert verschlüsselte Backups der Fabric, sie lassen sich aber nur mit dem **Wiederherstellungsschlüssel** öffnen, der **genau einmal** angezeigt wird. Verlieren Sie Schlüssel und Server, ist die Fabric nicht wiederherstellbar.

Diese Seite beschreibt, wie die Matter-Fabric geschützt, gesichert und wiederhergestellt wird, auch auf einem neuen Host. Sie baut auf der [Architektur](devices/matter/architecture.md) und der [Betriebsanleitung](devices/matter/operator.md) auf. Alle Aktionen finden Sie unter **Geräte → Matter → Fabric & Backup**, sie erfordern die Berechtigung `system.plugins.manage`.

## Was ein Matter-Backup enthält

Ein Matter-Backup ist eine einzelne Datei (`.attraccess-matter-backup`) mit zwei Teilen:

- **Der Fabric-Speicher des Sidecars:** die Controller-Fabric (Root-Zertifikat und Schlüssel), der Node-ID-Vergeber und die Matter-Nachrichtenzähler.
- **Die Matter-Tabellen des Plugins:** die Geräteeinträge, Namen, Beschreibungen und Standorte sowie die übrigen `plugin_matter_*`-Daten.

Es enthält **nicht**:

- Den Rest von Attraccess (Benutzer, Ressourcen, Einstellungen, Uploads). Das deckt das allgemeine [Attraccess-Backup](installation/backup-restore.md) ab, das davon getrennt ist.
- Das Service-Token und das CA-Zertifikat der Sidecar-Verbindung.
- Den Wiederherstellungsschlüssel. Er ist nie Teil eines Backups.

> [!WARNING]
> Ein Backup ist eine Momentaufnahme. Geräte, die **nach** dem letzten Backup in Betrieb genommen wurden, sind nicht darin enthalten. Nach einer Wiederherstellung tragen sie noch die alten Fabric-Informationen und müssen **auf Werkseinstellungen zurückgesetzt und neu in Betrieb genommen** werden.

Matter-Nachrichtenzähler und der Node-ID-Vergeber laufen nach dem Backup weiter. Bei der Wiederherstellung setzt der Sidecar beide um einen sicheren Abstand weiter, damit eine wiederhergestellte Fabric nie einen bereits verwendeten Zähler oder eine bereits vergebene Node-ID erneut nutzt.

## Automatische und manuelle Backups

Attraccess erstellt automatisch ein Backup:

- nachdem die Fabric erzeugt wurde,
- nach einer Wiederherstellung,
- einmal täglich,
- nach jeder Änderung an der Fabric und
- vor einer Wiederherstellung (damit Sie zurückgehen können).

Zusätzlich können Sie jederzeit **Jetzt sichern** wählen. Die Karte **Backups** zeigt das letzte erfolgreiche Backup, den letzten Versuch (bei einem Fehler mit Grund) und den Zeitpunkt des nächsten Laufs. Sind **Jetzt sichern** oder **Aus Backup wiederherstellen** nicht verfügbar, nennt die Karte den Grund, zum Beispiel dass es noch keinen Wiederherstellungsschlüssel gibt, dass die Fabric wiederhergestellt werden muss oder dass die Verbindung zum Sidecar nicht sicher ist.

**Aufbewahrung:** Die neuesten **10** Backups bleiben erhalten, ältere werden gelöscht. Die Backups liegen **verschlüsselt in der Plugin-Datenbank**, ein normales [Backup des Attraccess-Volumes](installation/backup-restore.md) enthält sie also bereits. Außerdem können Sie jedes gespeicherte Backup aus der Liste herunterladen und eine Kopie außerhalb des Servers aufbewahren. Für Disaster Recovery brauchen Sie eine solche Kopie, denn die Datenbank mit den gespeicherten Backups geht mit dem Server verloren.

## Der Wiederherstellungsschlüssel

Wenn Sie die Fabric erzeugen, erzeugt Attraccess einen **256-Bit-Wiederherstellungsschlüssel**, angezeigt als gruppierte Großbuchstaben und Ziffern (zum Beispiel `ABCD-EFGH-…`). Die Backups werden mit einem daraus abgeleiteten Schlüssel verschlüsselt.

- Der Schlüssel wird **genau einmal** angezeigt. Sie können ihn kopieren oder als Textdatei herunterladen. Bevor sich der Dialog schließt, müssen Sie das Bestätigungs-Kontrollkästchen aktivieren.
- **Bewahren Sie ihn außerhalb des Servers auf**, zum Beispiel in einem Passwortmanager und ausgedruckt an einem sicheren Ort. Er wird nie wieder angezeigt und erscheint weder in Logs noch im Audit-Log noch in einem Backup.
- **Verlieren Sie Schlüssel und Server, ist die Fabric nicht wiederherstellbar.** Niemand, auch nicht das Projekt, kann ein Backup ohne den Schlüssel entschlüsseln.
- **Rotation.** **Wiederherstellungsschlüssel rotieren** (nach einer Bestätigung) erzeugt einen neuen Schlüssel, zeigt ihn einmal an und verschlüsselt alle neuen Backups damit. Bestehende Backups behalten den Schlüssel, mit dem sie erstellt wurden: Der Header jedes Backups nennt seinen Schlüssel per ID. Diese Installation behält ihre ausgemusterten Schlüssel (verschlüsselt), ihre eigenen gespeicherten Backups bleiben also nutzbar; auf einer frischen Installation brauchen Sie aber den im Header genannten Schlüssel. **Bewahren Sie alte Schlüssel so lange auf, wie Sie alte Backups brauchen könnten.**
- Der Server speichert den Wiederherstellungsschlüssel verschlüsselt mit einem aus `AUTH_SESSION_SECRET` abgeleiteten Schlüssel. Wer die Datenbank **und** die `.env`-Datei hat, kann die gespeicherten Backups daher entschlüsseln. Das ist dieselbe Vertrauensgrenze wie beim Rest von Attraccess (dieselben Personen können Datenbank und Ihre Geheimnisse ohnehin lesen), ist aber der Grund, beides zu schützen.
- **Das Deinstallieren des Matter-Plugins löscht den gespeicherten Schlüssel und alle gespeicherten Backups** zusammen mit den übrigen Plugin-Daten. Laden Sie vor dem Deinstallieren ein Backup herunter und bewahren Sie den Schlüssel auf.

## Wiederherstellung

Wählen Sie im Bereich Fabric & Backup **Aus Backup wiederherstellen**. Es öffnet sich ein Assistent:

1. **Backup wählen:** Wählen Sie ein gespeichertes Backup oder laden Sie eine `.attraccess-matter-backup`-Datei hoch (höchstens 7 MB).
2. **Wiederherstellungsschlüssel eingeben**, mit dem das Backup erstellt wurde. Attraccess fragt ihn nur ab, wenn das Backup mit einem Schlüssel erstellt wurde, den diese Installation nicht kennt, zum Beispiel nach einer Neuinstallation. Verwenden Sie den im Header des Backups genannten Schlüssel (angezeigt als ID).
3. **Prüfen.** Attraccess prüft die Datei vollständig, bevor sich etwas ändert: Dateiformat, Integrität beider Teile, Schlüssel und ob das Backup zu dieser Installation passt (siehe unten). Fehler sind konkret, zum Beispiel falscher Schlüssel, beschädigte oder abgeschnittene Datei oder ein anderes Plugin-Release. Schlägt die Prüfung fehl, wird nichts geändert.
4. **Vorabprüfung (Preflight).** Sie sehen, welche Fabric das Backup enthält, wann es erstellt wurde und was es ersetzt.
5. **Getippte Bestätigung.** Hält der Sidecar gerade eine **gesunde** Fabric, die die Wiederherstellung überschreiben würde, müssen Sie zur Bestätigung die Fabric-ID eintippen. Hat der Sidecar keine verwendbare Fabric (siehe „Degradierte Zustände und Recovery“ weiter unten), ist keine getippte Bestätigung nötig.
6. **Ergebnis.** Der Assistent meldet Erfolg, oder dass die Wiederherstellung fehlgeschlagen ist und Ihre Installation unverändert blieb. Ist die Prüfung abgelaufen, hat sich der Sidecar inzwischen verändert oder ist er beschäftigt, kehrt der Assistent zu Schritt 3 zurück und behält Backup und Schlüssel, sodass Sie nur erneut prüfen. Im seltenen Fall, dass der Sidecar nicht automatisch zurückgerollt werden konnte, meldet der Assistent stattdessen genau das: Sein Zustand ist dann unbekannt, prüfen Sie also den Sidecar und stellen Sie das Backup erneut wieder her.

**Dasselbe Release erforderlich.** Das Backup muss vom selben Matter-Plugin-Release stammen wie das Ziel: Die letzte Migration des Plugins und das Storage-Schema des Sidecars müssen **exakt** übereinstimmen. Stellen Sie auf demselben Release wieder her (installieren Sie zuerst das im Backup vermerkte Release) und aktualisieren Sie danach.

### So läuft eine Wiederherstellung ab

Eine Wiederherstellung läuft in zwei Phasen, damit keine Seite halb wiederhergestellt bleibt:

1. Es wird ein Backup des aktuellen Zustands erstellt (wenn eine gesunde Fabric existiert). Gelingt das nicht, wird die Wiederherstellung abgelehnt und nichts ändert sich.
2. Der Sidecar **stagt** das Backup (nur Prüfung, keine Änderung am Livezustand).
3. Der Sidecar **führt aus (Commit)**: Er tauscht seinen Speicher aus und behält den vorherigen als Rollback-Kopie.
4. Das Plugin ersetzt seine Tabellen in einer einzigen Datenbanktransaktion.
5. Bei Erfolg wird die Rollback-Kopie **abgeschlossen** (gelöscht). Schlägt der Plugin-Schritt fehl, wird der Sidecar-Speicher auf den vorherigen **zurückgerollt**, und das Plugin behält seine alten Daten. Kann der Sidecar den Tausch nicht verifizieren, tauscht er selbstständig zurück, und die Wiederherstellung scheitert mit `restore_failed`.

Die Prüfung ändert nie etwas. Eine vor dem Commit abgebrochene Wiederherstellung **verwirft** nur die gestagten Daten.

Der Sidecar löscht nie einen Speicher, der die einzige Kopie einer Fabric sein könnte. Beschädigter Speicher, den eine Wiederherstellung ersetzt hat, eine Rollback-Kopie, die ein abgestürzter oder angehaltener Sidecar hinterlassen hat, und eine Rollback-Kopie, die nicht rechtzeitig abgeschlossen oder zurückgerollt wurde, landen in einem nur für den Eigentümer zugänglichen (`0700`) Verzeichnis `quarantine-<Zeitstempel>-<ID>` in `MATTER_SIDECAR_STORAGE_DIR`; der Sidecar protokolliert dazu eine Warnung mit dem Namen. **Diese Verzeichnisse enthalten Fabric-Schlüssel.** Der Sidecar entfernt sie nie: Löschen Sie sie selbst, sobald Sie sie nicht mehr brauchen (siehe [Speicher](devices/matter/operator.md#speicher)).

### Disaster Recovery auf einem neuen Host

1. Installieren Sie ein neues Attraccess **und** starten Sie einen Sidecar mit einem **frischen, leeren Speicher-Volume** (siehe `MATTER_SIDECAR_STORAGE_DIR` in der [Betriebsanleitung](devices/matter/operator.md#konfiguration)).
2. Installieren Sie **dasselbe Matter-Plugin-Release**, das das Backup erstellt hat, und verbinden Sie es mit dem Sidecar.
3. Öffnen Sie **Geräte → Matter**. Der Sidecar meldet keine Fabric, daher bietet Attraccess **Aus Backup wiederherstellen** an.
4. Laden Sie Ihre Backup-Datei hoch, geben Sie den Wiederherstellungsschlüssel ein, prüfen Sie und stellen Sie wieder her.
5. Setzen Sie anschließend jedes Gerät, das nach dem Backup hinzugekommen ist, auf Werkseinstellungen zurück und nehmen Sie es erneut in Betrieb.

Der eingegebene Wiederherstellungsschlüssel wird zum gespeicherten Wiederherstellungsschlüssel der neuen Installation. Automatische Backups laufen also sofort wieder, verschlüsselt mit demselben Schlüssel. Bewahren Sie ihn weiter auf; Sie erhalten keinen neuen.

## Degradierte Zustände und Recovery

Attraccess vergleicht, was es aufgezeichnet hat, mit dem, was der Sidecar meldet (Fabric-ID, Fingerabdruck des Root-Zertifikats, Storage-Instanz-ID und eine **Fabric-Generation**, die mit jeder Änderung steigt). Stimmen sie nicht überein, wechselt es in einen Recovery-Zustand und **sperrt Aktionen, die die Fabric ändern**, bis ein Administrator entscheidet.

| Situation                                | Typische Ursache                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Sidecar-Speicher verloren (keine Fabric) | Das Sidecar-Volume wurde geleert oder ersetzt.                                                          |
| Andere Fabric                            | Der Sidecar zeigt auf ein anderes Speicher-Volume, oder die Fabric wurde anderswo erzeugt.              |
| Generation zurückliegend                 | Der Sidecar-Speicher ist älter als Attraccess, zum Beispiel aus einer alten Kopie wiederhergestellt.    |
| Generation voraus                        | Der Sidecar ist neuer als Attraccess, zum Beispiel wurde Attraccess ohne den Sidecar wiederhergestellt. |
| Sidecar `recovery_required`              | Der Sidecar hält seinen eigenen Speicher für unbrauchbar und erzeugt von sich aus keine Fabric.         |

Auch eine unterbrochene Wiederherstellung, etwa weil der Sidecar mittendrin abgestürzt ist oder angehalten wurde, endet in `recovery_required`, mit dem Grund `restore_interrupted` („Eine Wiederherstellung wurde unterbrochen. Der vorherige Speicher blieb erhalten; stelle ein Backup wieder her.“). Der Sidecar behält den vorherigen Speicher und ändert sonst nichts. Stellen Sie ein Backup wieder her, um fortzufahren.

Die Karte **Wiederherstellung** bietet dann drei Optionen:

- **Aus Backup wiederherstellen** (der Assistent oben). Das ist die richtige Wahl, wenn Sie Backup und Schlüssel haben.
- **Fabric des Sidecars übernehmen.** Nur möglich, wenn der Sidecar gesund ist. Attraccess übernimmt die vom Sidecar gemeldete Fabric. Nutzen Sie das, wenn Sie wissen, dass der Sidecar stimmt, zum Beispiel nach einer Wiederherstellung von Attraccess ohne den Sidecar. Nicht passende Geräteeinträge werden wie gewohnt abgeglichen.
- **Neue Fabric starten.** Nur möglich, wenn der Sidecar keine Fabric hat. Es wird eine komplett neue, leere Fabric erzeugt. Der gespeicherte Wiederherstellungsschlüssel bleibt erhalten und wird für ihre Backups verwendet (nur wenn keiner gespeichert ist, wird ein neuer erzeugt). **Alle bisher in Betrieb genommenen Geräte müssen auf Werkseinstellungen zurückgesetzt und neu in Betrieb genommen werden.** Deshalb ist das eine Gefahren-Aktion mit Bestätigung.

Bis Sie sich entscheiden, wählt Attraccess nie selbst eine Option.

## Sicherheitsgarantien

- **Nichts, was eine Fabric zerstören könnte, geschieht automatisch.** Attraccess erzeugt, stellt wieder her oder überschreibt eine Fabric nie von sich aus. Automatisch passiert nur das Erstellen von Backups.
- **Prüfung vor jeder Änderung.** Eine Wiederherstellung wird zuerst vollständig geprüft. Ein falscher Schlüssel, eine beschädigte Datei oder ein inkompatibles Release ändern nichts.
- **Rollback auf beiden Seiten.** Schlägt der Sidecar- oder der Plugin-Schritt fehl, wird der vorherige Zustand auf beiden Seiten wiederhergestellt.
- **Keine Geheimnisse in Logs oder Audit-Log.** Wiederherstellungsschlüssel, Fabric-Schlüssel und Backup-Inhalte werden nie protokolliert.
- **Unsichere Übertragung wird abgelehnt.** Backups und Wiederherstellungen enthalten Fabric-Geheimnisse, daher lehnt der Sidecar sie über eine unverschlüsselte HTTP-Verbindung zu einem entfernten Sidecar mit `insecure_transport` (HTTP 403) ab. Nutzen Sie TLS oder betreiben Sie den Sidecar auf Loopback.
- **Alles wird im Audit-Log festgehalten.** Fabric-Erzeugung, Backups, Schlüsselrotation, Wiederherstellungen und jede Recovery-Entscheidung stehen ohne Geheimnisse im Audit-Log.

Siehe auch: [Attraccess Backup & Wiederherstellung](installation/backup-restore.md), die [Betriebsanleitung](devices/matter/operator.md) und das [Datenmodell](devices/matter/data-model.md).
