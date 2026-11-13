# Matter: Backup und Wiederherstellung

<!-- llms-description: Backup und Wiederherstellung der Matter-Fabric: Inhalt, automatische und manuelle Backups, Recovery-Schlüssel, Restore, Disaster Recovery, degradierte Zustände und Garantien. -->

> **Bewahren Sie Ihren Recovery-Schlüssel außerhalb des Servers auf.** Die Matter-Fabric ist die Identität, der jedes in Betrieb genommene Gerät vertraut. Geht die Fabric verloren, muss jedes Gerät auf Werkseinstellungen zurückgesetzt und neu in Betrieb genommen werden. Attraccess speichert verschlüsselte Backups der Fabric, sie lassen sich aber nur mit dem **Recovery-Schlüssel** öffnen, der **genau einmal** angezeigt wird. Verlieren Sie Schlüssel und Server, ist die Fabric nicht wiederherstellbar.

Diese Seite beschreibt, wie die Matter-Fabric geschützt, gesichert und wiederhergestellt wird, auch auf einem neuen Host. Sie baut auf der [Architektur](devices/matter/architecture.md) und der [Betriebsanleitung](devices/matter/operator.md) auf. Alle Aktionen finden Sie unter **Geräte → Matter → Fabric & Backup**, sie erfordern die Berechtigung `system.plugins.manage`.

## Was ein Matter-Backup enthält

Ein Matter-Backup ist eine einzelne Datei (`.attraccess-matter-backup`) mit zwei Teilen:

- **Der Fabric-Speicher des Sidecars:** die Controller-Fabric (Root-Zertifikat und Schlüssel), der Node-ID-Vergeber und die Matter-Nachrichtenzähler.
- **Die Matter-Tabellen des Plugins:** die Geräteeinträge, Namen, Beschreibungen und Standorte sowie die übrigen `plugin_matter_*`-Daten.

Es enthält **nicht**:

- Den Rest von Attraccess (Benutzer, Ressourcen, Einstellungen, Uploads). Das deckt das allgemeine [Attraccess-Backup](installation/backup-restore.md) ab, das davon getrennt ist.
- Das Service-Token und das CA-Zertifikat der Sidecar-Verbindung.
- Den Recovery-Schlüssel. Er ist nie Teil eines Backups.

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

Zusätzlich können Sie jederzeit **Jetzt sichern** wählen. Die Statuskarte zeigt das letzte erfolgreiche Backup, den letzten Versuch (bei einem Fehler mit Grund) und den Zeitpunkt des nächsten Laufs.

**Aufbewahrung:** Die neuesten **10** Backups bleiben erhalten, ältere werden gelöscht. Die Backups liegen **verschlüsselt in der Plugin-Datenbank**, ein normales [Backup des Attraccess-Volumes](installation/backup-restore.md) enthält sie also bereits. Außerdem können Sie jedes gespeicherte Backup aus der Liste herunterladen und eine Kopie außerhalb des Servers aufbewahren. Für Disaster Recovery brauchen Sie eine solche Kopie, denn die Datenbank mit den gespeicherten Backups geht mit dem Server verloren.

## Der Recovery-Schlüssel

Wenn Sie die Fabric erzeugen (oder eine neue beginnen), erzeugt Attraccess einen **256-Bit-Recovery-Schlüssel**, angezeigt als gruppierte Großbuchstaben und Ziffern (zum Beispiel `ABCD-EFGH-…`). Die Backups werden mit einem daraus abgeleiteten Schlüssel verschlüsselt.

- Der Schlüssel wird **genau einmal** angezeigt. Sie können ihn kopieren oder als Textdatei herunterladen. Bevor sich der Dialog schließt, müssen Sie das Bestätigungs-Kontrollkästchen aktivieren.
- **Bewahren Sie ihn außerhalb des Servers auf**, zum Beispiel in einem Passwortmanager und ausgedruckt an einem sicheren Ort. Er wird nie wieder angezeigt und erscheint weder in Logs noch im Audit-Log noch in einem Backup.
- **Verlieren Sie Schlüssel und Server, ist die Fabric nicht wiederherstellbar.** Niemand, auch nicht das Projekt, kann ein Backup ohne den Schlüssel entschlüsseln.
- **Rotation.** **Schlüssel rotieren** (nach einer Bestätigung) erzeugt einen neuen Schlüssel, zeigt ihn einmal an und verschlüsselt alle neuen Backups damit. Bestehende Backups behalten den Schlüssel, mit dem sie erstellt wurden: Der Header jedes Backups nennt seinen Schlüssel per ID. **Bewahren Sie alte Schlüssel so lange auf, wie Sie alte Backups brauchen könnten.**
- Der Server speichert den Recovery-Schlüssel verschlüsselt mit einem aus `AUTH_SESSION_SECRET` abgeleiteten Schlüssel. Wer die Datenbank **und** die `.env`-Datei hat, kann die gespeicherten Backups daher entschlüsseln. Das ist dieselbe Vertrauensgrenze wie beim Rest von Attraccess (dieselben Personen können Datenbank und Ihre Geheimnisse ohnehin lesen), ist aber der Grund, beides zu schützen.
- **Das Deinstallieren des Matter-Plugins löscht den gespeicherten Schlüssel und alle gespeicherten Backups** zusammen mit den übrigen Plugin-Daten. Laden Sie vor dem Deinstallieren ein Backup herunter und bewahren Sie den Schlüssel auf.

## Wiederherstellung

Wählen Sie im Bereich Fabric & Backup **Wiederherstellen**. Es öffnet sich ein Assistent:

1. **Backup wählen:** Wählen Sie ein gespeichertes Backup oder laden Sie eine `.attraccess-matter-backup`-Datei hoch.
2. **Recovery-Schlüssel eingeben**, mit dem das Backup erstellt wurde. Haben Sie Schlüssel rotiert, verwenden Sie den im Header des Backups genannten Schlüssel (angezeigt als ID).
3. **Prüfen.** Attraccess prüft die Datei vollständig, bevor sich etwas ändert: Dateiformat, Integrität beider Teile, Schlüssel und ob das Backup zu dieser Installation passt (siehe unten). Fehler sind konkret, zum Beispiel falscher Schlüssel, beschädigte oder abgeschnittene Datei oder ein anderes Plugin-Release. Schlägt die Prüfung fehl, wird nichts geändert.
4. **Vorabprüfung (Preflight).** Sie sehen, welche Fabric das Backup enthält, wann es erstellt wurde und was es ersetzt.
5. **Getippte Bestätigung.** Hält der Sidecar gerade eine **gesunde** Fabric, die die Wiederherstellung überschreiben würde, müssen Sie zur Bestätigung die Fabric-ID eintippen. Hat der Sidecar keine verwendbare Fabric (siehe „Degradierte Zustände und Recovery“ weiter unten), ist keine getippte Bestätigung nötig.
6. **Ergebnis.** Der Assistent meldet Erfolg, oder dass die Wiederherstellung zurückgerollt wurde und Ihre Installation unverändert blieb.

**Dasselbe Release erforderlich.** Das Backup muss vom selben Matter-Plugin-Release stammen wie das Ziel: Die letzte Migration des Plugins und das Storage-Schema des Sidecars müssen **exakt** übereinstimmen. Stellen Sie auf demselben Release wieder her (installieren Sie zuerst das im Backup vermerkte Release) und aktualisieren Sie danach.

### So läuft eine Wiederherstellung ab

Eine Wiederherstellung läuft in zwei Phasen, damit keine Seite halb wiederhergestellt bleibt:

1. Es wird ein Backup des aktuellen Zustands erstellt (wenn eine gesunde Fabric existiert).
2. Der Sidecar **stagt** das Backup (nur Prüfung, keine Änderung am Livezustand).
3. Der Sidecar **führt aus (Commit)**: Er tauscht seinen Speicher aus und behält den vorherigen als Rollback-Kopie.
4. Das Plugin ersetzt seine Tabellen in einer einzigen Datenbanktransaktion.
5. Bei Erfolg wird die Rollback-Kopie **abgeschlossen** (gelöscht). Schlägt der Plugin-Schritt fehl, wird der Sidecar-Speicher auf den vorherigen **zurückgerollt**, und das Plugin behält seine alten Daten. Kann der Sidecar den Tausch nicht verifizieren, tauscht er selbstständig zurück, und die Wiederherstellung scheitert mit `restore_failed`.

Die Prüfung ändert nie etwas. Eine vor dem Commit abgebrochene Wiederherstellung **verwirft** nur die gestagten Daten.

### Disaster Recovery auf einem neuen Host

1. Installieren Sie ein neues Attraccess **und** starten Sie einen Sidecar mit einem **frischen, leeren Speicher-Volume** (siehe `MATTER_SIDECAR_STORAGE_DIR` in der [Betriebsanleitung](devices/matter/operator.md#konfiguration)).
2. Installieren Sie **dasselbe Matter-Plugin-Release**, das das Backup erstellt hat, und verbinden Sie es mit dem Sidecar.
3. Öffnen Sie **Geräte → Matter**. Der Sidecar meldet keine Fabric, daher bietet Attraccess **Wiederherstellen** an.
4. Laden Sie Ihre Backup-Datei hoch, geben Sie den Recovery-Schlüssel ein, prüfen Sie und stellen Sie wieder her.
5. Setzen Sie anschließend jedes Gerät, das nach dem Backup hinzugekommen ist, auf Werkseinstellungen zurück und nehmen Sie es erneut in Betrieb.

## Degradierte Zustände und Recovery

Attraccess vergleicht, was es aufgezeichnet hat, mit dem, was der Sidecar meldet (Fabric-ID, Fingerabdruck des Root-Zertifikats, Storage-Instanz-ID und eine **Fabric-Generation**, die mit jeder Änderung steigt). Stimmen sie nicht überein, wechselt es in einen Recovery-Zustand und **sperrt Aktionen, die die Fabric ändern**, bis ein Administrator entscheidet.

| Situation                                | Typische Ursache                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Sidecar-Speicher verloren (keine Fabric) | Das Sidecar-Volume wurde geleert oder ersetzt.                                                            |
| Andere Fabric                            | Der Sidecar zeigt auf ein anderes Speicher-Volume, oder die Fabric wurde anderswo erzeugt.                |
| Generation zurückliegend                 | Das Attraccess-Volume wurde aus einem älteren Backup wiederhergestellt, der Sidecar behielt seinen Stand. |
| Generation voraus                        | Der Sidecar-Speicher ist älter als Attraccess, oder Attraccess wurde ohne den Sidecar wiederhergestellt.  |
| Sidecar `recovery_required`              | Der Sidecar hält seinen eigenen Speicher für unbrauchbar und erzeugt von sich aus keine Fabric.           |

Das Recovery-Panel bietet dann drei Optionen:

- **Wiederherstellen** aus einem Backup (der Assistent oben). Das ist die richtige Wahl, wenn Sie Backup und Schlüssel haben.
- **Fabric des Sidecars übernehmen.** Nur möglich, wenn der Sidecar gesund ist. Attraccess übernimmt die vom Sidecar gemeldete Fabric. Nutzen Sie das, wenn Sie wissen, dass der Sidecar stimmt, zum Beispiel nach einer Wiederherstellung von Attraccess ohne den Sidecar. Nicht passende Geräteeinträge werden wie gewohnt abgeglichen.
- **Neue Fabric beginnen.** Nur möglich, wenn der Sidecar keine Fabric hat. Es wird eine komplett neue Fabric mit einem neuen Recovery-Schlüssel erzeugt. **Alle bisher in Betrieb genommenen Geräte müssen auf Werkseinstellungen zurückgesetzt und neu in Betrieb genommen werden.** Deshalb ist das eine Gefahren-Aktion mit Bestätigung.

Bis Sie sich entscheiden, wählt Attraccess nie selbst eine Option.

## Sicherheitsgarantien

- **Nichts, was eine Fabric zerstören könnte, geschieht automatisch.** Attraccess erzeugt, stellt wieder her oder überschreibt eine Fabric nie von sich aus. Automatisch passiert nur das Erstellen von Backups.
- **Prüfung vor jeder Änderung.** Eine Wiederherstellung wird zuerst vollständig geprüft. Ein falscher Schlüssel, eine beschädigte Datei oder ein inkompatibles Release ändern nichts.
- **Rollback auf beiden Seiten.** Schlägt der Sidecar- oder der Plugin-Schritt fehl, wird der vorherige Zustand auf beiden Seiten wiederhergestellt.
- **Keine Geheimnisse in Logs oder Audit-Log.** Recovery-Schlüssel, Fabric-Schlüssel und Backup-Inhalte werden nie protokolliert.
- **Unsichere Übertragung wird abgelehnt.** Backups und Wiederherstellungen enthalten Fabric-Geheimnisse, daher lehnt der Sidecar sie über eine unverschlüsselte HTTP-Verbindung zu einem entfernten Sidecar mit `insecure_transport` (HTTP 403) ab. Nutzen Sie TLS oder betreiben Sie den Sidecar auf Loopback.
- **Alles wird im Audit-Log festgehalten.** Fabric-Erzeugung, Backups, Schlüsselrotation, Wiederherstellungen und jede Recovery-Entscheidung stehen ohne Geheimnisse im Audit-Log.

Siehe auch: [Attraccess Backup & Wiederherstellung](installation/backup-restore.md), die [Betriebsanleitung](devices/matter/operator.md) und das [Datenmodell](devices/matter/data-model.md).
