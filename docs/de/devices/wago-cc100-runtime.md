# WAGO CC100 Docker-Runtime

> **Technische Referenz, nicht der unterstützte Installationsweg für Betreiber.** Dieser Leitfaden dokumentiert die manuelle Runtime-Basis bei `9e0a1c47`. Sie ist nicht an Hardware validiert: [ATT-984](https://linear.app/attraccess/issue/ATT-984/prove-the-no-code-cc100-journey-on-hardware-with-a-nontechnical-user) ist die Freigabeschranke. Steuern Sie damit keine Geräte, solange die erforderlichen Hardware- und Benutzernachweise fehlen. Folgen Sie der [Geführten Inbetriebnahme](devices/wago-cc100-commissioning.md) für den SSH-basierten UI-Weg und den [Abnahmenachweisen](devices/wago-acceptance-evidence.md) für die Freigabevoraussetzungen. Die folgenden manuellen Shell-, Registry-, JSON-Zuordnungs- und Zugangsdaten-Kopierschritte erfüllen diese Schranke nicht.

## Frontpanel-Konfiguration und Live-Steuerung

Die Konfigurationsseite des Controllers zeigt alle vier Ausgänge und acht Eingänge. Benennen Sie eine Klemme, um sie zu verwenden; das Löschen ihres Namens entfernt die Zuordnung. Klemmen- und Geräteeinstellungen öffnen sich in seitlichen Bereichen. RS-485-Einstellungen werden zwischen Geräten geteilt, während jedes Modbus-Gerät seine Adresse, sein Profil, Abfrageintervall und seine serielle oder TCP-Verbindung angibt. Integrierte Profile sind schreibgeschützt; Anpassen erstellt eine bearbeitbare Kopie mit Register-Funktionscodes, Adressbasen sowie Byte- und Wortreihenfolge.

Änderungen bleiben bis **Auf Controller anwenden** unappliziert. **Verwerfen** stellt die angewendete Konfiguration wieder her. Bestehende Auswirkungen auf Flows müssen weiterhin bestätigt werden. Versionsverlauf und Rollback stehen auf der separaten Seite **Versionsverlauf** bereit.

Live-Steuerung erfordert eine aktuelle Runtime mit `front-panel-v1` und einer passenden angewendeten Revision. Sie verwendet immer die angewendeten Kanalidentitäten und Verhaltensweisen, auch bei unapplizierten Änderungen. Manuelle Befehle sind bestätigte MQTT-Befehle mit `source: "manual"`; die Runtime meldet `manualOutputChannelIds` in ihrem gespeicherten Zustand. Der nächste erfolgreiche Flow-Befehl übernimmt diesen Ausgang. **Freigeben** hebt die manuelle Zuständigkeit auf, ohne Hardware zu schreiben oder deren Zustand zu ändern; automatisches Pulsende und Trennungsrichtlinien gelten weiterhin. Freigeben stellt keinen früheren Flow-Zustand wieder her.

Eingangsinvertierung beeinflusst den gemeldeten Eingangszustand, Bedingungen und Rückmeldungen. Modbus-Schalter lesen Coils mit FC01 und Holding-Register mit FC03; das Zurücklesen läuft in der Abfrageschleife und blockiert weder Konfigurationsannahme noch Befehlsbestätigungen. Ein Modbus-Zustand wird nie allein aus einem Befehl abgeleitet. Die Abfrage verwendet das konfigurierte Intervall jedes Geräts. Die Seite aktualisiert empfangene Diagnosedaten alle zwei Sekunden; sie ist eine Live-Abfrageansicht, kein Push-Stream.

## MQTT-Server oder gespeicherte SSH-Adresse ändern

Öffnen Sie bei einem vollständig verwalteten Controller **Details → Erweitert → MQTT-Server ändern oder aktualisieren**. Geben Sie seine private IPv4-Adresse im neuen Netzwerk ein und wählen Sie einen Attraccess-MQTT-Server. Die erneute Auswahl des aktuellen Servers aktualisiert dessen Adresse, TLS-Einstellungen und Gerätezugangsdaten. **Nur CC100-Adresse aktualisieren** prüft und speichert das neue SSH-Ziel, ohne MQTT-Zugangsdaten bereitzustellen oder die Runtime neu zu starten. Das Adressfeld ändert das Verbindungsziel von Attraccess; es konfiguriert nicht das Netzwerk des CC100.

Die erste SSH-Verbindung verwendet die eingegebene Adresse und den bestehenden festgelegten Host-Fingerabdruck. Weder die vorherige Controller-Adresse noch der vorherige Broker müssen antworten. Das eingeschränkte Verwaltungskonto erhält nur feste Hilfsbefehle; die signierte Veröffentlichung des Hilfsprogramms stellt den aktualisierten Vorgang bereit. **Vorherigen SSH-Zugang wiederherstellen** beendet die automatische Verwaltung und gehört nicht zu einem Netzwerkwechsel.

Ein MQTT-Wechsel stoppt die Runtime unter der gemeinsamen Installationssperre, aktualisiert `/etc/attraccess-wago/runtime.env` sowie permanente Zugangsdaten in `/var/lib/attraccess-wago/state.json` und erstellt `attraccess-wago` mit seinem installierten Image und der erfassten Docker-Konfiguration neu. Bestehende Mounts, Geräte, Hardwareprofil, erforderliche Umgebung und gespeicherter Runtime-Zustand bleiben erhalten. Ein kurzlebiges festes Wartungsprogramm verwendet Node aus demselben Image und die lokale Docker-API zum Erhalt der Containereinstellungen; die verwaltete Runtime erhält niemals den Docker-Socket. Der Start erfolgt über die bestehende Hardwareprüfung und den Supervisor mit Neustartrichtlinie `no`.

Attraccess aktualisiert zuerst seine gemeinsame MQTT-Verbindung anhand der aktuellen Einstellungen des gewählten Servers und erhält registrierte Themenabonnements. Dies erfordert den passenden Attraccess-API-Build. Es löscht die vorherige gespeicherte Zugangsdatenbestätigung und verlangt eine neue authentifizierte Gerätebestätigung auf dem gewählten Broker. Anschließend speichert es Controller, Inbetriebnahmesitzung, Zugangsdatenepoche und verschlüsselte SSH-Adressbindung konsistent. Der seitliche Bereich meldet Fortschritt und konkrete Fehler, ohne Zugangsdaten zurückzugeben. Ein unterbrochener Wechsel erhält eine verschlüsselte Serverabsicht und ein privates Controller-Journal; **Gespeicherten Wechsel wiederholen** wendet dieselben Einstellungen und Zugangsdaten zu Ende an, auch nach einer Unterbrechung zwischen Containerlöschung und Neuerstellung. Wenn die Anwendung abgeschlossen, aber die MQTT-Prüfung fehlgeschlagen ist, korrigieren Sie die Serveradresse oder TLS-Einstellungen und wiederholen Sie: Attraccess stellt eine Ersatzabsicht bereit und speichert sie, bevor es das vorherige Journal freigibt. Ein unterbrochener Ersatz verwendet seine gespeicherten Zugangsdaten weiter. Inbetriebnahme, Runtime-Updates, Zugangsdatenrotation und SSH-Wiederherstellung bleiben bis zum Abschluss blockiert.

Der Wechsel behält die vorherige Broker-Zuordnung zur Zugangsdatenbereinigung. Wenn dieser Broker verfügbar ist, verwenden Sie **Vorherige Broker-Zugangsdaten entfernen**. Die Bereinigung ist unabhängig vom erfolgreichen Wechsel, lehnt ein mit dem aktuellen Server geteiltes Broker-Ziel ab und muss vor dem Entfernen des Controllers abgeschlossen sein.

## Bereitstellungswege dürfen nicht vermischt werden

### Build-eigene Artefakte und technischer Stand verwalteter Updates (ATT-1099)

`apps/plugins/wago/cc100-runtime/manifest.json` ist die manuell gepflegte Runtime-Versionsdatei. Erhöhen Sie `runtimeVersion` (derzeit `0.2.1`) bei Änderungen an Runtime-Quellen, gemeinsamen Runtime-Verträgen, Image-Abhängigkeiten oder Bereitstellungscode. Erkennung, permanente Heartbeats und paketierte Artefakte verwenden diese Version. Der erforderliche CI-Job `wago-runtime-version` lehnt Runtime-Änderungen ohne eine strikt höhere stabile `major.minor.patch`-Version ab. Dokumentation, Tests und reine Simulatoränderungen benötigen keine Erhöhung. Abhängigkeits- und Lockfile-Änderungen werden vorsichtig geprüft, da sie Runtime-Bundle oder Build-Werkzeuge verändern können.

Verwaltete Updates behalten eine installierte Runtime derselben Version, auch wenn ein erneuter Docker-Image-Build dessen Konfigurations-Digest ändert. Sie aktualisieren trotzdem das signierte Verwaltungshilfsprogramm und verlangen frische Bereitschaft für das installierte Image. Ein Versionswechsel löst die normale zustandserhaltende Aktualisierung mit Prüfsummen- und Docker-Identitätsprüfung aus. Alle historischen `0.1.0`-Images werden einmal auf `0.2.0` aktualisiert; ihre Version unterschied Runtime-Quelländerungen nicht. Server-Commit-SHAs bleiben Build-Herkunft, keine Runtime-Versionen.

Der ATT-1099-Entwurf liefert `release.json`, `wago-cc100-runtime.tar` und dessen `.sha256`-Datei mit dem Server-Image unter `/app/share/cc100-runtime`. Diese Artefakte werden durch `.github/actions/build-cc100-runtime` aus den ausgecheckten Quellen gebaut. Sie liegen außerhalb des npm-Plugin-Pakets, dessen Host-Importer ein Archivlimit von 50 MiB hat. Das komprimierte Docker-Archiv bleibt das Element `image.tar` im äußeren Tar; Docker akzeptiert dieses gzip-Element direkt. Weder generierte Bundles noch Verwaltungsschlüssel gehören in Git.

Bauen Sie für lokale Entwicklung die vollständige Offline-ARMv7-Runtime mit `pnpm nx run plugin-wago:build-runtime` (Docker Buildx mit ARMv7-Unterstützung erforderlich). `pnpm nx run plugin-wago:install-runtime-dev` baut und kopiert sie nach `${STORAGE_ROOT:-storage}/cc100-runtime`; das Installationsziel hängt vom Build-Ziel ab. Beide Ziele sind ungecacht und verwenden denselben Paketierungsweg wie CI. Sie sind explizite Vorgänge; `pnpm serve` und Plugin-Installation lösen keinen Runtime-Build aus. Starten Sie eine laufende API nach dem Ersetzen ihrer installierten Artefakte neu.

`WAGO_CC100_BUILD_ASSETS_PATH` wählt dieses Verzeichnis. Der Katalog prüft vor Verwendung Bundle-Prüfsumme, Byteanzahl, eingebettetes Kompatibilitätsmanifest und Build-Beschreibung. Benutzerdefinierte Runtime-Importe werden nicht unterstützt; der alte `current`-Zeiger des gemeinsamen Speicherkatalogs wird ignoriert. Fehlende oder inkompatible Build-Artefakte lassen die Produktionsinitialisierung des Plugins fehlschlagen. Die Entwicklung kann ohne Artefakte starten und zeigt stattdessen explizite Build-Anweisungen. Beim Docker-Image-Bau werden Lesbarkeit und Prüfsumme der Artefakte als unprivilegierter Anwendungsbenutzer geprüft.

Die Paketierung veröffentlicht bei expliziten Neubauten einen vollständigen Ersatz von `cc100-build`. Starten Sie den Entwicklungsserver nach Installation von Ersatzartefakten neu. Laufende Kataloge behalten ihre gewählte Version und unveränderliche Auslieferungssnapshots. Die Beschreibung identifiziert den ausgecheckten Build, Plattform-, Profil- und Protokollkompatibilität, Transportprüfsumme und Docker-**Konfigurations-Digest** (`imageId`). Ihre Offline-Image-Referenz ist an diesen Digest gebunden und keine Registry-Pull-Referenz. Neukomprimierung oder ein anderer Tag beziehungsweise eine andere Build-ID stellt bei unveränderter Runtime-Version kein Update dar. Der verwaltete Start liefert diese Identität als `WAGO_RUNTIME_IMAGE_ID`; frische permanente Heartbeats melden sie als `runtimeImageId`. Alte Heartbeats können das Feld weglassen.

Die Update-Transaktionsbausteine sind von destruktiver Inbetriebnahme getrennt. Sie begrenzen und prüfen Übertragungen per Prüfsumme, prüfen Docker-Identität und ARMv7-Kompatibilität, wiederholen die Host-Prüfung, erhalten einen gestoppten Vorgänger und sichern den registrierten Zustand im selben `/var/lib`-Dateisystem vor dem Supervisor-Start eines Ersatzes. Die Aktivierung veröffentlicht außerdem den Boot-Hook des aktuellen Builds neu und verwendet dessen aktuelle Docker-Geräte- und Bind-Mount-Argumente, einschließlich optionaler RUN-LED-Mounts. Rollback stellt den vorherigen Hook samt Container und Zustand wieder her. Das root-eigene Journal ist `/var/lib/attraccess-wago-update-transaction`. Zustands-Mountpoints und verschachtelte Mounts werden abgelehnt, da die Wiederherstellung atomare Umbenennungen erfordert. Nach der Annahme bleiben Wiederherstellungsdaten bis zu einer dauerhaften Serverbestätigung erhalten; die Bereinigung verwendet ein separates fortsetzbares Verzeichnis mit Zuständigkeitsmarkierung. Kein Update-Baustein gibt erneut Registrierungszugangsdaten aus, ersetzt `runtime.env` oder CA, oder bereinigt fremde Container und Images. Geordnetes Server-Shutdown wartet, bis abgebrochene SSH-Vorgänge ihre Geräte-Leases freigeben, bevor der Speicher geschlossen wird. Die dauerhafte Journalabsicht bleibt für normale Abgleiche nach Neustart verfügbar. Nach Crash-Wiederherstellung und Bestätigung gibt der Abgleich die Lease frei; der nächste automatische Scan startet eine nötige Aktualisierung mit einer neuen Vorgangsfrist.

Update-Staging schreibt das authentifizierte äußere Bundle direkt in das Journal-Dateisystem und streamt `image.tar` durch eine private FIFO zu Docker. Extraktor und Docker müssen erfolgreich sein, bevor Image-Identität und Plattform geprüft werden. Der bytebegrenzte Empfänger verwendet begrenzte `dd`-Blöcke und prüft nach jedem Lesen Dateigrößenmetadaten, auch bei kurzen Pipe-Lesevorgängen, ohne das Archiv erneut zu scannen. Er unterstützt native und knappe FW31-stat-Formate und benötigt weder optionales `head -c` noch `dd iflag`. Er prüft höchstens die erwartete Bundle-Größe plus ein Byte innerhalb von 300 Sekunden. Unvollständige oder übergroße Übertragungen, Prüfsummenfehler, Empfängerwerkzeugfehler und Empfängerzeitüberschreitungen haben getrennte handlungsleitende Fehler. Beobachtungen je Block verwenden die bereits von der äußeren Prüfung erkannte stat-ABI mit strikten Größenlimits, statt deren mehrprozessige Erfassung bei jedem kurzen SSH-Lesevorgang zu wiederholen. Der gesamte Upload wird weiterhin auf Größe und Prüfsumme geprüft, bevor Docker ihn laden darf. Der verifizierte Upload wird vor Aktivierung entfernt; Rollback verwendet den erhaltenen Vorgänger und Zustandssnapshot und benötigt keines der Archive. Die Zulassung verlangt eine Bundle-Größe auf `/var/lib`, drei Bundle-Größen am ermittelten Docker-Datenverzeichnis und 16 MiB Reserve je Dateisystem; bei gemeinsamen Dateisystemen werden diese Anforderungen addiert. Die Docker-Reserve ist eine Zulassungsrichtlinie, keine garantierte Obergrenze der Image-Entpackung. Aktivierung prüft separat den Snapshot-Speicherplatz. Unbenutzte Inbetriebnahme-Uploadpfade einschließlich `/tmp` beeinflussen die Update-Zulassung nicht.

Ein verwaltetes Runtime-Update kann eine festgefahrene MQTT-Runtime über ihre verifizierte SSH-Identität und vorbereitete Transaktion ersetzen. Aktivierung benötigt keinen Heartbeat des alten Prozesses. Annahme erfordert weiterhin den Heartbeat des gewählten Images und Bereitschaft aus demselben Boot, beide neuer als die Aktivierung. Ein bekannter alter Boot wird auch bei veraltetem letzten Heartbeat abgelehnt; fehlende alte Telemetrie umgeht weder Image-, Aktualitäts- noch Bereitschaftsprüfung.

Nach dauerhafter Serverbestätigung entfernt OTA bei Erfolg das ausgemusterte Vorgänger-Image oder nach Rollback das fehlgeschlagene Kandidaten-Image. Die Bereinigung ist auf das exakt im Update-Journal erfasste Image begrenzt und erhält Images, auf die laufende oder gestoppte Container verweisen. Sie erzwingt nie das Entfernen und führt kein Docker-Prune aus. Fehlgeschlagene Docker-Inventarisierung oder Entfernung erhält das Journal für den bestehenden Bereinigungsretry des Koordinators, ohne ein angenommenes Update rückgängig zu machen.

Der begrenzte lesende Hilfsbefehl `storage-status <management-token>` meldet für jeden Speicherpfad verfügbare und erforderliche KiB, Dateisystem und Mountpoint, gefolgt von Größen erhaltener Upload- und Journalpfade des Updatesystems. Er nimmt keine Mutationssperre und löscht keine Dateien. Fehlgeschlagene Zulassung erhält geprüfte Pfad- und Kapazitätswerte über SSH-Klassifizierung und dauerhaften Update-Status hinweg. Der Detailbereich erklärt das Defizit in MiB und ob die vorherige Runtime wiederhergestellt wurde oder Wiederherstellung aussteht. Beliebige Remote-stderr-Ausgaben und Zugangsdaten werden niemals gespeichert oder angezeigt. `receiver-status <management-token>` ist eine lesende Kompatibilitätsprüfung für den alten `head -c`-Empfänger des Hilfsprogramms; sie meldet Unterstützung ohne Mutationssperre oder Runtime-Zustandsänderung.

Automatischer Abgleich wird für **neue verwaltete Registrierungen** eingerichtet. Bestehende Registrierungen werden weder migriert noch stillschweigend übernommen: entfernen und neu registrieren. Die Controller-Tabelle zeigt Runtime-Versionen vor und nach dem Update sowie eine laufende Update-Phase mit Aktivitätsbalken. Der Balken ist unbestimmt, da das Update Phasen statt Übertragungsprozente meldet. Unterschiedliche Images derselben Version enthalten eine kurze Image-ID. Jede Tabellenzeile verwendet höchstens zwei Textzeilen; Fehler, Retry-Zeiten, SSH-Einrichtungsvoraussetzungen und Wiederherstellungsaktionen stehen im Bereich **Details** bereit. Die Suche erfasst Gerätenamen, IDs und gespeicherte IP-Adressen. Seitennavigation begrenzt Darstellung und Statusabfragen auf jeweils 25 Zeilen. Start, permanente Runtime-Heartbeats und ein 30-sekündlicher Retry-Durchlauf treiben den Abgleich mit höchstens zwei aktiven Updates. Neue Verbindungen und geänderte Image-Identitäten fordern sofort einen Abgleich an, auch wenn ein früherer Prüfpunkt für das aktuelle Image noch eine Nachprüffrist hat. Controller mit einem von diesem Server-Build abweichenden Image verwenden den eigenen Status **Software-Update**. Manuelle Befehle, Flow-Befehle und aktuelle Flow-Messwerte bleiben während einer Abweichung unverfügbar, auch nach Rollback auf ein älteres Image. Nach Serverneustart bedeutet **Software wird geprüft**, dass das laufende Image auf Bestätigung wartet; allein dies reiht kein Update ein. Controller ohne frischen Heartbeat zeigen **Keine Antwort**, auch während eines ausstehenden Updates.

Die Runtime meldet `runtime-update-gate-v1`. Sie schaltet beim Start und nach MQTT-Trennung jeden konfigurierten Ausgang aus, bevor sie Bestätigung anfordert, und übersteuert Halte- und Watchdog-Richtlinien sowie manuelle Zuständigkeit. Bis eine verbindungsspezifische Serverbestätigung das laufende Image benennt, lehnt sie Befehle und Konfigurationsänderungen ab und pausiert Eingangs- und Messwertabfragen. Gespeicherte Bestätigungen früherer Verbindungen können die Sperre nicht lösen. Fehlgeschlagenes Ausgangsabschalten hält Bereitschaft auf false und wird wiederholt, während Heartbeat- und Update-Kommunikation weiterlaufen. Die geräteseitige Sperre benötigt diese Runtime-Version; ältere installierte Images erhalten sie mit ihrem ersten automatischen Update. Der Bereich **Details** erklärt klassifizierte Blocker und Wiederherstellungsschritte auf Englisch und Deutsch, einschließlich fehlender Runtime-Artefakte, SSH-Identität und Authentifizierung, CODESYS-Konflikte, Speicher-, Übertragungs-, Bereitschafts- und Wiederherstellungsfehler. Der Status **verified** des verwalteten Zugangs bedeutet nur, dass der SSH-Verwaltungsschlüssel geprüft wurde. SSH-Umstellung und Neustartprüfung enden automatisch nach Bestätigung einer frischen permanenten MQTT-Verbindung, des Widerrufs der Registrierungszugangsdaten, angewendeter Konfiguration und Runtime-Bereitschaft. Die Tabelle zeigt einen kurzen Einrichtungsstatus; **Details** zeigt die tatsächlich ausstehende Voraussetzung und den Fortschritt der SSH-Umstellung beziehungsweise des Neustarts. Es gibt keine manuelle Fortsetzen-Aktion. Bei ausstehender Konfiguration wählen Sie **Konfigurieren**, prüfen und veröffentlichen Sie die Ein- und Ausgangskonfiguration und beheben Sie Ablehnungen; die SSH-Einrichtung setzt nach Controller-Bestätigung automatisch fort. Abgeschlossene aktuelle Controller werden über SSH höchstens alle fünf Minuten nachgeprüft; ein geändertes Build-Image umgeht diese Frist, und erhaltene Transaktionsbereinigung folgt ihrem eigenen Retry-Zeitplan. Modbus-Lesefehler an Peripherie bleiben als Kanalfehler sichtbar, ohne Controller- oder Runtime-Bereitschaft zu blockieren; interne Hardware- und Konfigurationsfehler blockieren weiterhin Inbetriebnahme und Updates. Datenbank-Leases nach festgelegter Geräteidentität serialisieren Updates mit Inbetriebnahme, Verwaltungsübergängen, Entfernung und Zugangsdatenvorgängen.

Die Registrierung erstellt das eigene nicht-root-Konto `attraccess` mit einem eindeutigen Ed25519-Schlüssel. Der Host-Geheimnisdienst verschlüsselt den privaten Schlüssel und das zufällige root-Wiederherstellungspasswort vor Remote-Mutation in `plugin_wago_managed_access`. Das temporäre Bootstrap-Passwort wird nie gespeichert. Der verschlüsselte Umschlag ist an Inbetriebnahmesitzung, Transaktion und festgelegte Geräteidentität gebunden. Das eigene Konto besitzt nur ein festes sudo-Hilfsprogramm ohne Argumente; sein root-eigener öffentlicher Schlüsseleintrag erzwingt dieses Hilfsprogramm und verweigert Weiterleitung und PTY. Der Transport verwendet einen isolierten kurzlebigen Agenten, festgelegte Host-Schlüssel und reine Schlüsselauthentifizierung, ohne temporäre private Schlüsseldatei oder Rückfall auf geerbten Agenten beziehungsweise Passwort.

Nach Prüfung permanenter Identität, Registrierungswiderruf, angewendeter Konfiguration und frischer Runtime-Bereitschaft nimmt die Inbetriebnahme ihre Installationsjournale an. Erst dann ersetzt sie das Dropbear-Startskript durch den Attraccess-Wrapper mit `-G attraccess -w -s`. Eine zweite frische verwaltete Verbindung, authentifizierte Prüfung von Daemon- und Listening-Socket-Richtlinien, eine negative root-Passwortprobe und eine weitere verwaltete Verbindung gehen dem Commit voraus. Ein unabhängiger Drei-Minuten-Watchdog bleibt dann aktiv, während das feste Hilfsprogramm den Controller neu startet. Eine geänderte Host-Boot-ID, frische unabhängige reine Schlüsselverbindungen, Daemon- und Socket-Prüfung sowie root-Passwortablehnung müssen nach dem Neustart vor dem Commit erfolgreich sein. Der frühe Boot-Hook startet ein neues dreiminütiges Rollback-Fenster; ein verlorener Server stellt die vorherige SSH-Richtlinie ohne Remote-Eingabe wieder her, falls die Umstellung nicht bestätigt wird. Das Passwort bleibt rotiert und seine Wiederherstellungskopie verschlüsselt.

Der Server erlaubt bis zu achtzehn Minuten Vorbereitung, einschließlich dreier begrenzter Wartezeiten auf die Installationssperre hinter Supervisor-Prüfungen. Seine dreiminütige SSH-Prüffrist beginnt, nachdem der Umstellungsbefehl die SSH-Änderung bestätigt. Die gemeinsame Geräte-Lease deckt beide Phasen ab. Vor der SSH-Umstellung verwendet die Annahme den verifizierten festgelegten Bootstrap-Login und ein festes servereigenes Skript, um nur die Journale dieser Registrierung zu entfernen. Dies repariert auch unvollständige Registrierungen mit älteren Hilfsprogrammen, die eine belegte Supervisor-Sperre sofort ablehnten; es installiert die Runtime nicht neu. Nach Umstellung verwenden Runtime-Updates weiterhin den eingeschränkten Verwaltungsschlüssel. Die Annahme aktualisiert außerdem bereits eigene Hilfs- und Rollback-Skripte vor der Umstellung. FW31 BusyBox `flock` hat keine Option `-w`; daher verwenden alle SSH-Übergangssperren `timeout -k 5 30 flock 7`. Ein fehlgeschlagener Versuch fordert beim nächsten Scan unbestätigtes Rollback an; er bestätigt niemals eine unbekannte SSH-Richtlinie. Alte Installationen, deren Hilfsprogramm und Watchdog beide `flock -w` verwenden, benötigen Controller-Konsolenzugang oder wiederhergestelltes root-SSH, bevor diese Skripte repariert werden können. Bei einer bestehenden unbestätigten Umstellung, bei der beide `flock -w` ablehnen, können die normalen SSH-Checkboxen in WBM den installierten Start-Wrapper nicht überschreiben. Bauen Sie ein gezieltes, durch einen Administrator installiertes Wiederherstellungspaket:

```sh
node apps/plugins/wago/scripts/build-ssh-lock-recovery.mjs \
  cc100-<16-hex-character-hardware-id> storage/recovery/cc100-ssh-recovery.ipk
```

Wählen Sie in FW31 WBM **Software Uploads** das Paket und **Install**. Das installierte [WAGO-Upload-Plugin 2.1.1](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/src/wbm-ipk-uploads-2.1.1.tgz) lädt und installiert es in einer Aktion; es gibt keinen separaten Aktivieren-Knopf. Verwenden Sie **Force install**, wenn Sie eine unterbrochene oder fehlgeschlagene Installation derselben Paketversion wiederholen. Die Installation kann bis zu 310 Sekunden auf die Controller-Sperre warten; rechnen Sie mit etwa sechs Minuten bis zum Ergebnis. WBM-Aktualisierung beweist keinen Abschluss und erhält die gewählte Datei im Formular nicht. Das Paket verlangt die passende Runtime-Hardware-ID, private root-eigene Pfade und eine unbestätigte SSH-Änderung. Version 1.0.1 akzeptiert auch die root-eigene `0644`-Sperre alter Watchdogs im privaten Verwaltungsverzeichnis und verschärft sie auf `0600`, ohne ihren Inode zu ersetzen. Andere Eigentümer, schreibbare Modi, symbolische und harte Links werden mit konkreten Diagnosen abgelehnt. Es repariert begrenzte Sperrbefehle und die private Sperr-Erstellungsmaske und ruft dann das bestehende Rollback-Skript auf. Es verweigert bereits bestätigten Zugang und erhält Runtime-Konfiguration und Zugangsdaten. Nach Wiederherstellung von root-SSH aktualisiert die automatische Registrierung die Verwaltungsskripte und wiederholt die Umstellung. Runtime-Inspektion liest den installierten Hilfsprogramm-Hash und das Docker-Image ohne die Schreibsperre des Hardware-Supervisors. Eine belegte Hardwareprüfung lässt einen laufenden Controller deshalb nicht offline erscheinen. Hilfsprogramm-Veröffentlichung und jede Runtime-Transaktion prüfen weiterhin private root-eigene Pfade und warten höchstens 310 Sekunden auf die Schreibsperre, bevor sie etwas ändern. Einrichtungsfehler behalten eine feste Diagnose für den fehlgeschlagenen Schritt und erscheinen im Detailbereich des Controllers; rohe SSH-Ausgaben und Zugangsdaten sind niemals enthalten.

Der Bereich **Wiederherstellungswerkzeuge** enthält **root-Passwort anzeigen (protokolliert)** als explizite Administratoraktion. Er verlangt eine dauerhaft erfasste Auditquittung vor Entschlüsselung und Rückgabe des Passworts, sendet `Cache-Control: no-store` und gibt niemals den privaten SSH-Schlüssel zurück. Das Geheimnis wird nur bis zum Verbergen oder Schließen des Wiederherstellungsbereichs angezeigt. root-SSH ist nach Umstellung gesperrt. Für Remote-Wiederherstellung oder Neuregistrierung verwendet **Vorherigen SSH-Zugang wiederherstellen (protokolliert)** den erhaltenen Verwaltungsschlüssel zur Wiederherstellung der vorherigen SSH-Richtlinie, prüft das generierte root-Passwort auf einer frischen festgelegten Verbindung und beendet die automatische Verwaltung. Verwenden Sie dieses Passwort als temporäre Zugangsdaten der nächsten Registrierung; die nächste Sitzung generiert neue Schlüssel und Passwörter, statt die ausgemusterte Identität zu übernehmen. Das Beenden entfernt autorisierte Schlüssel des eigenen Kontos erst, nachdem wiederhergestellter root-Zugang unabhängig geprüft wurde. Ein dauerhafter Zustand `retiring` blockiert automatische Updates und Schlüssel-Retries, bis festgelegte root-Inspektion die Entfernung bestätigt, auch nach verlorener SSH-Antwort oder Serverneustart. Entfernen erfordert diese abgeschlossene Ausmusterung, erhält Wiederherstellungssitzung und verschlüsselten Datensatz und verweigert ein Update mit ausstehendem Rollback oder Bestätigung. Unlesbare verschlüsselte Zugangsdaten melden Wiederherstellungsbedarf statt gesunden verwalteten Zugang.

Das root-eigene Hilfsprogramm bietet feste Vorgänge und wertet niemals SSH-Befehle aus oder führt aus Runtime-Bundles extrahierte Dateien aus. Registrierung erstellt außerdem eine separate Veröffentlichungsautorität für den Installer je Controller. Ihr privater Schlüssel wird im selben gebundenen Datenbankumschlag verschlüsselt; nur ihr öffentlicher Schlüssel wird auf dem Controller installiert. Der begrenzte SSH-Schlüssel allein kann keinen ausführbaren Code veröffentlichen. Wenn der bereitgestellte Build seinen kompilierten Installer ändert, signiert der Server genau dieses Hilfsprogramm für das Registrierungstoken. Der feste Publisher prüft Signatur, Digest, Länge, Syntax und root-Eigentum unter der Installationssperre, verweigert ausstehende Transaktionen und ersetzt dann das Hilfsprogramm atomar. Keine API akzeptiert Installer-Quellen oder gibt einen der privaten Schlüssel zurück. Unbekannte Protokollversionen schlagen sichtbar fehl. Jedes Runtime-Update verwendet anschließend Boot-Hook und Geräte-/Bind-Argumente des aktuellen Builds, sodass Installer-Korrekturen bereits registrierte Controller ohne erneute Inbetriebnahme erreichen. Der unabhängige Update-Watchdog stellt nicht angenommene Updates nach Unterbrechung zurück; der Neustart-Wiederherstellungs-Hook läuft nach dem vendor-eigenen Docker-Start und vor dem Runtime-Hook und lässt Runtime-Aktivierung aus, wenn Wiederherstellung nicht nachgewiesen werden kann. Gespeicherte MQTT-Messwerte, der Stream des alten Boots, allein geladene Images und neu komprimierte identische Images beweisen keinen Update-Erfolg.

Dies sind Software- und isolierte Fixture-Garantien. Für diese Implementierung stand kein Prüfstand-Controller zur Verfügung; physische FW31-Umstellung, Neustart, I/O und Wiederherstellungsqualifikation bleiben daher unabhängig vom Softwarestatus explizit **ungeprüft**. Die Remote-Bootstrap-Wiederherstellung ist kein lokaler Wiederherstellungsweg. Bisher wurde für FW31 kein lokaler root-Wiederherstellungsweg qualifiziert, wenn verwaltetes SSH und Server beide ausfallen. Identifizieren Sie vor Auslieferung die unterstützte physische beziehungsweise Vendor-Wiederherstellungsschnittstelle und weisen Sie dort die Funktion des generierten root-Passworts nach; nehmen Sie nicht an, dass root-SSH, WBM oder serielle Konsole verfügbar bleiben.

Die erste nutzbare Beta zielt auf CC100 `751-9301` Firmware **31**. Breitere Firmware-Verweise unten sind Hardware-Hintergrund, keine weiteren unterstützten Baselines. Geführte Inbetriebnahme verwendet ein lokal prüfsummengeprüftes Offline-Bundle, keinen Registry-Pull auf dem Controller und keine verpflichtende WBM-Einrichtung. Sie nennt ihren Container `attraccess-wago` und bind-mountet dort das Controller-Verzeichnis `/var/lib/attraccess-wago`. Seit **2026-09-06** ist Inbetriebnahme destruktiv: bestehende Anwendungen und Daten können ausfallen oder gelöscht werden, ohne Erhalt, Backup oder Wiederherstellung vorheriger CODESYS- oder anderer Workloads durch Attraccess. Sie stoppt und deaktiviert CODESYS immer dauerhaft und prüft dies vor I/O. Unterstützte Docker-Einrichtung und dauerhafte enge I/O-Berechtigungen gehören zum Installer. Siehe den aktuellen [Plattformvertrag](devices/wago-commissioning-platform.md).

Das alte manuelle Beispiel unten nennt den Container hingegen `attraccess-wago-cc100` und verwendet ein benanntes Docker-Volume. Diese Speicherorte und seine Neustartrichtlinie sind mit geführter Inbetriebnahme **nicht austauschbar**. Geführte Inbetriebnahme verwendet Docker-Neustartrichtlinie `no` und einen Host-Supervisor, der vor jedem Start CODESYS-Deaktivierung, exklusive Zuständigkeit und enge Registerberechtigungen prüft. Fünf aufeinanderfolgende Crash-Starts lösen 30 Sekunden Abkühlzeit aus; eine gesunde Beobachtung setzt den Zähler zurück. Er prüft regelmäßig den laufenden Schreiber und versucht bei fehlgeschlagenen Prüfungen Eindämmung. Das historische manuelle Beispiel `unless-stopped` bietet diese Schranke nicht. Identifizieren Sie vor Bereinigung die tatsächliche Installation; führen Sie die manuelle Installation nicht über einen in Betrieb genommenen Controller aus.

Bei geführten Installationen startet Docker selbst `attraccess-wago` niemals neu. Der Marker `runtime-enabled` erfasst die dauerhafte Betreiberabsicht. Fehlgeschlagene Beobachtungen stoppen den Schreiber, erhalten aber diese Absicht; nach verifizierter Eindämmung wartet der Supervisor 30 Sekunden und wiederholt die vollständige Prüfung. Sperrkonflikte warten auf die zuständige Transaktion, ohne deren Schreiber zu stoppen. Explizites Stoppen, Ersetzen und Rollback entfernen weiterhin die Aktivierung. Kann das Stoppen nicht geprüft werden, meldet die Überwachung Wiederherstellungsbedarf statt ungeprüften Neustart zu versuchen.

Die letzte fehlgeschlagene Supervisor-Beobachtung bleibt in `/etc/attraccess-wago/supervisor.last-error` erhalten, einer privaten atomar ersetzten Datei mit UTC-Zeit, Exitstatus, Aktion und bis zu 4096 Byte Diagnoseausgabe. Erfolgreiche Wiederherstellung erhält diesen Nachweis. Eine fehlgeschlagene initiale Boot-Prüfung startet nach verifizierter Eindämmung ebenfalls Hintergrundüberwachung. Bestätigen Sie Wiederherstellung über einen frischen Heartbeat, nicht bloß einen erfolgreichen Hook-Exit. Ältere Hooks entfernten die Aktivierung bei Fehlern; bereits so befindliche Installationen benötigen explizite Wiederherstellung über den [Assistenten zur Bereinigung und erneuten Inbetriebnahme](devices/wago-cc100-commissioning.md#recover-after-latched-containment) oder geprüfte Support-Wiederherstellung. Umgehen Sie die Host-Prüfung nicht mit `docker start` und ändern Sie Dockers Neustartrichtlinie nicht.

Beide Wege verwenden `/etc/attraccess-wago/runtime.env` auf dem **Controller-Host**. Docker liest sie über `--env-file`; sie wird nicht in den Container gemountet. Der Runtime-Zustand ist `/var/lib/attraccess-wago/state.json` **im Container**, hinterlegt im Host-Verzeichnis bei geführter Inbetriebnahme oder im benannten Volume des manuellen Beispiels. Host-Umgebungsdatei und Runtime-Zustand können beide Zugangsdaten enthalten. Ein lokales Attraccess-Backup beweist nicht, dass eine dieser geräteseitigen Dateien oder SSH-Wiederherstellungszugang gesichert wurde. Prüfen Sie Wiederherstellbarkeit vor Zugangsdatenänderungen und halten Sie Geheimnisse aus Support-Nachweisen fern.

Die Runtime läuft auf einem WAGO CC100 `751-9301` mit WAGO-Linux-Firmware und Docker. Sie verwendet kein CODESYS und akzeptiert keinen hochgeladenen Controller-Code. Ihre aktuelle Protokollversion ist `1.0.0`; Runtime-Version ist `0.1.0`.

## Sicherheitsgrenze

Diese Runtime ist **nicht sicherheitszertifiziert**. Sie darf nicht als Not-Aus, Personenschutzfunktion oder Ersatz zertifizierter Sicherheitsschaltungen verwendet werden. Halten Sie alle offiziellen Not-Aus- und Sicherheitsschaltungen unabhängig. Runtime-Fehler, MQTT-Verlust, Container-Crash, Neustart oder Konfigurationsfehler sind Betriebsfehler und kein Nachweis eines sicheren Zustands.

## Voraussetzungen

Bestätigen Sie vor Bereitstellung alle folgenden Punkte:

- Der Controller ist ein `751-9301`. Das veröffentlichte Image ist für `linux/arm/v7` gebaut.
- Der CC100 hat WAGO-Linux-Firmware mit Docker-Unterstützung. WAGOs Onboard-I/O-Referenz verlangt Firmware 21 (`03.09.04`) oder neuer; erfassen Sie die installierte Firmware im Bereitstellungsprotokoll.
- Ein Administrator hat SSH- oder WBM-Zugang zum CC100. Verwenden Sie ein isoliertes Verwaltungsnetz und beschränken Sie SSH/WBM auf autorisierte Betreiber.
- Der Controller erreicht den konfigurierten MQTT-Broker und die Registry von `ghcr.io`. Es gibt keine eingehenden Runtime-Ports; ausgehender MQTT- und Image-Registry-Zugang sind erforderlich.
- Dauerhafter Speicher für Docker und `/var/lib/attraccess-wago` ist verfügbar. WAGOs Docker-Lebenszyklus verwendet `/home/docker` für Docker-Daten.
- Der Attraccess-Betreiber hat controllerbezogene Hardware-ID, Pairing-Code, MQTT-URL, Erkennungszugangsdaten und Registrierungsgeheimnis ausgegeben.
- Physische Baugruppe, Verkabelung, Bedingungen, Schütze und nicht sicherheitsbezogene Stopp-, Fehler- und Freigabesignale wurden geprüft. Die Referenzbaugruppen `751-9301`, `879-3000` und `879-1300` benötigen die unten stehende physische Prüfliste.

## Docker aktivieren

Geführte Inbetriebnahme bereitet die bestehende firmwareinstallierte Docker-Funktion im Rahmen der einzelnen destruktiven Installationsfreigabe vor. Sie verwendet bei Bedarf den Vendor-Aktivierungsweg und prüft Daemon-Verfügbarkeit sowie Boot-Aktivierung vor I/O. Das erfasste FW31 `config_docker install` prüft nur den Aktivierungszustand; es lädt Docker nicht herunter und entpackt es nicht. Fehlende Client- oder Daemon-Binaries bleiben unsupported. Vendor-Aktivierung kann gespeicherten Start-, Routing- und Firewall-Zustand ändern; weder Deaktivierung noch Entfernung stellt vorherige Anwendungen wieder her. Das erfasste Init-Skript hat keine nutzbare `status`-Aktion; Inbetriebnahme prüft stattdessen Daemon-Beobachtungen und Getter-Ergebnisse. Siehe [aktuelle Unterstützungsgrenzen](devices/wago-fw31-support.md) für genaue Quellherkunft, verbleibende Prüfungen und die ersetzte Erhaltungsentscheidung. WBM ist kein erforderlicher Inbetriebnahmeschritt.

## Image beziehen und prüfen

Das Runtime-Manifest nennt diesen vorgesehenen Versions-Tag:

```text
ghcr.io/attraccess/wago-cc100-runtime:0.1.0
```

CI veröffentlicht einen Commit-SHA-Tag für `linux/arm/v7`, prüft das veröffentlichte Manifest und lädt die unveränderliche Referenz `<tag>@<digest>` als Artefakt `wago-cc100-runtime-image` hoch. Verwenden Sie diesen erfassten Digest statt eines veränderlichen Tags.

```sh
export IMAGE='ghcr.io/attraccess/wago-cc100-runtime@sha256:<published-release-digest>'
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{index (split (index .RepoDigests 0) "@") 1}}'
```

Der geprüfte Digest muss exakt mit dem Release-Digest übereinstimmen. Erhalten Sie das geladene Image lokal für Rollback; löschen Sie das vorherige bekannte funktionierende Image erst nach bestandener physischer Prüfliste für das neue Image.

## Controller-Konfiguration vorbereiten

Erstellen Sie eine für root lesbare Umgebungsdatei. Sie enthält Broker-Zugangsdaten und darf niemals committed, in Tickets kopiert oder Support-Bundles beigefügt werden.

```sh
install -d -m 0700 /etc/attraccess-wago
umask 077
cat >/etc/attraccess-wago/runtime.env <<'EOF'
WAGO_HARDWARE_ID=<controller-hardware-id>
WAGO_MQTT_URL=mqtts://<broker-host>:8883
WAGO_MQTT_USERNAME=<initial-controller-username>
WAGO_MQTT_PASSWORD=<initial-controller-password>
WAGO_PAIRING_CODE=<controller-pairing-code>
WAGO_ENROLLMENT_SECRET=<enrollment-secret>
WAGO_MQTT_PREFIX=attraccess/wago
EOF
chmod 0600 /etc/attraccess-wago/runtime.env
```

Die Runtime verlangt `WAGO_HARDWARE_ID`, `WAGO_MQTT_URL` und `WAGO_PAIRING_CODE`. `WAGO_MQTT_USERNAME` und `WAGO_MQTT_PASSWORD` sind Erkennungszugangsdaten bis zur Übernahme des Controllers. `WAGO_ENROLLMENT_SECRET` ist für die Erkennungsregistrierung erforderlich. `WAGO_MQTT_PREFIX` ist standardmäßig `attraccess/wago`; verwenden Sie bei Abweichung den ausgegebenen Namensraum. Der dauerhafte Zustandspfad ist standardmäßig `/var/lib/attraccess-wago/state.json` und speichert zuletzt akzeptierte Konfiguration, Ausgangszustand, begrenzte Befehlshistorie und permanente Zugangsdaten. Die Datei wird mit Modus `0600` erstellt.

### I/O-Pfade und Host-Zugang

`WAGO_IO_PATHS` ist ein JSON-Objekt mit Schlüsseln `<hardware-profile>:<channel>`. Jeder Eintrag liefert einen `input`- und/oder `output`-Dateipfad. Firmware-Versionen können IIO-Geräte unterschiedlich nummerieren; bestimmen Sie diese Pfade deshalb vor Bereitstellung auf dem Ziel. Verwenden Sie ohne Prüfung keine Pfadzuordnung einer anderen Firmware-Version.

WAGO dokumentiert diese relevanten Host-Pfade:

- Digitale Ausgänge: `/sys/kernel/dout_drv/DOUT_DATA`
- Digitale Eingänge: `/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din`
- Analog- und Pt1000-Werte: die jeweiligen Rohwertdateien `/sys/bus/iio/devices/iio:device*/...`
- Kalibrierdaten: `/etc/calib`
- RS-485: `/dev/serial` auf dem `751-9301`; dessen serieller Modus ist ausschließlich RS-485

Das aktuelle Image instanziiert nur den Onboard-I/O-Adapter. Es kann die über `WAGO_IO_PATHS` gelieferten Dateipfade lesen oder schreiben, liest aber `/etc/calib` nicht und implementiert keine Kalibriertransformationen. Seine RS-485- und Modbus-TCP-Adapterklassen werden vom Einstiegspunkt nicht ausgewählt; RS-485- und Modbus-Bereitstellung sind daher in diesem Artefakt nicht verfügbar. Die aufgeführten Pfade sind WAGO-Host-Dokumentation und Grundlage zukünftiger Hardwarevalidierung, kein Anspruch aktueller Runtime-Unterstützung.

Die aktuelle Runtime-Version deklariert `privileged: true`. Dies ist ein temporäres Hardware-Zugriffsmodell aus dem Release-Manifest, keine Befürwortung breiten Host-Zugangs. Der Image-Prozess selbst läuft als UID `10001`. Die genaue produktive Geräte- und Bind-Mount-Liste ist noch nicht validiert und muss von der Hardware-Freigabe ATT-984 geliefert werden.

Behaupten Sie bis dahin keine Bereitstellung mit minimalen Rechten. Das vorgesehene Ersatzmodell ist:

- Binden Sie nur die spezifischen konfigurierten sysfs/IIO-Dateien für das Onboard-I/O des Controllers ein, lesend für Eingänge und nur für Ausgangsdateien lesend und schreibend. Sie stellen die vom Adapter verwendeten physischen I/O-Pfade bereit.
- Fügen Sie einen lesenden `/etc/calib`-Mount erst hinzu, wenn eine Runtime-Version ihn für Analog- oder Pt1000-Kalibrierung liest. Dies erhält WAGOs Produktionskalibrierung ohne Änderungsmöglichkeit.
- Fügen Sie nur `--device /dev/serial` hinzu, nachdem eine Runtime-Version ihren RS-485-Modbus-RTU-Adapter auswählt. Dies beschränkt seriellen Zugang auf die dokumentierte CC100-Schnittstelle, statt `/dev` offenzulegen.
- Mounten Sie ein benanntes Volume nur unter `/var/lib/attraccess-wago`, damit akzeptierte Konfiguration und Befehls-Deduplizierung Ersetzung oder Neustart überstehen.
- Mounten Sie weder Docker-Socket, Host-root-Dateisystem noch ein uneingeschränktes `/dev`-Verzeichnis. Die Runtime bietet keinen eingehenden Netzwerkdienst und benötigt derzeit nur ausgehendes MQTT.

## Die unfertige Runtime starten

Dieser Befehl entspricht dem aktuellen Manifest. Ersetzen Sie Image-Digest und zielspezifische I/O-Zuordnung erst nach deren Prüfung auf dem Controller. Das Beispiel `WAGO_IO_PATHS` ist absichtlich leer: keine universelle Zuordnung gilt für alle CC100-Firmware-Versionen.

```sh
export IMAGE='ghcr.io/attraccess/wago-cc100-runtime@sha256:<published-release-digest>'
docker volume create attraccess-wago-state
docker run -d \
  --name attraccess-wago-cc100 \
  --restart unless-stopped \
  --privileged \
  --env-file /etc/attraccess-wago/runtime.env \
  --env 'WAGO_IO_PATHS={}' \
  --mount type=volume,src=attraccess-wago-state,dst=/var/lib/attraccess-wago \
  "$IMAGE"
```

In diesem historischen manuellen Beispiel startet `--restart unless-stopped` die Runtime nach Docker- und Controller-Neustarts, sofern ein Betreiber sie nicht explizit gestoppt hat. Es macht die Runtime nach Fehlern nicht sicher und ist nicht die aktuelle geführte Inbetriebnahmerichtlinie. Erfassen Sie Befehl, Image-Digest, Umgebungsdatei-Prüfsumme (nicht ihren Inhalt), Container-ID, Firmware-Version und I/O-Zuordnungsprüfung im Bereitstellungsprotokoll.

Prüfen Sie den Start und erhalten Sie die Ausgabe:

```sh
docker ps --filter name=attraccess-wago-cc100
docker logs --tail 200 attraccess-wago-cc100
docker inspect --format '{{.State.Status}} {{.RestartCount}}' attraccess-wago-cc100
```

Runtime-Callback-Fehler gehen an Container-stderr; `docker logs` ist daher der primäre Protokollerfassungsbefehl. Fügen Sie Ausgabe von `docker inspect`, `docker logs`, Firmware-Version und nicht geheime Konfigurationsmetadaten einem Support-Bundle bei. Fügen Sie `/etc/attraccess-wago/runtime.env` oder `state.json` niemals ohne Entfernen von Zugangsdaten bei.

Runtime-MQTT-Veröffentlichungen und -Abonnements warten höchstens 10 Sekunden auf die Broker-Bestätigung. Zeitüberschreitung lehnt ausstehende Vorgänge ab und schließt den Socket, um automatische Wiederverbindung und die konfigurierte Trennungsrichtlinie auszulösen. Socket-Schließung gibt auch ausstehende Vorgänge frei. Unbestätigte Veröffentlichungen werden verworfen statt nach Wiederverbindung erneut abgespielt; frische Heartbeats, Zustände und Messwerte setzen durch ihre normalen Publisher fort. Dies verhindert, dass fehlendes PUBACK eine Mess- oder Heartbeat-Schleife dauerhaft blockiert, während MQTT-Keepalive weiterhin erfolgreich ist.

## Registrierung und Zugangsdaten

Der vorgesehene Registrierungsablauf ist auf Erkennung begrenzt und einmalig:

1. Der Controller meldet Hardware-ID, Pairing-Code, Protokoll- und Runtime-Versionen, Fähigkeiten und ein Registrierungsgeheimnis an `attraccess/wago/discovery/<hardware-id>`.
2. Der Betreiber übernimmt ihn über das entsprechende Erkennungs-Übernahmethema innerhalb des 15-minütigen Registrierungsfensters.
3. Attraccess liefert controllerbezogene MQTT-Zugangsdaten und Betriebsthemen zurück und widerruft dann die Erkennungszugangsdaten.
4. Der Controller speichert permanente Zugangsdaten und verbindet sich nur mit der controllerbezogenen Identität neu.

Die Runtime veröffentlicht eine gespeicherte Erkennungsankündigung, abonniert das Übernahmethema, prüft und speichert zurückgegebene Zugangsdaten vor Trennung und verbindet sich dann mit permanenter Controller-Identität neu. Folgende Starts verwenden die gespeicherte Identität und benötigen keine weiterhin gültige Erkennungsidentität.

Bei kompromittierten Zugangsdaten, Außerbetriebnahme oder fehlgeschlagener Rotation:

1. Widerrufen Sie zuerst die betroffene Broker-Identität.
2. Stoppen Sie den Container, um wiederholte fehlgeschlagene Authentifizierungsversuche zu verhindern.
3. Geben Sie über Attraccess-Provisionierung neue controllerbezogene Zugangsdaten aus.
4. Ersetzen Sie `WAGO_MQTT_USERNAME` und `WAGO_MQTT_PASSWORD` in der `0600`-Umgebungsdatei und setzen Sie `WAGO_MQTT_USE_ENV_CREDENTIALS=true`, um das vollständige Ersatzpaar statt gespeicherter Zugangsdaten zu verwenden.
5. Entfernen Sie den gestoppten Container und erstellen Sie ihn mit demselben geprüften Image-Digest, Zustandsvolume und I/O-Zuordnung sowie aktualisiertem `--env-file` neu. Docker liest `--env-file` nur beim Erstellen; `docker start` würde widerrufene Zugangsdaten beibehalten.
6. Prüfen Sie Protokolle und einen Heartbeat unter der erwarteten Hardware-ID.
7. Erhalten Sie das dauerhafte Volume, sofern Wiederherstellung nicht das Verwerfen akzeptierter Konfiguration und Befehlshistorie verlangt.

## Konfiguration und Betriebsinspektion

Mit dem Standardpräfix verwendet die Runtime diese Themenwurzel:

```text
attraccess/wago/v1/controllers/<hardware-id>/
```

Sie abonniert mit QoS 1:

- `configuration/desired` für einen gespeicherten Soll-Snapshot
- `commands` für nicht gespeicherte Befehle

Sie veröffentlicht mit QoS 1:

- `configuration/reported` gespeichert, einschließlich Revision, Inhalts-Hash und strukturierter Validierungsfehler
- `state` gespeichert, einschließlich Verbindungszustand, akzeptierter Revision und Hash sowie Ausgangszuständen
- `heartbeat` alle 30 Sekunden mit Hardware-ID, Pairing-Code, Protokoll- und Runtime-Versionen, Fähigkeiten und Sequenzwert
- `measurements` alle 5 Sekunden für konfigurierte Messkanäle
- `faults`, wenn Messwertlesen oder Geräteschreiben fehlschlägt
- `acknowledgements` für akzeptierte, doppelte oder abgelehnte Befehle

Soll-Snapshots werden vor Speicherung validiert. Ein abgelehnter Snapshot veröffentlicht Feldfehler in der gemeldeten Konfiguration und lässt die zuletzt akzeptierte Konfiguration bestehen. Prüfen Sie nach jedem Update den gespeicherten Datensatz `configuration/reported` und vergleichen Sie Revision und Hash mit der Soll-Konfiguration. Senden Sie keine Befehle, bevor die erwartete Konfiguration gemeldet wird.

Verwenden Sie nur Diagnoseaktionen, die im exakt getesteten Plugin-Build vorhanden sind. Diese manuelle Basis belegt nicht, dass eine Controller-Detailseite existiert; prüfen Sie die integrierte UI vor Dokumentation ihrer Navigation. Themeninspektion auf Broker-Ebene ist ein technisches Werkzeug, keine normale Betreiberabnahme; Nachrichten können Geheimnisse sowie Topologie und Betriebszustand enthalten.

## Ressourcen-Flows

Nach Übernahme eines Controllers und Anwendung seiner Konfiguration bietet der Flow-Katalog vier WAGO-Knoten:

| Knoten                  | Verwendung                                                                              | Ausgänge                                                |
| ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| WAGO-Befehl             | Einen Ausgang mit konfiguriertem Schalt- oder Pulsverhalten steuern.                    | `output`, `failure` (je nach gewähltem Fehlerverhalten) |
| WAGO-Ereignis empfangen | Einen Flow bei Kanalzustandsmeldung, Messwert oder Fehler starten.                      | `output`                                                |
| WAGO-Zustand lesen      | Zuletzt empfangenen Zustand oder Messwert ohne Controller-Befehl lesen.                 | `output`, `unavailable`                                 |
| Auf WAGO-Zustand warten | Warten, bis ein verfügbarer Zustand oder Messwert einem konfigurierten Wert entspricht. | `output`, `timeout`                                     |

Wählen Sie Controller, benannten logischen Kanal sowie Vorgang oder Ereignis-/Zustandskategorie. Befehlsknoten listen nur Ausgangskanäle und binden die angewendete Konfigurationsrevision; öffnen und speichern Sie sie nach Veröffentlichung einer neuen Revision erneut. Ereignis-, Lese- und Warteknoten unterstützen auch Eingangs- und Messkanäle.

Das **Ausgangsverhalten** des Kanals ist maßgeblich:

| Konfiguriertes Verhalten  | Vorgang des Befehlsknotens | Ergebnis                                                               |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Geschaltet                | Einschalten / ausschalten  | Ausgang auf den gewählten booleschen Zustand setzen.                   |
| Gepulst                   | Puls auslösen              | Für die konfigurierte Dauer einschalten, dann automatisch ausschalten. |
| Nur Eingang oder Messwert | Kein Befehlsvorgang        | Ereignis-, Lese- oder Warteknoten verwenden.                           |

Einrichtungsvorlagen kopieren Ausgangseinstellungen in den Kanal. Ihre Namen begrenzen spätere Anpassungen nicht: ein aus einer Pulsvorlage erstellter Kanal kann auf Schaltverhalten geändert werden. Pulsdauer, Betriebsbedingungen, Rückmeldeüberwachung und Trennungsverhalten gehören zur Controller-Konfiguration. Flow-Knoten wählen, wann der erlaubte Vorgang ausgelöst wird; sie können diese Einstellungen nicht übersteuern oder eine andere Dauer liefern. Bedingungen werden geprüft und konfigurierte Rückmeldungen für Befehle beider Ausgangsverhalten überwacht.

Das bestehende Snapshot-Format Version 1 bleibt erhalten. Die Fähigkeit `pulse` und positive `pulse.durationMs` definieren gemeinsam Pulsverhalten; Ausgangskanäle ohne eines davon sind geschaltet. Inkonsistente Pulseinstellungen werden durch API- und Runtime-Konfigurationsvalidierung abgelehnt. Befehls-Wire-Aktionen bleiben `set` (mit booleschem `value`) und `pulse`.

**Bestehende Flows:** set-Befehle auf gepulsten Kanälen sind jetzt ungültig, einschließlich set-off. Sie werden nicht automatisch konvertiert. Validierung markiert den Knoten, und Ausführung lehnt ihn vor Veröffentlichung ab. Wählen Sie explizit **Puls auslösen** oder ändern Sie den Kanal auf Schaltverhalten, veröffentlichen Sie diese Konfiguration und öffnen Sie den Knoten erneut zur Annahme seiner neuen Revision. Manuelle Befehle verwenden dieselben Beschränkungen. Aktualisierte CC100-Runtimes lehnen auch inkompatible direkte MQTT-Befehle mit `unsupported_operation` ab; die Bereitstellung allein des Plugins aktualisiert nicht die installierte Controller-Runtime. Internes Pulsabschalten und Trennungsbehandlung schalten Ausgänge weiterhin aus.

Ereignis-, Lese- und Warteknoten legen ihr Ergebnis in `wago` ab und erhalten die eingehende Payload. Beispielsweise enthält `wago.value` einen booleschen Zustand oder numerischen Messwert, mit Aktualitäts- und Verfügbarkeitsinformationen in `wago.available`, `wago.stale` und `wago.offline`, wenn ein Messwert existiert. Fehlende Messwerte liefern `wago.available: false`; Leseknoten leiten fehlende oder unverfügbare Messwerte nach `unavailable`, und Warteknoten treffen nur auf verfügbare Messwerte zu. Messwerte und Vergleiche verwenden [Wire-Einheiten](devices/wago-measurement-contract.md).

Zustandsereignisse sind Meldungen, einschließlich regelmäßiger Snapshots; sie sind nicht auf Wertänderungen begrenzt. Verwenden Sie das Mindestintervall des Ereignisknotens, um Flow-Startfrequenz zu begrenzen, und die Mindeständerung zum Filtern von Messwerten. Ein Ereignis kann unverfügbare Daten melden; prüfen Sie daher `wago.available`, wenn Aktualität wichtig ist.

Verbinden Sie beispielsweise **WAGO-Ereignis empfangen → WAGO-Zustand lesen → eine Bedingung**, um auf einen Kontakt zu reagieren und dabei einen anderen Kanal zu prüfen. Verwenden Sie **WAGO-Befehl → Auf WAGO-Zustand warten**, wenn der Flow erst nach Meldung des erwarteten Eingangszustands fortsetzen soll.

## Wiederherstellung

### Broker-Verlust

Die Runtime markiert den Zustand als getrennt, wenn ihr MQTT-Client schließt. Jeder konfigurierte Ausgang hat eine Soll-Konfigurations-Trennungsrichtlinie:

- `hold`: Ausgang unverändert lassen
- `immediate`: sofortigen Übergang nach aus anfordern
- `watchdog`: Übergang nach aus nach konfigurierter Zeitüberschreitung anfordern

Dies sind nur Betriebssteuerungen, keine Sicherheitssteuerungen. Stellen Sie Broker-Verbindung wieder her, prüfen Sie gespeicherten Zustand und neuesten Heartbeat und verifizieren Sie physische Ausgänge vor Wiederaufnahme des normalen Betriebs.

### Ungültige Konfiguration

Lassen Sie die Runtime laufen. Prüfen Sie Feldfehler der gemeldeten Konfiguration, korrigieren Sie den vollständigen Soll-Snapshot und veröffentlichen Sie eine neue Revision mit passendem Inhalts-Hash. Umgehen Sie einen abgelehnten Snapshot nicht durch manuelles Ändern der dauerhaften Zustandsdatei.

### Container-Crash

```sh
docker ps -a --filter name=attraccess-wago-cc100
docker logs --tail 500 attraccess-wago-cc100
docker inspect --format '{{json .State}}' attraccess-wago-cc100
docker start attraccess-wago-cc100
```

Bei Wiederholung stoppen Sie ihn und sichern Sie Protokolle vor Image- oder Konfigurationsänderung. Prüfen Sie Broker-Erreichbarkeit, Zugangsdaten, schreibbaren dauerhaften Speicher und jeden konfigurierten Host-I/O-Pfad.

### Controller-Neustart

Bestätigen Sie nach Rückkehr des CC100 aktives Docker und einen neuen Runtime-Heartbeat. Prüfen Sie bei geführter Inbetriebnahme, dass der Boot-Hook CODESYS deaktiviert hielt und enge Registerzugriffe vor Attraccess-Start prüfte; fehlgeschlagene Prüfungen müssen die Runtime gestoppt lassen. Prüfen Sie gespeicherten Zustand und gemeldete Konfiguration vor I/O-Tests. Das dauerhafte Volume erhält akzeptierten Snapshot und begrenzte Befehlshistorie; es ist kein Backup vorheriger Workloads und spielt bestätigte Befehle oder Pulse nicht erneut ab.

### Image oder Konfiguration zurückrollen

Erhalten Sie vorherigen Image-Digest und dauerhaftes Volume, bis der Ersatz angenommen wurde.

```sh
docker stop attraccess-wago-cc100
docker rm attraccess-wago-cc100
docker run -d \
  --name attraccess-wago-cc100 \
  --restart unless-stopped \
  --privileged \
  --env-file /etc/attraccess-wago/runtime.env \
  --env 'WAGO_IO_PATHS=<previous-reviewed-json>' \
  --mount type=volume,src=attraccess-wago-state,dst=/var/lib/attraccess-wago \
  'ghcr.io/attraccess/wago-cc100-runtime@sha256:<previous-known-good-digest>'
```

Prüfen Sie zurückgegebenen Image-Digest, Heartbeat, gespeicherte Konfiguration und physische Ausgänge. Für Konfigurations-Rollback veröffentlichen Sie den vorherigen vollständigen Soll-Snapshot als neue Revision; bearbeiten Sie `state.json` nicht von Hand. Verwerfen Sie das Zustandsvolume nur unter genehmigtem Wiederherstellungsverfahren, da es Konfigurationshistorie, Befehls-Deduplizierung und möglicherweise Zugangsdaten enthält.

## Physische Prüfliste

Erfassen Sie Nachweise unter [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies); diese Prüfliste muss vor Freigabe einer unterstützten Beta bestanden werden.

- Bestätigen Sie Controller-Bestellnummer `751-9301`, installierte Firmware, Docker-Aktivierung, ARMv7-Image-Digest und dauerhaftes Neustartverhalten.
- Bestätigen Sie vorgesehene Stromversorgung, Verkabelung, Modbus-Einstellungen, Adresszuordnung, Messwerte, Überlaufbehandlung und Fehlermeldung der Baugruppen `879-3000` und `879-1300`, sobald eine Runtime-Version die Modbus-Adapter auswählt.
- Prüfen Sie jeden konfigurierten internen Digitalpfad gegen das sysfs-Layout der Zielfirmware. Validieren Sie Analog-/Pt1000-Pfade und `/etc/calib` erst bei implementierter Kalibrierung.
- Bestätigen Sie `/dev/serial` als RS-485-Schnittstelle und dass bei implementierter RS-485-Unterstützung kein fremder serieller oder Gerätezugriff gewährt wird.
- Bestätigen Sie minimale finale Container-Geräteliste und Bind-Mounts und dokumentieren Sie den Grund jedes Eintrags; entfernen Sie `--privileged` vor Freigabe.
- Prüfen Sie Erkennung, Übernahme, Zugangsdatenrotation und Widerruf, sobald das Image sie implementiert.
- Prüfen Sie Soll-/Ist-Konfigurationsannahme, Ablehnung, Wiederverbindung, Controller-Neustart, doppelte Befehle, Pulse, Bedingungen, Rückmeldung, Messwerte, Fehler und Trennungsrichtlinien.
- Prüfen Sie, dass offizielle Not-Aus- und Sicherheitsschaltungen unabhängig und unverändert bleiben.

## Quellen

- [WAGO-CC100-Docker-Lebenszyklus](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/config-tools/config_docker_home)
- [Direkter WAGO-Onboard-I/O-Zugriff](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md)
- [WAGO-CC100-Erkennung serieller Schnittstellenfunktionen](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/init.d/serial_features)

### Verwaltete Registrierung und Abgleich

Verwaltete Registrierung, Retry des verwalteten Zugangs und automatischer Abgleich stehen ohne zusätzliche Umgebungskonfiguration bereit. Inbetriebnahme prüft Controller-Kompatibilität, Runtime-Voraussetzungen und verschlüsselte Verwaltungszugangsdaten vor Fortsetzung. Hintergrundabgleich startet mit dem Plugin und verwaltet nur Controller mit registrierter Identität. Neue Runtime-Verbindungen lösen sofortigen Abgleich aus; regelmäßige Heartbeats bündeln ersatzweise Flottenscans auf höchstens einen neuen Scan je 30 Sekunden. Verschlüsselte Wiederherstellungsanzeige und Bootstrap-Wiederherstellung bleiben Administratoren verfügbar. Physische FW31-Qualifikation bleibt eine separate Freigabeanforderung: Wiederherstellung, SSH-Ablehnung, Watchdog/Neustart und Annahme wiederholter Updates müssen an einem isolierten Prüfstand-Controller getestet werden.

Administratoren können fehlgeschlagene, blockierte oder wiederherstellungsbedürftige Runtime-Updates über **Wiederherstellungswerkzeuge** im Bereich **Details** des Controllers wiederholen. Dies zieht die dauerhafte Retry-Frist unter der gemeinsamen Geräte-Lease vor; ausstehende Rollback- und bestätigte Bereinigungsquittungen bleiben erhalten und werden vor Start eines neueren Images abgeschlossen. Ausmusterung wird nach Übernahme der Geräte-Zuständigkeit erneut geprüft, und bedingte Zugangsübergänge können dauerhafte Ausmusterungsabsicht nicht überschreiben.
