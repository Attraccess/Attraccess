# Unterstützungsgrenzen der CC100-FW31-Software

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

## Ablösung vom 2026-09-06: destruktive Inbetriebnahme

Die Produktentscheidung vom **2026-09-06** löst die unten aufgeführten Anforderungen zur Erhaltung
und Wiederherstellung früherer Workloads ab. Die Inbetriebnahme übernimmt den CC100: Vorhandene
Anwendungen und Workloads funktionieren möglicherweise nicht mehr oder werden gelöscht. Attraccess
erhält vorhandene CODESYS-Programme, remanente SPS-Daten (Retain-Daten), andere Workloads
oder deren Host-Einstellungen nicht, erstellt keine Sicherungskopie davon und stellt sie nicht wieder her. Es gibt eine einzige Bestätigung der destruktiven
Installationsfolgen; keine separate Freigabe eines SPS-Backups und keine verpflichtende WBM-Schranke.

Der aktuelle Übertragungsvertrag stoppt und deaktiviert CODESYS immer dauerhaft und
verifiziert Prozess- und Boot-Zustand, **bevor digitale E/A freigegeben wird**. Schlägt die
Verifizierung fehl, wird Registrierung bzw. Laufzeitstart verhindert. Dies gilt auch dann, wenn CODESYS
bereits gestoppt war. Die unterstützte Docker-Aktivierung/-Installation des Herstellers und die
dauerhafte, eng begrenzte E/A-Vorbereitung sind Teil der Übertragung; nicht unterstützte Komponenten,
fehlende Register und unabhängige Ausgangsschreiber schlagen weiterhin geschlossen fehl (fail closed). Siehe den aktuellen
[Plattformvertrag](plugins/wago/commissioning-platform.md) und die
[Anleitung für Betreiber](plugins/wago/cc100-commissioning.md).

Die Bereinigung gleicht die fehlgeschlagene Installation und ihre Zugangsdaten ab; sie macht die
destruktive Übernahme nicht rückgängig und aktiviert CODESYS nicht wieder. Integritätsjournale, gepinntes SSH,
prüfsummengeprüfte Offline-Artefakte, TLS-Registrierung, frische Zugangsdaten/Zustimmung bei Wiederholung und
die Wiederherstellung des Verwaltungszugangs bleiben erforderlich. Vollständige Härtung der Verwaltung und physische
Abnahme sind getrennt und sind **nicht abgeschlossen**, nur weil Installation oder
Software-Fixtures erfolgreich sind.

Die folgenden Quellbeobachtungen bleiben als Entscheidungshistorie erhalten, einschließlich destruktiver
Nebeneffekte des Herstellers und der Grenzen der FW30-Nachweise. Ihre alten Erhaltungsschranken
und pauschalen Aussagen, die Docker-/E/A-Vorbereitung sei nicht implementiert, sind überholt
und keine Anweisungen für den aktuellen Betreiber-Ablauf. Prüfungen der Quellkompatibilität
bleiben erforderlich; die Produktentscheidung ist kein Beleg dafür, dass beliebige Firmware oder
unbekannte Komponentenversionen unterstützt werden.

### Sicherheits-Nachtrag vom 2026-09-06

Die spätere Sicherheitsrevision löst den zwischenzeitlichen Docker-Neustartentwurf `on-failure:5` ab.
Die aktuelle Bereitstellung verwendet die Docker-Neustartrichtlinie `no` und einen Host-Supervisor im Besitz von root.
Jeder von höchstens fünf Absturz-Neustarts pro Supervisor-Lauf wiederholt die vollständige Schranke aus CODESYS-Prüfung,
Besitzprüfung und Prüfung der eng begrenzten Berechtigungen; laufende Schreiber werden zusätzlich periodisch
geprüft. Beobachtungsfehler, Konflikte und erschöpfte Wiederholungen deaktivieren die Aktivierung
und versuchen eine begrenzte Eindämmung. Ein nicht verfügbarer Daemon oder ein nicht verifiziertes Stoppen
des Containers bleibt ein Fehler, wobei der Wiederherstellungsbesitz erhalten bleibt.

Die spätere Korrektur der Spezifikation löst außerdem die zwischenzeitliche Anweisung ab, den Boot-Hook
nach jedem Supervisor-Fehler aufzurufen. Ein gewöhnlicher Neustart nur des Daemons erlaubt einen geprüften Start
nur, solange die Aktivierung vorhanden bleibt. Die Eindämmung entfernt diese
Aktivierung; der Hook-Aufruf `start` endet derzeit mit `0`, ohne neu zu starten, und ein Neustart
hebt die Sperre nicht auf. Aktuelle geführte Sitzungen behalten die mit Token versehene
[Bereinigungs-/Neuinbetriebnahmeroute des Assistenten](plugins/wago/cc100-commissioning.md#wiederherstellung-nach-dauerhaft-gesperrter-eindämmung):
Bereinigung, dann eine noch nicht registrierte Installation erneut versuchen oder die bestehende Registrierung
entfernen und neu in Betrieb nehmen. Nur die Installation stellt die Aktivierung wieder her; es wird weder
eine manuelle Marker-Erstellung noch ein neuer UI-/API-Vorgang zum erneuten Aktivieren behauptet. Fehlender Wiederherstellungsbesitz
oder eine nicht verifizierte Bereinigung bleibt ein Hindernis.

Der Host-Schutz lehnt Kollisionen von Konten/Gruppen mit UID/GID 10001, fremde Prozesse
mit dieser Identität, nicht verifizierte Namespace-Zuordnungen und nicht der Laufzeit gehörende (fremde) beschreibbare DOUT-
Deskriptoren ab, einschließlich Inode-Aliasen. Ausnahmen für die eigene Laufzeit erfordern vollständige Docker-
ID-, Namespace- und cgroup-Prüfungen. Konfigurations-/Sperrpfade und die bereitgestellte Boot-Veröffentlichung
müssen die Prüfungen auf Root-Besitz, Berechtigungen und Dateityp bestehen. Dies ist Software-
Durchsetzung mit Beobachtungs- und Race-Grenzen, keine physische oder sicherheitstechnische Qualifizierung.

Die unabhängige Flottenschranke und acht Desktop-/Mobil-Inbetriebnahmefälle bestanden
auf dem Snapshot, der am **2026-09-06T17:11:46.494036Z** erfasst und um
**17:17:33.628037Z** auf Aktualität der Quelle geprüft wurde. Diese Ergebnisse stammen aus der Zeit vor dieser Sicherheitsrevision und verifizieren sie nicht.
Für die endgültige Quelle sind eine aktualisierte Schranke und ein neuer Browserlauf erforderlich;
keiner der Läufe liefert Nachweise zu Hardware, FW31-Neustart oder vollständiger Härtung der Verwaltung.

### Exakte Erweiterungsquelle und erfasste FW31-Nachweise

Das exakte Quell-Audit vom 2026-09-06 untersuchte die inoffizielle Studierenden-Erweiterung
[`WAGO-education.vscode-wago-cc100`](https://marketplace.visualstudio.com/items?itemName=WAGO-education.vscode-wago-cc100),
Quellversion/-Tag **0.2.10 / v0.2.10**, am Commit
[`02a0956faeb33ed2a22d7b7f2627ad62411d327b`](https://github.com/wago-enterprise-education/vscode-wago-cc100/tree/02a0956faeb33ed2a22d7b7f2627ad62411d327b).
Ihre Beschreibung nennt FW28/FW30, nicht FW31. Die erfassten Quell-Blobs wurden mit ihren Git-Objekt-IDs
verglichen. Ob das Marketplace-VSIX byteweise mit dieser Quelle oder dem GitHub-Release übereinstimmt, bleibt **unbekannt**;
Release-Metadaten sind kein erfasstes VSIX.

Ihr [V02-Upload-Pfad](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/src/extensionCore/projectVersions/V02.ts#L1129-L1228)
versucht, `codesys3` zu stoppen, ruft `/etc/config-tools/config_runtime runtime-version=0` auf und anschließend
`/etc/config-tools/config_docker activate` mit einer festen Verzögerung von einer Sekunde. Image-
Layer werden auf dem Entwicklungs-Host bezogen, als `/home/image.tar` hochgeladen und
mit `docker load` geladen; dies ist weder ein Engine-Installationsprogramm noch ein geräteseitiger Pull.
Attraccess übernimmt bewusst weder den
[ignorierten Exit-Status/stderr des SSH-Wrappers](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/src/extension/connectionManager.ts#L865-L887),
noch die [nicht abgewarteten Skript-Callbacks](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/src/extension/connectionManager.ts#L244-L270),
noch die fehlende Stopp-/Boot-Verifizierung, noch die
breiten beschreibbaren Mounts für Analog/Seriell/Config-Tools und den `unless-stopped`-Start von
[`res/scripts/dockerCommand.sh`](https://github.com/wago-enterprise-education/vscode-wago-cc100/blob/02a0956faeb33ed2a22d7b7f2627ad62411d327b/res/scripts/dockerCommand.sh).
Dieses Skript hat keine explizite UID-Überschreibung; die effektive Image-UID ist nicht verifiziert.
Das Zurücksetzen der Erweiterung aktiviert CODESYS wieder und ist keine Attraccess-Bereinigung.

Davon getrennt las das Audit vorhandene Offline-Gerätedateien, die am
**2026-09-06T12:28:12.112768Z** erfasst wurden und **751-9301 / 04.09.01(31) / Docker
25.0.4** identifizieren. Dies löst die frühere Aussage ab, es seien nur FW30-Shell-Nachweise
verfügbar gewesen. Die Zeilen 70–77 der erfassten Datei `/etc/config-tools/config_docker` prüfen für `install`
lediglich den Aktivierungszustand: Sie **laden nichts herunter, entpacken nichts und installieren
keine Binärdateien**. `activate` verschiebt einen vorhandenen Boot-Eintrag `S99_docker` und ändert den
Routing-/Firewall-Zustand des Herstellers, bevor der Daemon gestartet wird. `remove` löscht `/home/docker`;
weder dies noch die Deaktivierung ist eine Anwendungsbereinigung. Die SHA-256-Prüfsumme der erfassten Datei lautet
`5da3a5422a53be78507a8db51b9a8f3ef57750059a104261a49540364c8aeb82`
und entspricht dem ursprünglichen Erfassungs-Fingerabdruck. Fehlende Docker-Binärdateien bleiben nicht unterstützt.

Erfasste Laufzeitskripte erfordern ebenso unabhängige Prüfungen von Prozess, `rtsversion=0`
und Boot-Eintrag: Die Auswahl 0 allein kann wirkungslos sein, und ein Versionswechsel
kann `/home/codesys/*` löschen. Einige eingebundene Hilfsskripte und die vollständige Herkunft des kompilierten bzw. Treiber-
Builds sind weiterhin nicht verfügbar; dies ist kein Beleg dafür, dass diese Hilfsskripte
auf dem Gerät fehlen. Die aktuelle Software prüft Release-Identität, erforderliche
Werkzeuge, Getter-Ergebnisse und Nachbedingungen, nicht jedoch eine vollständige Byte-/Build-Attestierung von FW31.
Der aktuelle Vorbereitungs-Quellcode stoppt ausdrücklich beide Laufzeitauswahlen des Herstellers
und ruft dann `config_runtime --wait runtime-version=0 force-new-version=yes restart-server=NO` auf.
Er prüft, dass keine SPS-Prozesse laufen, dass eine reguläre Datei `rtsversion` genau `0` enthält, dass
`S98_runtime` fehlt und dass alternative aktivierte Boot-Einträge nicht auf bekannte SPS-
Programmdateien auflösen, und wiederholt die Deaktivierungsprüfungen nach `sync`. Er prüft unabhängig
das Boot-Medium vor der Herstellerinstallation/-aktivierung, lehnt leere oder `sd-card`-
Ergebnisse ab und verlangt, dass das ausführbare `S99_docker` zu `/etc/init.d/dockerd` auflöst,
ein Getter-Ergebnis `active` und die Docker-Server-Version `25.0.4`. Diese Quelländerungen
lösen ihre frühere Auflistung als Umsetzungs-Nachbesserungen ab; das Hardwareverhalten
und die Validierung der endgültigen Revision bleiben getrennt.
Das Audit führte keine neuen Geräteoperationen durch und belegt weder die Persistenz von sysfs-Berechtigungen, physische E/A, das Neustartverhalten
noch die Härtung der Verwaltung.

## Entscheidungshistorie vor der Umfangsänderung vom 2026-09-06

Die frische Inbetriebnahme des CC100 751-9301 bleibt unvollständig. Hardwaretests können die
unten fehlenden Lebenszyklus- und Zugriffskontrolltransaktionen nicht ersetzen. Die
Bedienoberfläche für Betreiber bleibt die geführte Inbetriebnahme; die unten aufgeführten technischen Erfassungen sind
keine Anleitungen zur manuellen Einrichtung durch Betreiber.

### Implementierte Teilmenge (historisch)

Host- und Shell-Prüfungen erfordern eine eindeutige CC100-FW31-Identität. Ein BSP-Label allein
genügt nicht. Die Übertragung der Laufzeit behält die Wiederherstellung nach unterbrochener Übertragung, minimale
Container-Rechte, exakte Mounts digitaler Register und Prüfungen auf konkurrierende Container bei.
Sowohl ein laufender CODESYS-Prozess als auch sein gespeicherter Boot-Link `S98_runtime` blockieren
die Installation, ohne SPS-Daten zu verändern.

Die Verwaltungsoberfläche unterstützt additive Schlüssel für ein vorhandenes Nicht-Root-OpenSSH-Konto
oder einen **Dropbear-2025.88**-Peer, der auf derselben erfolgreich authentifizierten,
gepinnten SSH-Verbindung identifiziert wurde. Der Identifikationsdatensatz von OpenSSH wird im Speicher geparst
und verworfen; fehlende, doppelte oder widersprüchliche Datensätze bleiben unbekannt. Der Zugriff auf die ausführbare Datei von Root-Prozessen
ist nicht erforderlich. Unbekannte Versionen, gemischte Daemons und Root-Konten
werden abgelehnt. Anderen Dropbear-Prozessen wird nicht die Version des verbundenen Peers zugewiesen.
Das Datensatzformat stammt aus dem [Identifikationsaustausch von OpenSSH](https://github.com/openssh/openssh-portable/blob/V_10_0_P2/kex.c).
Es wird nur verwendet, nachdem derselbe SSH-Client erfolgreich mit strikter Host-Schlüssel-Prüfung
und Authentifizierung beendet wurde. Die Verbindungsfreigabe ist deaktiviert.
Jeder neue Schlüssel deaktiviert Agent-, Port- und X11-Weiterleitung sowie die PTY-Zuweisung. Das
Journal sorgt für atomares Hinzufügen, Ablauf, Wiederherstellung nach Unterbrechung und Ablehnung
gleichzeitiger Bearbeitung. Eine frische gepinnte Verbindung muss sich nur mit dem neuen Schlüssel
authentifizieren. Ein eigenes Verzeichnis für autorisierte Schlüssel oder eine PAM-Ablehnung lässt die Verifizierung
fehlschlagen und löst die Wiederherstellung aus. Dies belegt den Befehlszugriff des Kontos, keinen
Ausführer mit minimalen Rechten; Shell-Befehle behalten die Rechte dieses Kontos. Die Unterstützung der vollständigen Baseline
ist ausdrücklich `UNSUPPORTED`; die Registrierung behauptet keine Root-/Passwort- oder WBM-Einschränkungen.

Die alte Start-Aktion für installiertes Docker ist deaktiviert. Der angenommene LSB-Vertrag `status=3`
wird durch den Herstellerquellcode widerlegt, und das Daemon-only-Journal kann
Netzwerk-Hooks nicht rückgängig machen. Die Prüfung ruft nie eine Init-Statusaktion auf
und akzeptiert die Existenz der normalen Hersteller-Datei `daemon.json`. Eine gestoppte installierte
Laufzeit meldet `unsupported-lifecycle-dependencies`. Gespeicherte Berichte können die veraltete
Aktivierungsaktion nicht freischalten; der Koordinator lehnt sie ab, bevor er ein Token speichert
oder den Controller kontaktiert. Vorhandene Tokens bleiben erhalten.

Journale mit `start-intent` oder `started` bleiben ungelöst, selbst wenn Docker
gestoppt ist oder eine alte Quittung `restored` meldet: Der Start durch den Hersteller kann nach einem fehlgeschlagenen Daemon-Start
`WAGO_DOCKER_IPT` hinterlassen. Wiederherstellung und Abschluss behalten diese
Journale mit `unresolved-lifecycle-effects`; es wird kein Hersteller-Stopp abgeleitet. Ein fehlendes
Journal kann die Wiederherstellung ebenfalls nicht belegen. Nur ein vorbereitetes Journal ohne einen der beiden Start-Marker
kann passiv abgeglichen werden. Moderne Firmware-/Dienst-Snapshots müssen übereinstimmen; Basis-Journale
enthielten diese Snapshots nie, daher wird der aktuelle Kontext separat in `reconciliation/` erfasst,
ohne historische Nachweise zu erfinden. Teilweise moderne Snapshots werden nicht als Legacy behandelt.
Der Hilfsmechanismus für den Abschluss `accepted` hat keinen Produktionsaufrufer und bietet keinen geführten Abschluss des Lebenszyklus.

### Tatsächlicher Quellcode und ungeklärte Verträge (historisch)

Untersuchte Quelle: offizielles [WAGO SDK FW30-V04.08.09](https://github.com/WAGO/cc100-firmware-sdk/tree/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0),
Commit `b2a09cc66ad07af54a34701d6cfc90f31aca5cd0`. Dies ist **kein Nachweis für FW31-Kompatibilität**. Übereinstimmende Bytes
der eingesetzten Abhängigkeiten oder identifizierbare kompatible Versionen können eine Schranke begründen; das Firmware-Label oder ein Hash
der obersten Ebene allein kann das nicht. Die
[FW31-Release-Notes](https://downloadcenter.wago.com/api/uploads/2026_05_04_Release_Notes_751_9x0x_88b4755930.pdf)
identifizieren das Release 04.09.01(31) des 751-9301 und CODESYS 3.5.21.5, nicht jedoch die vollständige
installierte Menge an Skript-/Build-Abhängigkeiten.

| Vorgang                      | Vertrag laut tatsächlichem Quellcode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Exakte ungeklärte Grenze                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker-Aktivierung           | Die [Home-Variante](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_docker_home) entpackt das Hersteller-Archiv nach `/home/wago-docker`; die [Root-Variante](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_docker_root) setzt als root installierte Binärdateien voraus. `activate` verschiebt `S99_docker`, aktiviert Routing, falls deaktiviert, und aktiviert bzw. fügt eine Docker-MAC-Whitelist-Regel hinzu. | Erforderlich sind ein passendes Werkzeug-/Getter-Paar, Archiv-/Build-Identität, Hilfsskripte/Ereignisse sowie der vorherige Boot-/Routing-/Firewall-Zustand. `deactivate` lässt die Weiterleitung aktiviert und kann eine zuvor aktivierte Regel deaktivieren; `remove` löscht Docker-Daten. Keines von beiden ist eine Umkehrung.                                                                                                                                                |
| Daemon-Lebenszyklus          | Das [Init-Skript](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dockerd) implementiert start/stop/restart. Start ändert `WAGO_DOCKER_IPT`; Stopp löst jedes Netzwerkereignis aus. Abschließende Echo-Ausgaben können einen Fehler verdecken.                                                                                                                                                                                                                                                                         | Vollständige Ereignisidentität und Wiederherstellung fehlen. Das byte-identische ausführbare Fixture belegt diese Effekte; gemockte LSB-Semantik kann die Aktivierung nicht autorisieren.                                                                                                                                                                                                                                                                                         |
| Boot und Berechtigungen      | [rcS](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/rcS) führt `run-parts -a start /etc/rc.d` aus. Der [mitgelieferte Kernel](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/src/linux-6.6.94-rt56-w05.08.01-gaa7927dc8052.tgz) definiert DOUT 0644 und DIN schreibgeschützt.                                                                                                                                                                                      | Eine dauerhafte Freigabe erfordert numerische GID-Vergabe, exakte Attribute, geschützte Pfade und Boot-Identität, mit einer ausdrücklichen Schranke für Fehler beim Containerstart. Ein Hook vor Docker stoppt spätere Hooks nach einem Fehler nicht. Code zum Gewähren/Wiederherstellen ist nicht implementiert.                                                                                                                                                                 |
| CODESYS-Erhaltung            | [config_runtime](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_runtime) kann `/home/codesys/*` löschen, wenn Laufzeit 0 gewählt wird. Das Stoppen über das [Laufzeit-Init](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/runtime) vermeidet dieses Zurücksetzen, kann aber SIGKILL senden.                                                                                                                                    | Es wurde kein konsistenter Vertrag für Checkpoints des Retain-Speichers ermittelt. Das eingesetzte Init hat Build-Ersetzungen; ein Template-Hash genügt nicht. Anwendungsziel, Auswahl und Boot-Link erhalten.                                                                                                                                                                                                                                                                    |
| Backup/Wiederherstellung     | [save_partition.sh](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/usr/sbin/save_partition.sh) erstellt eine Sicherungskopie großer Teile von `/home`, ausgenommen Docker; [restore_partition.sh](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/usr/sbin/restore_partition.sh) löscht `/home/*`, einschließlich ausgenommener Verzeichnisse.                                                                                                                      | Dies ist weder ein ruhender SPS-Checkpoint noch ein eng begrenzter Docker-Rollback. `reboot=0` unterdrückt nur den abschließenden Neustart.                                                                                                                                                                                                                                                                                                                                       |
| Eindeutige Schlüssel         | [Mitgeliefertes Dropbear 2025.88](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/src/dropbear-2025.88.tar.bz2): `svr-authpubkey.c` löst das Home-Verzeichnis auf; `svr-authpubkeyoptions.c` implementiert Einschränkungen; `svr-runopts.c` und `common-runopts.c` implementieren `-V`.                                                                                                                                                                                                                                                       | Die implementierte additive Teilmenge erfordert eine erfolgreiche Authentifizierung mit dem neuen Schlüssel. Sie erstellt kein Konto und schränkt keine Host-Rechte ein.                                                                                                                                                                                                                                                                                                          |
| Root-/Passwort-Einschränkung | [config_ssh](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_ssh) dokumentiert `root-access-state=disabled password-request-state=disabled`. Das [Dropbear-Init](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dropbear) bildet diese auf `-w`/`-s` ab.                                                                                                                                                                         | Das Init bindet eine Shell-Konfiguration/ein Hilfsskript ein, kann Host-Schlüssel erzeugen und führt SSH-Ereignisse aus. Deren FW31-Identität, neustartsicherer Rollback, frische negative Authentifizierungsprüfungen und ein eng begrenzter privilegierter Ausführer fehlen. Die Standard-[CC100-sudoers](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot.cc100/etc/sudoers) erlaubt kein beliebiges `sudo sh -c`. |
| WBM/Dienste                  | [config_port](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_port) delegiert HTTP/FTP/FTPS an `config_ssl`, SNMP an `config_snmp`; [config_iocheckport](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_iocheckport) bearbeitet/startet inetd neu.                                                                                                                                                                  | Das Deaktivieren von HTTP schaltet Lighttpd auf HTTPS um; das WBM bleibt verfügbar. Separate Dienstkonfiguration, Reload/Ereignisse und Wiederherstellung sind erforderlich; diese Befehle allein begründen keine vollständige Baseline der Exposition.                                                                                                                                                                                                                           |

Die Docker-Untersuchung erreichte auch kompilierte Abhängigkeiten:
[GetActivePartitionMedium](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/local_src/config-tools/get_filesystem_data_common.c#L740)
ruft `get_device_data medium` auf. Der Firewall-Code hat zusätzliche Regeln, Schemata,
Skripte und Ereignisse. Die CC100-Datei `board_specific_defines` enthält die Build-Ersetzung
`@CT_EXTENSION_PREFIX@`. Hashes von Quell-Templates und unbekannte Hashes der kompilierten FW31-Binärdateien
können keine übereinstimmenden installierten Implementierungen belegen.

### Minimale zusätzliche rein lesende Erfassung (historisch)

Die kleinste Offline-Eingabe ist das offizielle `Firmware_CC100_040901_31.zip`,
277551981 Bytes, SHA-256 des Herausgebers
`8fd32f96c3aa180aea72b71286e2e624e16b157c7d4ff5e96519acb5bdd41451`.
Die [Artefakt-Metadaten von WAGO](https://downloadcenter.wago.com/api/ArtifactDetails/moln38txl7pphd17yug/en)
identifizieren dieses Image-/WAGOupload-Archiv. Die unabhängige Release-Untersuchung erhielt
ein leeres `href` von anonymem `/api/download` und verifizierte, dass das offizielle Frontend
vor dem Download authentifizierten Premium-Zugang verlangt. Eine spätere
unabhängige Prüfung erhielt HTTP 403 für die Metadaten und konnte die frühere Antwort nicht erneut bestätigen. Es wurden keine Archiv-
Bytes oder Zugangsdaten erlangt. Ein autorisierter Download in ein temporäres Verzeichnis
würde die Verifizierung der Prüfsumme und eine selektive, nicht ausführende Image-Untersuchung ermöglichen,
ohne Gerätezugriff. Eine Prüfsumme des Herausgebers ist keine lokal verifizierte Prüfsumme.

Die exakten fehlenden Bytes/Build-Identitäten der eingesetzten Dateien sind an diese Quellaufrufe gebunden:

- Das Docker-Home-Skript [Zeile 23](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_docker_home#L23)
  bindet die Werkzeugbibliothek ein; Zeile 65 ruft den kompilierten Dateisystem-Helfer auf; die Zeilen
  76, 104–109 und 186–198 entpacken Binärdateien, verschieben den Boot-Link, konfigurieren Routing
  und wenden Firewall-Regeln an. `config_tool_defines` [Zeile 58](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/config-tools/config_tool_defines#L58)
  bindet zusätzlich die boardspezifische generierte Datei ein. [Zeile 780](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/local_src/config-tools/get_filesystem_data_common.c#L780)
  des Dateisystem-Helfers ruft `get_device_data` auf; der Abgleich nur des Shell-Einstiegspunkts kann diesen Pfad nicht absichern.
- Das Dropbear-Init [Zeilen 19 und 100–132](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/dropbear#L19)
  bindet Daemon-Konfiguration und Init-Hilfsskript ein, führt optional `setup_ssh_keys` aus
  und löst SSH-Ereignisse aus. Deren tatsächlicher FW31-Inhalt bzw. Fehlen und die wirksame
  Konto-/PAM-/sudo-Richtlinie werden benötigt, bevor eine aussperrungssichere Einschränkungstransaktion möglich ist.
- Das Boot-Init [Zeile 23](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/rcS#L23)
  führt alle rc.d-Einträge aus; die [Build-Regeln 78–91](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/rules/initmethod-bbinit.make#L78)
  wählen alternative Init-Dateien aus und rendern inittab. Die tatsächlich ausgewählten/gerenderten
  FW31-Dateien, Boot-Links und der Besitz der Berechtigungen sind die fehlende Persistenzschranke,
  nicht ein geratener Kompatibilitäts-Hash eines ungerenderten Templates.
- Das Laufzeit-Init [Zeilen 304–305 und 370–382](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/projectroot/etc/init.d/runtime#L304)
  kann SIGKILL senden, ersetzt die cgroup-Operation der Laufzeit und löst CODESYS-Ereignisse aus.
  Weder diese Templates noch das Archiv allein belegen einen Checkpoint des Retain-Speichers;
  dafür wird der dokumentierte Retain-/Sicherungsvertrag der entsprechenden Laufzeit benötigt.

Diese bekannten FW30-Verträge stützen die weitere Umsetzung, sobald die vollständige Schranke
spezifiziert werden kann. Sie behaupten weder, dass die Befehle grundsätzlich unsicher sind,
noch dass Hardwaretests der Software vorausgehen müssen. Der aktuelle Code
implementiert diese Transaktionen für Lebenszyklus, Berechtigungen oder Einschränkungen noch nicht.

Nur für eine gesondert autorisierte SSH-Sitzung mit gepinntem Host-Schlüssel; es wurde auf keinen Controller zugegriffen.
Beginnen Sie mit der Identität und diesen Abhängigkeits-Fingerabdrücken. Bei einer Abweichung benötigen Sie nur den
Quellcode des betreffenden Herstellerskripts und neu identifizierte Abhängigkeiten, keinen vollständigen Dump.

```sh
awk '/^(VERSION|VERSION_ID|PTXDIST_PLATFORM_NAME)=/' /etc/os-release
uname -r
ps -eo comm=
sha256sum /etc/config-tools/config_docker /etc/config-tools/get_docker_config \
  /etc/config-tools/config_tool_lib /etc/config-tools/config_tool_defines \
  /etc/config-tools/board_specific_defines /etc/config-tools/config_routing \
  /etc/config-tools/config_routing_lib /etc/config-tools/get_filesystem_data \
  /etc/config-tools/get_device_data /etc/config-tools/firewall \
  /etc/init.d/dockerd /opt/wago-docker/sbin/iptables \
  /usr/bin/docker /usr/bin/dockerd /etc/init.d/rcS /etc/inittab
ls -ldn /etc/rc.d/S99_docker /etc/rc.d/disabled/S99_docker \
  /etc/rc.d/S98_runtime /home/codesys \
  /sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din \
  /sys/kernel/dout_drv/DOUT_DATA
readlink /etc/rc.d/S99_docker
readlink /etc/rc.d/disabled/S99_docker
readlink /etc/rc.d/S98_runtime
readlink /home/codesys
awk -F: '$3 == 10001 { print "uid10001-occupied" }' /etc/passwd
awk -F: '$3 == 10001 { print "gid10001-occupied" }' /etc/group
```

Erfassen Sie außerdem numerischen Besitz/Modus der Skripte und übergeordneten Verzeichnisse;
Dateinamen/Hashes der Netzwerk- und Firewall-/iptables-Ereignisse; nur Docker-
Data-Root/Logging, allgemeinen Routing-Zustand und zu Docker passende MAC-Whitelist-Einträge.
Rufen Sie keine unbekannten Binärdateien mit geratenem `--help` auf und führen Sie keine Getter aus, bevor
Sie deren Quellcode geprüft haben.

Erstellen Sie für SSH Hashes von `config_ssh`, `get_ssh_config`, `init.d/dropbear`, dem aufgelösten Daemon,
`/lib/init/initmethod-bbinit-functions.sh`, dem optionalen `setup_ssh_keys` und den SSH-Ereignissen.
Lesen Sie nur `ROOT_LOGIN`, `ROOT_PASSWORD_LOGIN`, `PASSWORD_LOGIN`,
`LOCAL_PORT_FORWARDING`, `REMOTE_PORT_FORWARDING`, `ANY_HOST_FORWARD` und
`DROPBEAR_PORT` aus `dropbear.conf`; binden Sie sie nicht ein (source). Erfassen Sie die numerische UID/GIDs,
das Home-Verzeichnis/die Shell und die wirksamen sudo-Regeln des vorgesehenen Kontos, ohne Passwortfelder.
Erfassen Sie für CODESYS die Hashes von Laufzeitskripten und `runtimes.conf`, die Auswahl
in `/etc/specific/rtsversion` und die Link-Metadaten. `get_runtime_config` ist keine
rein lesende Erfassung: Sein gemeinsamer Helfer kann `runtimes.conf` erzeugen.

Es werden keine Schlüssel, Passwörter, Anwendungsarchive, Prozessargumente, Umgebungen oder umfangreiche
Protokolle benötigt. Diese Erfassungen belegen Implementierungs- und Zustandsidentität. Hardware-
Neustart, Stromausfall, Retain-Zustand und Nachweis der physischen E/A bleiben getrennt.
