# WAGO-CC100-Docker-Laufzeitumgebung
<!-- llms-description: WAGO-CC100-Docker-Laufzeitumgebung konfigurieren: Klemmen und Live-Steuerung, Wechsel von MQTT-Server oder SSH-Adresse sowie Bereitstellungswege. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

> **Technische Referenz, nicht der unterstützte Installationsweg für Betreiber.** Diese Anleitung hält die manuelle Laufzeit-Baseline bei `9e0a1c47` fest. Sie ist nicht auf Hardware validiert: [ATT-984](https://linear.app/attraccess/issue/ATT-984/prove-the-no-code-cc100-journey-on-hardware-with-a-nontechnical-user) ist das Freigabekriterium (Release Gate). Verwenden Sie sie nicht zur Steuerung von Anlagen, solange die erforderlichen Hardware- und Anwendernachweise nicht vorliegen. Folgen Sie der [Geführten Inbetriebnahme](plugins/wago/cc100-commissioning.md) für den reinen SSH-Weg über die Oberfläche und den [Abnahmenachweisen](plugins/wago/acceptance-evidence.md) für die Voraussetzungen der Freigabe. Die unten beschriebenen manuellen Schritte für Shell, Registry, JSON-Zuordnung und das Kopieren von Zugangsdaten erfüllen dieses Kriterium nicht.

## Frontplatten-Konfiguration und Live-Steuerung

Die Konfigurationsseite der Steuerung zeigt alle vier Ausgänge und acht Eingänge. Benennen Sie eine Klemme, um sie zu verwenden; wird ihr Name gelöscht, entfällt die Zuordnung. Klemmen- und Geräteeinstellungen öffnen sich in Seitenpanels. Die RS-485-Einstellungen gelten für alle Geräte gemeinsam, während jedes Modbus-Gerät seine Adresse, sein Profil, sein Abfrageintervall und seine serielle oder TCP-Verbindung selbst festlegt. Integrierte Profile sind schreibgeschützt; **Anpassen** erstellt eine bearbeitbare Kopie, einschließlich Funktionscodes der Register, Adressbasen und Byte-/Wortreihenfolge.

Änderungen bleiben unangewendet, bis Sie **Auf Controller anwenden** wählen. **Verwerfen** stellt die angewendete Konfiguration wieder her. Bestehende Auswirkungen auf Flows erfordern weiterhin eine Bestätigung. Versionsverlauf und Zurücksetzen stehen auf der separaten Seite **Versionsverlauf** zur Verfügung.

Die Live-Steuerung setzt eine aktuelle Laufzeitumgebung voraus, die `front-panel-v1` meldet, sowie eine übereinstimmende angewendete Version. Sie verwendet stets die angewendeten Kanalidentitäten und das angewendete Verhalten, auch wenn die Einstellungen noch nicht angewendete Änderungen enthalten. Manuelle Befehle sind bestätigte MQTT-Befehle mit `source: "manual"`; die Laufzeitumgebung meldet `manualOutputChannelIds` in ihrem retained State. Der nächste erfolgreiche Flow-Befehl übernimmt diesen Ausgang. **Freigeben** hebt die manuelle Zuständigkeit auf, ohne Hardware zu beschreiben oder den aktuellen Zustand zu ändern; das automatische Ende eines Impulses und die Richtlinien bei Verbindungsverlust gelten weiterhin. Freigeben stellt keinen früheren Flow-Zustand wieder her.

Die Invertierung von Eingängen wirkt sich auf den gemeldeten Eingangszustand, auf Freigabebedingungen (Guards) und auf Rückmeldungen aus. Modbus-Schalter lesen Coils mit FC01 und Holding-Register mit FC03; das Zurücklesen läuft in der Abfrageschleife, statt die Annahme der Konfiguration oder Befehlsbestätigungen zu blockieren. Der Modbus-Zustand wird nie allein aus einem Befehl abgeleitet. Die Abfrage verwendet das konfigurierte Intervall des jeweiligen Geräts. Die Seite aktualisiert empfangene Diagnosedaten alle zwei Sekunden; dies ist eine Live-Abfrageansicht, kein Push-Stream.

## MQTT-Server oder gespeicherte SSH-Adresse ändern

Öffnen Sie bei einer vollständig verwalteten Steuerung **Details → Erweitert → MQTT-Server ändern oder aktualisieren**. Geben Sie die private IPv4-Adresse im neuen Netzwerk ein und wählen Sie einen Attraccess-MQTT-Server. Wenn Sie den aktuellen Server erneut auswählen, werden seine aktuelle Adresse, die TLS-Einstellungen und die Gerätezugangsdaten aktualisiert. Wählen Sie **Nur die CC100-Adresse aktualisieren**, um das neue SSH-Ziel zu prüfen und zu speichern, ohne MQTT-Zugangsdaten bereitzustellen oder die Laufzeitumgebung neu zu starten. Das Adressfeld ändert, wohin sich Attraccess verbindet; es konfiguriert nicht das Netzwerk der CC100.

Die erste SSH-Verbindung verwendet die eingegebene Adresse und den bereits gepinnten Host-Fingerabdruck. Weder die bisherige Adresse der Steuerung noch der bisherige Broker müssen antworten. Das eingeschränkte Verwaltungskonto erhält ausschließlich feste Hilfsbefehle; die aktualisierte Operation wird über die signierte Veröffentlichung des Hilfsprogramms bereitgestellt. **Vorherigen SSH-Zugang wiederherstellen (protokolliert)** beendet die automatische Verwaltung und ist nicht Teil eines Netzwerkwechsels.

Ein MQTT-Wechsel stoppt die Laufzeitumgebung unter der gemeinsamen Installationssperre, aktualisiert `/etc/attraccess-wago/runtime.env` sowie die dauerhaften Zugangsdaten in `/var/lib/attraccess-wago/state.json` und erstellt `attraccess-wago` mit dem installierten Image und der erfassten Docker-Konfiguration neu. Die bestehenden Mounts, Geräte, das Hardwareprofil, die erforderliche Umgebung und der gespeicherte retained Laufzeitzustand bleiben erhalten. Ein kurzlebiges, festes Wartungsprogramm verwendet Node aus demselben Image und die lokale Docker-API, um die Container-Einstellungen zu erhalten; die verwaltete Laufzeitumgebung selbst erhält nie den Docker-Socket. Der Start läuft über das bestehende Hardware-Gate und den Supervisor mit der Neustart-Richtlinie `no`.

Attraccess aktualisiert zunächst seine gemeinsame MQTT-Verbindung mit den aktuellen Einstellungen des gewählten Servers und behält dabei die registrierten Topic-Abonnements bei. Dies erfordert den passenden Attraccess-API-Build. Die vorherige retained Bestätigung der Zugangsdaten wird gelöscht und eine neue, authentifizierte Gerätebestätigung auf dem gewählten Broker ist erforderlich. Anschließend speichert Attraccess Steuerung, Inbetriebnahmesitzung, Credential-Epoche und die verschlüsselte Bindung der SSH-Adresse konsistent. Das Seitenpanel zeigt den Fortschritt und konkrete Fehler an, ohne Zugangsdaten zurückzugeben. Eine unterbrochene Änderung behält eine verschlüsselte Server-Absicht und ein privates Journal der Steuerung; **Gespeicherte Änderung erneut versuchen** schließt die Anwendung derselben Einstellungen und Zugangsdaten ab, auch nach einer Unterbrechung zwischen dem Löschen und dem Erstellen des Containers. Wurde die Anwendung abgeschlossen, die MQTT-Prüfung ist aber fehlgeschlagen, korrigieren Sie die konfigurierte Serveradresse oder die TLS-Einstellungen und versuchen Sie es erneut: Attraccess stellt eine Ersatz-Absicht bereit und speichert sie, bevor es das vorherige Journal freigibt. Eine unterbrochene Ersetzung wird mit den gespeicherten Zugangsdaten fortgesetzt. Inbetriebnahme, Laufzeit-Updates, Rotation von Zugangsdaten und SSH-Wiederherstellung bleiben gesperrt, bis dies abgeschlossen ist.

Die Migration behält die Zuordnung zum vorherigen Broker für die Bereinigung der Zugangsdaten. Ist dieser Broker erreichbar, verwenden Sie **Frühere Broker-Zugangsdaten entfernen**. Die Bereinigung ist vom Erfolg der Migration unabhängig, lehnt ein Broker-Ziel ab, das mit dem aktuellen Server geteilt wird, und muss abgeschlossen sein, bevor die Steuerung entfernt werden kann.

## Bereitstellungswege dürfen nicht vermischt werden

### Build-eigene Assets und technischer Stand verwalteter Updates (ATT-1099)

`apps/plugins/wago/cc100-runtime/manifest.json` ist die manuell gepflegte Versionsdatei der Laufzeitumgebung. Erhöhen Sie `runtimeVersion`, wenn Sie Laufzeit-Quellcode, gemeinsame Laufzeitverträge, das Laufzeit-Dockerfile, das Manifest, hostseitigen Bereitstellungscode (Installer, Supervisor, Update-Shell, Hardware-Bereitstellung) oder die Build- und Paketierungsskripte der Laufzeitumgebung sowie die `project.json` des Plugins ändern. Erkennung, dauerhafte Heartbeats und paketierte Assets verwenden alle diese Version. Der erforderliche CI-Job `wago-runtime-version` lehnt solche Änderungen ohne eine streng höhere stabile Version im Format `major.minor.patch` ab. Dokumentation, Spec-Dateien und reine Simulator-Änderungen erfordern keine Erhöhung (Simulator-Dateien durchlaufen dennoch den unten beschriebenen Build-Vergleich).

Änderungen an Abhängigkeiten und der Build-Konfiguration (`package.json` einschließlich `packageManager`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.*`, `patches/`, `tsconfig.base.json`, `nx.json` und weitere Dateien unter `apps/plugins/wago/`) erfordern nur dann eine Erhöhung, wenn sich die ausgelieferte Laufzeitumgebung ändert. Dafür baut der Job `plugin-wago:build-cc100-runtime` am Merge-Base und an HEAD in getrennten Checkouts ohne Nx-Cache und vergleicht das gebaute Bundle `dist/apps/wago-cc100-runtime`, das Laufzeit-Dockerfile und das Manifest ohne `runtimeVersion`. Pfade gebündelter Module werden ignoriert, ein neuer pnpm-Store-Pfad bei identischem Code zählt also nicht. Unterscheidet sich etwas anderes, listet der Job die geänderten Dateien auf und verlangt eine Erhöhung. `.nvmrc` sowie Änderungen an CI-Workflows oder Actions erfordern nie eine Erhöhung.

Der Vergleich dauert mehrere Minuten und prüft nur committete Änderungen. Eine Erhöhung von `runtimeVersion` überspringt ihn immer. Führen Sie ihn lokal mit `node scripts/check-wago-runtime-version.mjs origin/main` aus.

Verwaltete Updates behalten eine installierte Laufzeitumgebung derselben Version bei, auch wenn das Neubauen des Docker-Images ihren Config-Digest ändert. Sie aktualisieren dennoch das signierte Verwaltungs-Hilfsprogramm und verlangen eine frische Bereitschaft für das installierte Image. Eine Versionsänderung löst den normalen, zustandserhaltenden Rollout mit Prüfsummen- und Docker-Identitätsprüfung aus. Alle historischen `0.1.0`-Images werden einmalig auf `0.2.0` aktualisiert; ihre Version unterschied Änderungen am Laufzeit-Quellcode nicht. Commit-SHAs des Servers bleiben Build-Herkunft, keine Laufzeitversionen.

Der ATT-1099-Entwurf liefert `release.json`, `wago-cc100-runtime.tar` und die zugehörige `.sha256`-Datei mit dem Server-Image unter `/app/share/cc100-runtime` aus. Diese Assets werden aus dem ausgecheckten Quellcode durch `.github/actions/build-cc100-runtime` gebaut. Sie liegen außerhalb des npm-Plugin-Pakets, dessen Host-Importer ein Archivlimit von 50 MiB hat. Das komprimierte Docker-Archiv bleibt das Mitglied `image.tar` des äußeren Tar-Archivs; Docker akzeptiert dieses gzip-Mitglied direkt. Weder generierte Bundles noch Verwaltungsschlüssel gehören in Git.

Für die lokale Entwicklung bauen Sie die vollständige Offline-ARMv7-Laufzeitumgebung mit `pnpm nx run plugin-wago:build-runtime` (Docker Buildx mit ARMv7-Unterstützung ist erforderlich). Führen Sie `pnpm nx run plugin-wago:install-runtime-dev` aus, um sie zu bauen und nach `${STORAGE_ROOT:-storage}/cc100-runtime` zu kopieren; das Install-Target hängt vom Build-Target ab. Beide Targets sind ungecacht und verwenden denselben Paketierungsweg wie die CI. Es sind explizite Operationen; `pnpm serve` und die Plugin-Installation lösen keinen Laufzeit-Build aus. Starten Sie eine laufende API neu, nachdem Sie ihre installierten Assets ersetzt haben.

`WAGO_CC100_BUILD_ASSETS_PATH` wählt dieses Verzeichnis. Der Katalog prüft vor der Verwendung die Bundle-Prüfsumme, die Byte-Anzahl, das eingebettete Kompatibilitätsmanifest und den Build-Descriptor. Eigene Laufzeit-Importe werden nicht unterstützt, und der veraltete `current`-Zeiger des gemeinsamen Speicherkatalogs wird ignoriert. Fehlende oder inkompatible Build-Assets lassen die Plugin-Initialisierung in der Produktion scheitern. Die Entwicklung kann ohne Assets starten und zeigt stattdessen explizite Build-Anweisungen. Das Docker-Image prüft Lesbarkeit und Prüfsumme der Assets bei seiner Erstellung als unprivilegierter Anwendungsbenutzer.

Die Paketierung veröffentlicht für explizite Neubauten einen vollständigen Ersatz von `cc100-build`. Starten Sie den Entwicklungsserver neu, nachdem Sie Ersatz-Assets installiert haben. Laufende Kataloge behalten ihr gewähltes Release und unveränderliche Auslieferungs-Snapshots. Der Descriptor identifiziert den ausgecheckten Build, die Kompatibilität von Plattform, Profil und Protokoll, die Transport-Prüfsumme und den Docker-**Config-Digest** (`imageId`). Seine Offline-Image-Referenz ist an diesen Config-Digest gebunden und keine Referenz für einen Registry-Pull. Eine Neukomprimierung oder ein anderer Tag bzw. eine andere Build-ID gilt bei unveränderter Laufzeitversion nicht als Upgrade. Der verwaltete Start übergibt diese Identität als `WAGO_RUNTIME_IMAGE_ID`; frische dauerhafte Heartbeats melden sie als `runtimeImageId`. Ältere Heartbeats können das Feld weglassen.

Die Primitiven der Update-Transaktion sind von der destruktiven Inbetriebnahme getrennt. Sie begrenzen und prüfen Übertragungen per Prüfsumme, verifizieren Docker-Identität und ARMv7-Kompatibilität, führen das Host-Gate erneut aus, behalten einen gestoppten Vorgänger bei und legen vom registrierten Zustand im selben `/var/lib`-Dateisystem einen Checkpoint an, bevor sie über den Supervisor einen Ersatz starten. Die Aktivierung veröffentlicht außerdem den Boot-Hook des aktuellen Builds erneut und verwendet dessen aktuelle Docker-Geräte-/Bind-Mount-Argumente, einschließlich optionaler Mounts für die RUN-LED. Das Zurücksetzen stellt den vorherigen Hook zusammen mit dem vorherigen Container und Zustand wieder her. Das Journal gehört root und liegt unter `/var/lib/attraccess-wago-update-transaction`. Mountpunkte und verschachtelte Mounts des Zustands werden abgelehnt, weil die Wiederherstellung atomare Umbenennungen erfordert. Die Annahme behält Wiederherstellungsdaten bis zu einer dauerhaften Bestätigung des Servers; die Bereinigung verwendet ein separates, fortsetzbares Verzeichnis mit Besitzermarkierung. Kein Update-Primitiv stellt Registrierungs-Zugangsdaten neu aus, ersetzt `runtime.env` bzw. die CA oder entfernt unbeteiligte Container oder Images. Das geordnete Herunterfahren des Servers wartet, bis abgebrochene SSH-Operationen ihre Geräteoperations-Leases freigegeben haben, bevor der Store geschlossen wird. Die dauerhafte Journal-Absicht bleibt für den normalen Abgleich nach einem Neustart verfügbar. Nach Absturzwiederherstellung und Bestätigung gibt der Abgleich die Lease frei; der nächste automatische Scan startet einen nötigen Rollout mit einer frischen Operationsfrist.

Das Staging des Updates schreibt das authentifizierte äußere Bundle direkt in das Dateisystem des Journals und leitet `image.tar` über eine private FIFO an Docker weiter. Sowohl der Extraktor als auch Docker müssen erfolgreich sein, bevor Image-Identität und Plattform geprüft werden. Der byte-begrenzte Empfänger verwendet begrenzte `dd`-Blöcke und beobachtet nach jedem Lesevorgang die Dateigrößen-Metadaten, auch bei kurzen Pipe-Lesevorgängen, ohne das Archiv erneut zu durchsuchen. Er unterstützt das native und das FW31-knappe stat-Format und ist weder auf die optionale Unterstützung von `head -c` noch auf `dd iflag` angewiesen. Er prüft höchstens die erwartete Bundle-Größe plus ein Byte innerhalb einer Frist von 300 Sekunden. Unvollständige oder überlange Übertragungen, Prüfsummenfehler, Fehler des Empfänger-Werkzeugs und Zeitüberschreitungen des Empfängers haben jeweils eigene, handlungsorientierte Fehlermeldungen. Beobachtungen pro Block verwenden die vom äußeren Guard bereits identifizierte stat-ABI mit strengen Größengrenzen, statt dessen Capture-Pipeline mit mehreren Prozessen für jeden kurzen SSH-Lesevorgang zu wiederholen. Der vollständige Upload erhält weiterhin eine abgesicherte Größen- und Prüfsummenvalidierung, bevor Docker ihn laden kann. Der geprüfte Upload wird vor der Aktivierung entfernt; das Zurücksetzen verwendet den behaltenen Vorgänger und den Zustands-Checkpoint und benötigt daher keines der beiden Archive. Die Zulassung erfordert eine Bundle-Größe auf `/var/lib`, drei Bundle-Größen im ermittelten Datenverzeichnis von Docker und 16 MiB Reserve pro Dateisystem; gemeinsam genutzte Dateisysteme summieren diese Anforderungen. Die Docker-Reserve ist eine Zulassungsrichtlinie und keine garantierte Obergrenze für die Image-Expansion. Die Aktivierung prüft den Speicherplatz für den Checkpoint separat. Ungenutzte Upload-Pfade der Inbetriebnahme, einschließlich `/tmp`, beeinflussen die Zulassung von Updates nicht.

Ein verwaltetes Laufzeit-Update kann eine hängende MQTT-Laufzeitumgebung über ihre verifizierte SSH-Identität und die gestufte Transaktion ersetzen. Die Aktivierung benötigt keinen Heartbeat des alten Prozesses. Die Annahme verlangt weiterhin den Heartbeat und den Bereitschaftszustand des gewählten Images vom selben Boot, beide neuer als die Aktivierung. Ein bekannter alter Boot wird auch dann abgelehnt, wenn sein letzter Heartbeat veraltet ist; fehlende Telemetrie des alten Prozesses umgeht weder die Prüfung von Image, Aktualität noch Bereitschaft.

Nach der dauerhaften Bestätigung des Servers entfernt OTA bei Erfolg das ausgemusterte Vorgänger-Image bzw. nach einem Zurücksetzen das fehlgeschlagene Kandidaten-Image. Die Bereinigung beschränkt sich auf das exakte, im Journal dieses Updates verzeichnete Image und erhält Images, auf die ein laufender oder gestoppter Container verweist. Sie erzwingt nie das Entfernen und führt nie ein Docker-Prune aus. Schlägt das Docker-Inventar oder das Entfernen fehl, bleibt das Journal für den bestehenden Bereinigungs-Wiederholversuch des Koordinators erhalten, ohne ein akzeptiertes Update rückgängig zu machen.

Die eng gefasste, schreibgeschützte Hilfsoperation `storage-status <management-token>` meldet jeden Speicherpfad, verfügbare und erforderliche KiB, Dateisystem und Mountpunkt, gefolgt von den Größen der behaltenen Upload- und Journal-Pfade des Update-Systems. Sie nimmt die Mutationssperre nicht und löscht keine Dateien. Eine fehlgeschlagene Zulassung erhält die validierten Pfad- und Kapazitätswerte durch die SSH-Klassifizierung und den dauerhaften Update-Status hindurch. Das Details-Seitenpanel erklärt den Fehlbetrag in MiB und ob sich die vorherige Laufzeitumgebung erholt hat oder die Wiederherstellung noch aussteht. Beliebige entfernte stderr-Ausgaben und Zugangsdaten werden nie gespeichert oder angezeigt. `receiver-status <management-token>` ist eine schreibgeschützte Kompatibilitätsprüfung für den `head -c`-Empfänger des älteren Hilfsprogramms; sie meldet die Unterstützung, ohne die Mutationssperre zu erwerben oder den Laufzeitzustand zu ändern.

Der automatische Abgleich ist für **neue verwaltete Registrierungen** vorgesehen. Bestehende Registrierungen werden nicht migriert oder stillschweigend übernommen: Entfernen Sie sie und registrieren Sie sie erneut. Die Tabelle der Steuerungen zeigt die Laufzeitversionen vorher und nachher sowie eine Live-Update-Phase mit einem Aktivitätsbalken. Der Balken ist unbestimmt, weil der Updater Phasen statt eines Übertragungsprozentsatzes meldet. Unterschiedliche Images mit derselben Version enthalten eine kurze Image-ID. Jede Tabellenzeile verwendet höchstens zwei Textzeilen; Fehler, Wiederholungszeitpunkte, Voraussetzungen der SSH-Einrichtung und Wiederherstellungsfunktionen stehen in ihrem **Details**-Seitenpanel. Die Suche berücksichtigt Gerätenamen, IDs und gespeicherte IP-Adressen. Die Paginierung begrenzt Darstellung und Status-Abfrage auf jeweils 25 Zeilen. Start, dauerhafte Laufzeit-Heartbeats und ein 30-Sekunden-Wiederholungsdurchlauf steuern den Abgleich, mit höchstens zwei gleichzeitig aktiven Updates. Neue Verbindungen und geänderte Image-Identitäten fordern den Abgleich sofort an, auch wenn ein früherer Checkpoint des aktuellen Images noch eine Frist für eine erneute Prüfung hat. Steuerungen, deren Image vom Build dieses Servers abweicht, verwenden den eigenen Status **Software-Update**. Manuelle Befehle, Flow-Befehle und aktuelle Flow-Messwerte bleiben bei einer Abweichung nicht verfügbar, auch nach einem Zurücksetzen auf ein älteres Image. Nach einem Neustart des Servers bedeutet **Software wird geprüft**, dass das laufende Image auf Bestätigung wartet; dies allein reiht kein Update ein. Steuerungen ohne frischen Heartbeat zeigen **Keine Rückmeldung**, auch während ein Update aussteht.

Die Laufzeitumgebung meldet `runtime-update-gate-v1`. Sie schaltet beim Start und nach einer MQTT-Trennung jeden konfigurierten Ausgang aus, bevor sie eine Bestätigung anfordert, und überschreibt dabei Hold-/Watchdog-Richtlinien und manuelle Zuständigkeit. Bis eine verbindungsspezifische Bestätigung des Servers das laufende Image benennt, lehnt sie Befehle und Konfigurationsänderungen ab und setzt die Abfrage von Eingängen und Messwerten aus. Retained Bestätigungen früherer Verbindungen können das Gate nicht freigeben. Fehlgeschlagene Ausgangsabschaltungen halten die Bereitschaft auf „false“ und werden wiederholt, während Heartbeat und Update-Kommunikation weiterlaufen. Das geräteseitige Gating erfordert diese Laufzeitversion; ältere installierte Images erhalten es durch ihr erstes automatisches Update. Das **Details**-Seitenpanel erklärt klassifizierte Blockaden und Wiederherstellungsschritte auf Englisch und Deutsch, darunter fehlende Laufzeit-Assets, SSH-Identität/-Authentifizierung, CODESYS-Konflikte sowie Fehler bei Speicher, Übertragung, Bereitschaft und Wiederherstellung. Der Zustand **verifiziert** beim verwalteten Zugang bedeutet nur, dass der SSH-Verwaltungsschlüssel nachgewiesen wurde. Die SSH-Umstellung und die Verifizierung nach dem Neustart werden automatisch abgeschlossen, sobald eine frische dauerhafte MQTT-Verbindung, der Widerruf der Registrierungs-Zugangsdaten, die angewendete Konfiguration und die Bereitschaft der Laufzeitumgebung bestätigt sind. Die Tabelle zeigt einen kurzen Einrichtungsstatus; ihr **Details**-Seitenpanel zeigt die tatsächlich ausstehende Voraussetzung und den Fortschritt während der SSH-Umstellung bzw. des Neustarts. Es gibt keine manuelle Aktion zum Fortfahren. Steht die Konfiguration aus, wählen Sie **Konfigurieren**, dann auf der Frontplatte **Ein- & Ausgänge** **Auf Controller anwenden**, und beheben Sie jede dort angezeigte Ablehnung; die SSH-Einrichtung wird automatisch fortgesetzt, sobald die Steuerung sie bestätigt. Eingeschwungene aktuelle Steuerungen werden höchstens alle fünf Minuten erneut per SSH geprüft; ein geändertes Build-Image umgeht diese Frist, und die Bereinigung behaltener Transaktionen läuft weiter nach ihrem eigenen Wiederholungsplan. Lesefehler peripherer Modbus-Geräte bleiben als Kanalfehler sichtbar, ohne die Bereitschaft von Steuerung bzw. Laufzeitumgebung zu blockieren; Fehler der Onboard-Hardware und der Konfiguration blockieren Inbetriebnahme und Updates weiterhin. Datenbank-Leases, die über die gepinnte Geräteidentität adressiert werden, serialisieren Updates mit Inbetriebnahme, Verwaltungsübergängen, Entfernung und Operationen an Zugangsdaten.

Die Registrierung erstellt das dedizierte Nicht-Root-Konto `attraccess` mit einem eindeutigen Ed25519-Schlüssel. Der private Schlüssel und das zufällige Root-Wiederherstellungspasswort werden vor jeder Änderung auf der Gegenseite vom Secrets-Dienst des Hosts in `plugin_wago_managed_access` verschlüsselt. Das temporäre Bootstrap-Passwort wird nie gespeichert. Der verschlüsselte Umschlag ist an die Inbetriebnahmesitzung, die Transaktion und die gepinnte Geräteidentität gebunden. Das dedizierte Konto hat nur ein festes sudo-Hilfsprogramm ohne Argumente; sein root-eigener Public-Key-Eintrag erzwingt dieses Hilfsprogramm und verweigert Forwarding und PTY. Der Transport verwendet einen isolierten, kurzlebigen Agenten, gepinnte Host-Schlüssel und reine Schlüssel-Authentifizierung, ohne temporäre Datei für den privaten Schlüssel und ohne geerbten Agenten oder Passwort-Fallback.

Nachdem permanente Identität, Widerruf der Registrierung, angewendete Konfiguration und frische Bereitschaft der Laufzeitumgebung verifiziert sind, übernimmt die Inbetriebnahme ihre Installationsjournale. Erst dann ersetzt sie das Dropbear-Startskript durch den Attraccess-Wrapper mit `-G attraccess -w -s`. Eine zweite frische verwaltete Verbindung, eine authentifizierte Prüfung der Richtlinien von Daemon und lauschendem Socket, ein negativer Test des Root-Passworts und eine weitere verwaltete Verbindung gehen dem Commit voraus. Ein unabhängiger Drei-Minuten-Watchdog bleibt dann scharf, während das feste Hilfsprogramm die Steuerung neu startet. Eine geänderte Boot-ID des Hosts, frische unabhängige reine Schlüssel-Verbindungen, die Prüfung der Daemon-/Socket-Richtlinien und die Ablehnung des Root-Passworts müssen nach dem Neustart alle bestanden werden, bevor der Commit erfolgt. Der frühe Boot-Hook startet ein frisches Drei-Minuten-Fenster für das Zurücksetzen; geht der Server verloren, stellt die Steuerung ohne Eingabe von außen die vorherige SSH-Richtlinie wieder her, wenn die Umstellung nicht committet wurde. Das Passwort bleibt rotiert, und seine Wiederherstellungskopie bleibt verschlüsselt.

Der Server gewährt bis zu achtzehn Minuten für die Vorbereitung, einschließlich dreier begrenzter Wartezeiten auf die Installationssperre hinter Supervisor-Prüfungen. Seine Drei-Minuten-Frist für die SSH-Verifizierung beginnt, nachdem der Umstellungsbefehl bestätigt hat, dass SSH geändert wurde. Die gemeinsame Geräte-Lease deckt beide Phasen ab. Vor der SSH-Umstellung verwendet die Annahme die verifizierte, gepinnte Bootstrap-Anmeldung und ein festes, serverseitiges Skript, um ausschließlich die Journale der Registrierung zu beenden. Dies repariert auch unfertige Registrierungen mit älteren Hilfsprogrammen, die eine belegte Supervisor-Sperre sofort ablehnten; die Laufzeitumgebung wird dabei nicht neu installiert. Nach der Umstellung verwenden Laufzeit-Updates weiterhin den eingeschränkten Verwaltungsschlüssel. Die Annahme aktualisiert vor der Umstellung auch die bereits vorhandenen Hilfs- und Rollback-Skripte. Das BusyBox-`flock` von FW31 hat keine Option `-w`, daher verwenden alle SSH-Übergangssperren `timeout -k 5 30 flock 7`. Ein fehlgeschlagener Versuch fordert beim nächsten Scan ein unbestätigtes Zurücksetzen an; er bestätigt nie eine unbekannte SSH-Richtlinie. Alte Installationen, deren Hilfsprogramm und Watchdog beide `flock -w` verwenden, benötigen Konsolenzugriff auf die Steuerung oder wiederhergestelltes Root-SSH, bevor diese Skripte repariert werden können. Bei einer bestehenden unbestätigten Umstellung, bei der Hilfsprogramm und Watchdog beide `flock -w` ablehnen, können die normalen SSH-Kontrollkästchen des WBM den installierten Start-Wrapper nicht überschreiben. Bauen Sie ein gezieltes, vom Administrator zu installierendes Wiederherstellungspaket:

```sh
node apps/plugins/wago/scripts/build-ssh-lock-recovery.mjs \
  cc100-<16-hex-character-hardware-id> storage/recovery/cc100-ssh-recovery.ipk
```

Wählen Sie im FW31-WBM unter **Software Uploads** das Paket und anschließend **Install**. Das installierte [WAGO-Upload-Plugin 2.1.1](https://github.com/WAGO/cc100-firmware-sdk/blob/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0/ptxproj/src/wbm-ipk-uploads-2.1.1.tgz) lädt es in einer einzigen Aktion hoch und installiert es; es hat keine separate Schaltfläche „Activate“. Verwenden Sie **Force install**, wenn Sie eine unterbrochene oder fehlgeschlagene Installation derselben Paketversion wiederholen. Die Installation kann bis zu 310 Sekunden auf die Sperre der Steuerung warten, planen Sie daher etwa sechs Minuten für das Installationsergebnis ein. Das Neuladen des WBM beweist den Abschluss nicht und behält die gewählte Datei nicht in seinem Formular. Das Paket setzt die passende Hardware-ID der Laufzeitumgebung, private root-eigene Pfade und eine unbestätigte SSH-Änderung voraus. Version 1.0.1 akzeptiert außerdem die root-eigene `0644`-Sperre, die ältere Watchdogs im privaten Verwaltungsverzeichnis anlegen, und verschärft sie auf `0600`, ohne ihren Inode zu ersetzen. Andere Besitzer, schreibbare Modi, symbolische Links und Hardlinks werden mit konkreten Diagnosen abgelehnt. Es repariert die begrenzten Sperrbefehle und die private Erstellungsmaske für Sperren und ruft dann das bestehende Rollback-Skript auf. Bereits bestätigten Zugang lehnt es ab, und es behält Laufzeitkonfiguration und Zugangsdaten bei. Sobald Root-SSH wiederhergestellt ist, aktualisiert die automatische Registrierung die Verwaltungsskripte und wiederholt die Umstellung. Die Laufzeit-Inspektion liest den Hash des installierten Hilfsprogramms und das Docker-Image, ohne die Schreibsperre des Hardware-Supervisors zu nehmen. Eine belegte Hardwareprüfung lässt eine laufende Steuerung daher nicht offline erscheinen. Die Veröffentlichung des Hilfsprogramms und jede Laufzeittransaktion validieren weiterhin private root-eigene Pfade und warten höchstens 310 Sekunden auf die Schreibsperre, bevor sie etwas ändern. Fehler bei der Einrichtung behalten eine feste Diagnose für den fehlgeschlagenen Schritt und werden im Details-Seitenpanel der Steuerung angezeigt; rohe SSH-Ausgaben und Zugangsdaten sind darin nie enthalten.

Der Bereich **Wiederherstellungsoptionen** enthält **Root-Passwort anzeigen (protokolliert)**, eine ausdrückliche Administrator-Aktion. Sie verlangt einen aufgezeichneten, dauerhaften Audit-Beleg, bevor das Passwort entschlüsselt und zurückgegeben wird, sendet `Cache-Control: no-store` und gibt nie den privaten SSH-Schlüssel zurück. Das Geheimnis wird nur angezeigt, bis es ausgeblendet oder der Wiederherstellungsbereich geschlossen wird. Root-SSH wird nach der Umstellung verweigert. Für die Wiederherstellung und erneute Registrierung aus der Ferne verwendet **Vorherigen SSH-Zugang wiederherstellen (protokolliert)** den behaltenen Verwaltungsschlüssel, um die frühere SSH-Richtlinie wiederherzustellen, weist das erzeugte Root-Passwort auf einer frischen gepinnten Verbindung nach und beendet die automatische Verwaltung. Verwenden Sie das wiederhergestellte Passwort als temporäre Zugangsdaten der nächsten Registrierung; die nächste Sitzung erzeugt einen neuen Schlüssel und ein neues Passwort, statt die ausgemusterte Identität zu übernehmen. Die Außerbetriebnahme entfernt die autorisierten Schlüssel des dedizierten Kontos erst, nachdem der wiederhergestellte Root-Zugang unabhängig nachgewiesen wurde. Ein dauerhafter Zustand `retiring` blockiert automatische Updates und Schlüssel-Wiederholungen, bis die gepinnte Root-Inspektion die Entfernung verifiziert, auch nach einer verlorenen SSH-Antwort oder einem Serverneustart. Das Entfernen setzt diese abgeschlossene Außerbetriebnahme voraus, behält die Wiederherstellungssitzung und den verschlüsselten Datensatz und lehnt ein Update ab, dessen Zurücksetzen bzw. Bestätigung noch aussteht. Nicht lesbare verschlüsselte Zugangsdaten melden „Wiederherstellung erforderlich“ statt eines gesunden verwalteten Zugangs.

Das root-eigene Hilfsprogramm stellt feste Operationen bereit und wertet nie SSH-Befehle aus und führt nie Dateien aus, die aus einem Laufzeit-Bundle extrahiert wurden. Die Registrierung erstellt außerdem eine separate Veröffentlichungsautorität für den Installer je Steuerung. Ihr privater Schlüssel ist im selben gebundenen Datenbank-Umschlag verschlüsselt; nur ihr öffentlicher Schlüssel wird auf der Steuerung installiert. Der eng gefasste SSH-Schlüssel allein kann keinen ausführbaren Code veröffentlichen. Ändert der bereitgestellte Build seinen kompilierten Installer, signiert der Server genau dieses Hilfsprogramm für das Registrierungs-Token. Der feste Publisher prüft Signatur, Digest, Länge, Syntax und Root-Besitz unter der Installationssperre, lehnt ausstehende Transaktionen ab und ersetzt dann das Hilfsprogramm atomar. Keine API akzeptiert Installer-Quellcode oder gibt einen der privaten Schlüssel zurück. Unbekannte Protokollversionen schlagen sichtbar fehl. Jedes Laufzeit-Update verwendet anschließend den Boot-Hook und die Geräte-/Bind-Argumente des aktuellen Builds, sodass Installer-Korrekturen bereits registrierte Steuerungen ohne erneuten Inbetriebnahmeversuch erreichen. Der unabhängige Update-Watchdog stellt nicht akzeptierte Updates nach einer Unterbrechung wieder her; der Wiederherstellungs-Hook beim Neustart läuft nach dem Docker-Start des Herstellers und vor dem Laufzeit-Hook und lässt die Aktivierung der Laufzeitumgebung ausgeschaltet, wenn die Wiederherstellung nicht nachgewiesen werden kann. Retained MQTT-Messwerte, der Stream des alten Boots, allein geladene Images und neu komprimierte identische Images können den Erfolg eines Updates nicht belegen.

Dies sind Garantien für Software und isolierte Testaufbauten (Fixtures). Für diese Umsetzung stand keine Steuerung am Prüfstand zur Verfügung; die physische FW31-Qualifizierung von Umstellung, Neustart, E/A und Wiederherstellung bleibt daher, unabhängig vom Software-Stand, ausdrücklich **nicht verifiziert**. Die Aktion zur Wiederherstellung des Bootstrap-Zustands aus der Ferne ist kein lokaler Wiederherstellungsweg. Für FW31 wurde bislang kein lokaler Root-Wiederherstellungsweg qualifiziert, wenn sowohl der verwaltete SSH-Zugang als auch der Server nicht verfügbar sind. Bestimmen Sie vor der Auslieferung die unterstützte physische bzw. herstellerseitige Wiederherstellungsschnittstelle und weisen Sie nach, dass das erzeugte Root-Passwort dort funktioniert; nehmen Sie nicht an, dass Root-SSH, WBM oder eine serielle Konsole verfügbar bleibt.

Die erste nutzbare Beta zielt auf die CC100 `751-9301` mit Firmware **31**. Weitergehende Firmware-Verweise weiter unten sind Hardware-Hintergrund, keine zusätzlichen unterstützten Baselines. Die geführte Inbetriebnahme verwendet ein lokal per Prüfsumme geprüftes Offline-Bundle, keinen Registry-Pull auf der Steuerung und keine verpflichtende WBM-Einrichtung. Sie benennt ihren Container `attraccess-wago` und bindet das Verzeichnis `/var/lib/attraccess-wago` der Steuerung dort per Bind-Mount ein. Ab dem **2026-09-06** ist die Inbetriebnahme destruktiv: Bestehende Anwendungen und Daten funktionieren möglicherweise nicht mehr oder werden gelöscht, wobei Attraccess bereits vorhandene CODESYS- oder andere Workloads weder erhält noch eine Sicherungskopie davon erstellt noch sie wiederherstellt. Sie stoppt CODESYS stets und deaktiviert es dauerhaft und verifiziert dies vor dem E/A-Zugriff. Die unterstützte Docker-Einrichtung und dauerhafte, eng gefasste E/A-Berechtigungen gehören zum Installer. Siehe den aktuellen [Plattformvertrag](plugins/wago/commissioning-platform.md).

Das ältere manuelle Beispiel weiter unten benennt seinen Container `attraccess-wago-cc100` und verwendet stattdessen ein benanntes Docker-Volume. Diese Speicherorte und seine Neustart-Richtlinie sind mit der geführten Inbetriebnahme **nicht austauschbar**. Die geführte Inbetriebnahme verwendet die Docker-Neustart-Richtlinie `no` und einen Host-Supervisor, der vor jedem Start die Deaktivierung von CODESYS, den exklusiven Besitz und den eng gefassten Registerzugriff verifiziert. Fünf aufeinanderfolgende Absturzstarts lösen eine Abkühlzeit von 30 Sekunden aus; eine gesunde Beobachtung setzt diesen Zähler zurück. Er prüft regelmäßig den laufenden Schreiber und versucht bei fehlgeschlagenen Prüfungen die Eindämmung. Das historische manuelle Beispiel mit `unless-stopped` bietet dieses Gate nicht. Identifizieren Sie vor einer Bereinigung die tatsächliche Installation; führen Sie die manuelle Installation nicht über einer in Betrieb genommenen Steuerung aus.

Bei geführten Installationen startet Docker selbst `attraccess-wago` nie neu. Der Marker `runtime-enabled` hält die dauerhafte Absicht des Betreibers fest. Fehlgeschlagene Beobachtungen stoppen den Schreiber, behalten diese Absicht aber bei; nach verifizierter Eindämmung wartet der Supervisor 30 Sekunden und wiederholt das gesamte Gate. Bei Sperrkonflikten wird auf die besitzende Transaktion gewartet, ohne ihren Schreiber zu stoppen. Explizites Stoppen, Ersetzen und Zurücksetzen entfernen die Aktivierung weiterhin. Lässt sich das Stoppen nicht verifizieren, meldet die Überwachung „Wiederherstellung erforderlich“, statt einen ungeprüften Neustart zu versuchen.

Die letzte fehlgeschlagene Beobachtung des Supervisors wird in `/etc/attraccess-wago/supervisor.last-error` aufbewahrt, einer privaten, atomar ersetzten Datei mit UTC-Zeit, Exit-Status, Aktion und bis zu 4096 Byte Diagnoseausgabe. Eine erfolgreiche Wiederherstellung erhält diesen Nachweis. Ein fehlgeschlagenes anfängliches Boot-Gate startet nach verifizierter Eindämmung ebenfalls die Überwachung im Hintergrund. Bestätigen Sie die Wiederherstellung über einen frischen Heartbeat, nicht allein über einen erfolgreichen Abschluss des Hooks. Ältere Hooks entfernten bei einem Fehler die Aktivierung; Installationen, die sich bereits in diesem Zustand befinden, benötigen eine ausdrückliche Wiederherstellung über die [Bereinigung bzw. erneute Inbetriebnahme im Assistenten](plugins/wago/cc100-commissioning.md#wiederherstellung-nach-dauerhaft-gesperrter-eindämmung) oder eine geprüfte Wiederherstellung durch den Support. Umgehen Sie das Host-Gate nicht mit `docker start` und ändern Sie nicht die Neustart-Richtlinie von Docker.

Beide Wege verwenden `/etc/attraccess-wago/runtime.env` auf dem **Host der Steuerung**. Docker liest sie über `--env-file`; sie wird nicht in den Container eingebunden. Der Laufzeitzustand ist `/var/lib/attraccess-wago/state.json` **innerhalb des Containers**, gestützt auf das Hostverzeichnis bei der geführten Inbetriebnahme bzw. auf das benannte Volume beim manuellen Beispiel. Sowohl die Umgebungsdatei des Hosts als auch der Laufzeitzustand können Zugangsdaten enthalten. Ein lokales Attraccess-Backup ist kein Nachweis dafür, dass eine der beiden geräteseitigen Dateien oder der SSH-Wiederherstellungszugang in einer Sicherungskopie enthalten ist. Prüfen Sie die Wiederherstellbarkeit vor Änderungen an Zugangsdaten und halten Sie Geheimnisse aus Support-Nachweisen heraus.

Die Laufzeitumgebung läuft auf einer WAGO CC100 `751-9301` mit WAGO-Linux-Firmware und Docker. Sie verwendet kein CODESYS und akzeptiert keinen hochgeladenen Steuerungscode. Ihre aktuelle Protokollversion ist `1.0.0`, die Laufzeitversion ist `0.1.0`.

## Sicherheitsgrenze

Diese Laufzeitumgebung ist **nicht sicherheitsbewertet**. Sie darf nicht als Not-Halt, als Personenschutzfunktion oder als Ersatz für zertifizierte Sicherheitsschaltungen verwendet werden. Halten Sie alle offiziellen Not-Halt- und Sicherheitsschaltungen unabhängig. Ein Fehler der Laufzeitumgebung, der Verlust von MQTT, ein Container-Absturz, ein Neustart oder ein Konfigurationsfehler müssen als Betriebsstörung behandelt werden, nicht als Beleg für einen sicheren Zustand.

## Voraussetzungen

Bestätigen Sie vor der Bereitstellung alle folgenden Punkte:

- Die Steuerung ist eine `751-9301`. Das veröffentlichte Image ist für `linux/arm/v7` gebaut.
- Die CC100 hat eine WAGO-Linux-Firmware mit Docker-Unterstützung. Die Referenz von WAGO für Onboard-E/A setzt Firmware 21 (`03.09.04`) oder neuer voraus; halten Sie die installierte Firmware in der Bereitstellungsdokumentation fest.
- Ein Administrator hat SSH- oder WBM-Zugriff auf die CC100. Verwenden Sie ein isoliertes Administrationsnetzwerk und beschränken Sie den SSH-/WBM-Zugriff auf autorisierte Bediener.
- Die Steuerung erreicht den konfigurierten MQTT-Broker und die Registry, die `ghcr.io` bereitstellt. Es gibt keine eingehenden Laufzeit-Ports; erforderlich sind ausgehendes MQTT und Zugriff auf die Image-Registry.
- Persistenter Speicher ist für Docker und für `/var/lib/attraccess-wago` verfügbar. Der Docker-Lebenszyklus von WAGO verwendet `/home/docker` für Docker-Daten.
- Der Attraccess-Betreiber hat je Steuerung eine Hardware-ID, einen Pairing-Code, eine MQTT-URL, Zugangsdaten für die Erkennung und ein Registrierungsgeheimnis ausgestellt.
- Der physische Aufbau, die Verdrahtung, Schutzeinrichtungen, Schütze sowie nicht sicherheitsbezogene Stopp-, Fehler- und Freigabesignale wurden geprüft. Die Referenzaufbauten `751-9301`, `879-3000` und `879-1300` erfordern die unten stehende Checkliste zur physischen Verifizierung.

## Docker aktivieren

Die geführte Inbetriebnahme bereitet die bereits in der Firmware installierte Docker-Funktion innerhalb der einen destruktiven Installationsfreigabe vor. Sie verwendet bei Bedarf den Aktivierungsweg des Herstellers und verifiziert vor dem E/A-Zugriff die Verfügbarkeit des Daemons und die Aktivierung beim Booten. Das erfasste `config_docker install` von FW31 prüft nur den Aktivierungsstatus; es lädt Docker weder herunter noch entpackt es Docker. Fehlende Client-/Daemon-Binärdateien bleiben nicht unterstützt. Die Aktivierung durch den Hersteller kann gespeicherte Start-, Routing- und Firewall-Zustände ändern; weder Deaktivierung noch Entfernung stellt bereits vorhandene Anwendungen wieder her. Das erfasste Init-Skript hat keine brauchbare Aktion `status`, daher prüft die Inbetriebnahme stattdessen Beobachtungen des Daemons und Ergebnisse der Getter. Siehe die [aktuellen Unterstützungsgrenzen](plugins/wago/fw31-support.md) für die Herkunft des exakten Quellcodes, verbleibende Prüfungen und die abgelöste Entscheidung zur Erhaltung. WBM ist kein erforderlicher Schritt der Inbetriebnahme.

## Image beziehen und prüfen

Das Laufzeit-Manifest nennt diesen vorgesehenen Versions-Tag:

```text
ghcr.io/attraccess/wago-cc100-runtime:0.1.0
```

Die CI veröffentlicht einen Commit-SHA-Tag für `linux/arm/v7`, verifiziert das veröffentlichte Manifest und lädt die unveränderliche Referenz `<tag>@<digest>` als Artefakt `wago-cc100-runtime-image` hoch. Verwenden Sie diesen aufgezeichneten Digest statt eines veränderlichen Tags.

```sh
export IMAGE='ghcr.io/attraccess/wago-cc100-runtime@sha256:<published-release-digest>'
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{index (split (index .RepoDigests 0) "@") 1}}'
```

Der geprüfte Digest muss exakt mit dem Release-Digest übereinstimmen. Behalten Sie das gepullte Image lokal für das Zurücksetzen; löschen Sie das vorherige bewährte Image erst, wenn das neue Image die Checkliste zur physischen Verifizierung bestanden hat.

## Konfiguration der Steuerung vorbereiten

Erstellen Sie eine nur für root lesbare Umgebungsdatei. Sie enthält Broker-Zugangsdaten und darf nie committet, in Tickets kopiert oder in Support-Bundles aufgenommen werden.

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

Die Laufzeitumgebung benötigt `WAGO_HARDWARE_ID`, `WAGO_MQTT_URL` und `WAGO_PAIRING_CODE`. `WAGO_MQTT_USERNAME` und `WAGO_MQTT_PASSWORD` sind Zugangsdaten für die Erkennung, bis die Steuerung beansprucht (geclaimt) wird. `WAGO_ENROLLMENT_SECRET` ist für die Registrierung bei der Erkennung erforderlich. `WAGO_MQTT_PREFIX` ist standardmäßig `attraccess/wago`; verwenden Sie den ausgestellten Namensraum, falls er abweicht. Der Pfad des persistenten Zustands ist standardmäßig `/var/lib/attraccess-wago/state.json` und speichert die zuletzt akzeptierte Konfiguration, den Ausgangszustand, einen begrenzten Befehlsverlauf und die dauerhaften Zugangsdaten. Die Datei wird mit dem Modus `0600` angelegt.

### E/A-Pfade und Host-Zugriff

`WAGO_IO_PATHS` ist ein JSON-Objekt mit Schlüsseln der Form `<hardware-profile>:<channel>`. Jeder Eintrag liefert einen Dateipfad für `input` und/oder `output`. Firmware-Revisionen können IIO-Geräte unterschiedlich aufzählen; ermitteln Sie diese Pfade daher vor der Bereitstellung auf dem Zielgerät. Verwenden Sie keine Pfadzuordnung einer anderen Firmware-Version, ohne sie zu verifizieren.

WAGO dokumentiert diese relevanten Host-Pfade:

- Digitale Ausgänge: `/sys/kernel/dout_drv/DOUT_DATA`
- Digitale Eingänge: `/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din`
- Analoge Werte und Pt1000-Werte: die jeweiligen Raw-Dateien unter `/sys/bus/iio/devices/iio:device*/...`
- Kalibrierdaten: `/etc/calib`
- RS-485: `/dev/serial` auf der `751-9301`; ihr serieller Modus ist ausschließlich RS-485

Das aktuelle Image instanziiert nur den Onboard-E/A-Adapter. Es kann die über `WAGO_IO_PATHS` angegebenen Dateipfade lesen oder beschreiben, liest aber `/etc/calib` nicht und implementiert keine Kalibriertransformationen. Seine Adapterklassen für RS-485 und Modbus TCP werden vom Einstiegspunkt nicht ausgewählt, daher sind RS-485- und Modbus-Bereitstellung in diesem Artefakt nicht verfügbar. Die aufgeführten Pfade sind WAGO-Host-Dokumentation und Eingabe für eine künftige Hardware-Validierung, keine Behauptung aktueller Unterstützung durch die Laufzeitumgebung.

Das aktuelle Release-Manifest deklariert `privileged: false`, UID `10001`, alle Capabilities entfernt und eine explizite Liste von Geräten und Bind-Mounts. Die manuellen `docker run --privileged`-Befehle in dieser technischen Referenz halten die historische Baseline bei `9e0a1c47` fest und sind nicht der unterstützte Installationsweg. Die exakte Liste der Geräte und Bind-Mounts für die Produktion ist noch nicht auf Hardware validiert und muss durch das Hardware-Gate von ATT-984 bestätigt werden.

Bis dahin dürfen Sie keine validierte Bereitstellung mit minimalen Rechten behaupten. Das vorgesehene Ersatzmodell ist:

- Binden Sie nur die konkret konfigurierten sysfs-/IIO-Dateien ein, die für die Onboard-E/A der Steuerung erforderlich sind, schreibgeschützt für Eingänge und nur für Ausgangsdateien mit Schreibzugriff. Diese stellen die vom Adapter verwendeten physischen E/A-Pfade bereit.
- Fügen Sie einen schreibgeschützten Mount von `/etc/calib` erst hinzu, nachdem ein Laufzeit-Release ihn liest, um die Kalibrierung von Analog- oder Pt1000-Werten zu implementieren. Dies bewahrt die Produktionskalibrierung von WAGO, ohne ihre Änderung zuzulassen.
- Fügen Sie `--device /dev/serial` erst hinzu, nachdem ein Laufzeit-Release seinen Modbus-RTU-Adapter für RS-485 auswählt. Dies beschränkt den seriellen Zugriff auf die dokumentierte CC100-Schnittstelle, statt `/dev` offenzulegen.
- Binden Sie ein benanntes Volume nur unter `/var/lib/attraccess-wago` ein, damit die akzeptierte Konfiguration und die Deduplizierung von Befehlen einen Austausch oder Neustart überstehen.
- Binden Sie weder den Docker-Socket, das Root-Dateisystem des Hosts noch ein uneingeschränktes `/dev`-Verzeichnis ein. Die Laufzeitumgebung stellt keinen eingehenden Netzwerkdienst bereit und benötigt derzeit nur ausgehendes MQTT.

## Die WIP-Laufzeitumgebung starten

Dieser Befehl spiegelt das aktuelle Manifest wider. Setzen Sie den Image-Digest und eine zielspezifische E/A-Zuordnung erst ein, nachdem Sie sie auf der Steuerung geprüft haben. Das Beispiel für `WAGO_IO_PATHS` ist absichtlich leer: Keine Zuordnung gilt universell für alle CC100-Firmware-Versionen.

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

In diesem historischen manuellen Beispiel startet `--restart unless-stopped` die Laufzeitumgebung nach Neustarts von Docker und der Steuerung, sofern ein Bediener sie nicht ausdrücklich gestoppt hat. Es macht die Laufzeitumgebung nach einem Fehler nicht sicher und ist nicht die aktuelle Richtlinie der geführten Inbetriebnahme. Halten Sie Befehl, Image-Digest, Prüfsumme der Umgebungsdatei (nicht ihren Inhalt), Container-ID, Firmware-Version und die Prüfung der E/A-Zuordnung in der Bereitstellungsdokumentation fest.

Prüfen Sie den Start und bewahren Sie die Ausgabe auf:

```sh
docker ps --filter name=attraccess-wago-cc100
docker logs --tail 200 attraccess-wago-cc100
docker inspect --format '{{.State.Status}} {{.RestartCount}}' attraccess-wago-cc100
```

Fehler in Laufzeit-Callbacks werden nach Container-stderr geschrieben, daher ist `docker logs` der primäre Befehl zum Sammeln von Logs. Fügen Sie einem Support-Bundle die Ausgabe von `docker inspect` und `docker logs`, die Firmware-Version und nicht geheime Konfigurationsmetadaten hinzu. Nehmen Sie `/etc/attraccess-wago/runtime.env` oder `state.json` nie auf, ohne zuvor die Zugangsdaten zu entfernen.

MQTT-Veröffentlichungen und -Abonnements der Laufzeitumgebung warten höchstens 10 Sekunden auf die Bestätigung des Brokers. Eine Zeitüberschreitung weist ausstehende Operationen ab und schließt den Socket, um den automatischen Wiederverbindungsversuch und die konfigurierte Richtlinie bei Verbindungsverlust auszulösen. Das Schließen des Sockets gibt ebenfalls ausstehende Operationen frei. Unbestätigte Veröffentlichungen werden verworfen und nach der Wiederverbindung nicht erneut gesendet; frische Heartbeats, Zustände und Messwerte setzen sich über ihre normalen Publisher fort. Dies verhindert, dass ein fehlendes PUBACK eine Mess- oder Heartbeat-Schleife dauerhaft blockiert, solange das MQTT-Keepalive weiterhin gelingt.

## Registrierung und Zugangsdaten

Der vorgesehene Registrierungsablauf ist auf die Erkennung beschränkt und einmalig:

1. Die Steuerung meldet ihre Hardware-ID, den Pairing-Code, die Protokoll- und Laufzeitversionen, ihre Fähigkeiten und ein Registrierungsgeheimnis an `attraccess/wago/discovery/<hardware-id>`.
2. Der Betreiber beansprucht (claimt) sie innerhalb des Registrierungsfensters von 15 Minuten über das entsprechende Discovery-Claim-Topic.
3. Attraccess gibt steuerungsspezifische MQTT-Zugangsdaten und Details zu den Betriebs-Topics zurück und widerruft dann die Zugangsdaten für die Erkennung.
4. Die Steuerung speichert die permanenten Zugangsdaten dauerhaft und verbindet sich nur noch mit der steuerungsspezifischen Identität neu.

Die Laufzeitumgebung veröffentlicht eine retained Erkennungsmeldung, abonniert das Claim-Topic, validiert und speichert die zurückgegebenen Zugangsdaten dauerhaft, bevor sie die Verbindung trennt, und verbindet sich dann mit der permanenten Identität der Steuerung neu. Spätere Starts verwenden die gespeicherte Identität und setzen nicht voraus, dass die Erkennungsidentität gültig bleibt.

Bei einer Kompromittierung von Zugangsdaten, bei Außerbetriebnahme oder bei fehlgeschlagener Rotation:

1. Widerrufen Sie zuerst die betroffene Broker-Identität.
2. Stoppen Sie den Container, um wiederholte fehlgeschlagene Authentifizierungsversuche zu verhindern.
3. Stellen Sie über den Attraccess-Bereitstellungsprozess neue steuerungsspezifische Zugangsdaten aus.
4. Ersetzen Sie `WAGO_MQTT_USERNAME` und `WAGO_MQTT_PASSWORD` in der Umgebungsdatei mit dem Modus `0600` und setzen Sie `WAGO_MQTT_USE_ENV_CREDENTIALS=true`, um das vollständige Ersatzpaar statt der gespeicherten Zugangsdaten zu verwenden.
5. Entfernen Sie den gestoppten Container und erstellen Sie ihn mit demselben geprüften Image-Digest, demselben Zustands-Volume und derselben E/A-Zuordnung unter Verwendung der aktualisierten `--env-file` neu. Docker liest `--env-file` nur beim Erstellen eines Containers; `docker start` würde die widerrufenen Zugangsdaten beibehalten.
6. Prüfen Sie die Logs und verifizieren Sie einen Heartbeat unter der erwarteten Hardware-ID.
7. Behalten Sie das persistente Volume, es sei denn, die Wiederherstellung erfordert, die akzeptierte Konfiguration und den Befehlsverlauf zu verwerfen.

## Konfiguration und Betriebsprüfung

Mit dem Standardpräfix verwendet die Laufzeitumgebung diese Topic-Wurzel:

```text
attraccess/wago/v1/controllers/<hardware-id>/
```

Sie abonniert mit QoS 1:

- `configuration/desired` für einen retained Soll-Snapshot
- `commands` für nicht retained Befehle

Sie veröffentlicht mit QoS 1:

- `configuration/reported` retained, einschließlich Version, Inhalts-Hash und strukturierter Validierungsfehler
- `state` retained, einschließlich Verbindungszustand, akzeptierter Version bzw. akzeptiertem Hash und Ausgangszuständen
- `heartbeat` alle 30 Sekunden mit Hardware-ID, Pairing-Code, Protokoll-/Laufzeitversionen, Fähigkeiten und einem Sequenzwert
- `measurements` alle 5 Sekunden für konfigurierte Messkanäle
- `faults`, wenn ein Lesevorgang einer Messung oder ein Schreibvorgang am Gerät fehlschlägt
- `acknowledgements` für akzeptierte, doppelte oder abgelehnte Befehle

Soll-Snapshots werden validiert, bevor sie gespeichert werden. Ein abgelehnter Snapshot veröffentlicht Fehler auf Feldebene in der gemeldeten Konfiguration (Reported Configuration) und lässt die zuletzt akzeptierte Konfiguration unverändert. Prüfen Sie nach jedem Update den retained Datensatz `configuration/reported` und vergleichen Sie Version und Hash mit der Soll-Konfiguration (Desired Configuration). Senden Sie keine Befehle, bevor die erwartete Konfiguration gemeldet wird.

Verwenden Sie nur Diagnosefunktionen, die im exakt getesteten Plugin-Build vorhanden sind. Diese manuelle Baseline belegt nicht, dass es eine Detailansicht der Steuerung gibt; verifizieren Sie die integrierte Oberfläche, bevor Sie ihre Navigation dokumentieren. Die Inspektion von Topics auf Broker-Ebene ist ein Engineering-Werkzeug und keine normale Abnahme durch Betreiber, und Nachrichten können neben Topologie und Betriebszustand auch Geheimnisse enthalten.

## Ressourcen-Flows

Sobald eine Steuerung beansprucht und ihre Konfiguration angewendet ist, bietet der Flow-Katalog vier WAGO-Knoten:

| Knoten              | Verwendung                                                                                         | Ausgänge                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| WAGO command        | Einen Ausgang gemäß seinem konfigurierten geschalteten oder impulsartigen Verhalten steuern.       | `output`, `failure` (entsprechend dem gewählten Verhalten bei Fehlern) |
| WAGO event received | Einen Flow bei einer Zustandsmeldung, Messung oder einem Fehler eines Kanals starten.              | `output`                                                               |
| WAGO read state     | Den zuletzt empfangenen Zustand oder Messwert lesen, ohne einen Befehl an die Steuerung zu senden. | `output`, `unavailable`                                                |
| WAGO wait for state | Warten, bis ein verfügbarer Zustand oder Messwert einem konfigurierten Wert entspricht.            | `output`, `timeout`                                                    |

Wählen Sie die Steuerung, den benannten logischen Kanal und die Operation bzw. die Ereignis-/Zustandskategorie. Befehlsknoten listen nur Ausgangskanäle auf und binden die angewendete Konfigurationsversion fest; öffnen und speichern Sie sie nach der Veröffentlichung einer neuen Version erneut. Ereignis-, Lese- und Warteknoten unterstützen auch Eingangs- und Messkanäle.

Das Ausgangsverhalten des Kanals (geschaltet oder impulsartig) ist maßgeblich:

| Konfiguriertes Verhalten | Operation des Befehlsknotens | Ergebnis                                                                          |
| ------------------------ | ---------------------------- | --------------------------------------------------------------------------------- |
| Geschaltet               | **Turn on / turn off**       | Den Ausgang auf den gewählten booleschen Zustand setzen.                          |
| Impuls                   | **Trigger pulse**            | Für die konfigurierte Dauer des Kanals einschalten, dann automatisch ausschalten. |
| Nur Eingang oder Messung | Keine Befehlsoperation       | Ereignis-, Lese- oder Warteknoten verwenden.                                      |

Wählen Sie auf der Frontplatte **Ein- & Ausgänge** eine Ausgangsklemme, um unter **Wenn ein Flow den Ausgang einschaltet** ihr Verhalten festzulegen: **Eingeschaltet bleiben, bis er ausgeschaltet wird** (geschaltet) oder **Impuls, danach automatisch ausschalten** (impulsartig, mit **Impulsdauer (Sekunden)**). **Wenn Attraccess nicht erreichbar ist** legt das Verhalten bei Verbindungsverlust fest. Sie können einen Ausgang jederzeit zwischen geschaltet und impulsartig umstellen; wählen Sie **Auf Controller anwenden**, um die Änderung zu veröffentlichen. Impulsdauer, betriebliche Freigabebedingungen (Guards), Rückmeldungsüberwachung und das Verhalten bei Verbindungsverlust gehören zur Konfiguration der Steuerung. Flow-Knoten bestimmen, wann die zulässige Operation ausgelöst wird; sie können diese Einstellungen nicht überschreiben oder eine andere Dauer vorgeben. Guards werden geprüft und konfigurierte Rückmeldungen überwacht, und zwar bei Befehlen beider Ausgangsverhalten.

Das bestehende Snapshot-Format der Version 1 bleibt erhalten. Die Fähigkeit `pulse` und eine positive `pulse.durationMs` definieren zusammen das impulsartige Verhalten; Ausgangskanäle ohne beides sind geschaltet. Inkonsistente Impuls-Einstellungen werden sowohl von der API als auch von der Konfigurationsvalidierung der Laufzeitumgebung abgelehnt. Die Aktionen des Befehls-Wire-Formats bleiben `set` (mit einem booleschen `value`) und `pulse`.

**Bestehende Flows:** Set-Befehle auf Impuls-Kanälen sind nun ungültig, auch Set-Aus. Sie werden nicht automatisch umgewandelt. Die Validierung markiert den Knoten, und die Ausführung lehnt ihn vor der Veröffentlichung ab. Wählen Sie ausdrücklich **Trigger pulse**, oder ändern Sie den Kanal auf geschaltetes Verhalten, veröffentlichen Sie diese Konfiguration und öffnen Sie den Knoten erneut, um seine neue Version zu übernehmen. Manuelle Befehle unterliegen denselben Einschränkungen. Aktualisierte CC100-Laufzeitumgebungen lehnen auch inkompatible direkte MQTT-Befehle mit `unsupported_operation` ab; das alleinige Bereitstellen des Plugins aktualisiert die installierte Laufzeitumgebung einer Steuerung nicht. Die interne Abschaltung nach Impulsen und die Behandlung bei Verbindungsverlust schalten Ausgänge weiterhin aus.

Ereignis-, Lese- und Warteknoten legen ihr Ergebnis in `wago` ab und erhalten dabei die eingehende Payload. Beispielsweise enthält `wago.value` einen booleschen Zustand oder einen numerischen Messwert, mit Informationen zu Aktualität und Verfügbarkeit in `wago.available`, `wago.stale` und `wago.offline`, sofern ein Messwert vorliegt. Fehlende Messwerte liefern `wago.available: false`; Leseknoten leiten fehlende oder nicht verfügbare Messwerte an `unavailable`, und Warteknoten stimmen nur mit verfügbaren Messwerten überein. Messwerte und Vergleiche verwenden [Wire-Einheiten](plugins/wago/measurement-contract.md).

Zustandsereignisse sind Meldungen, einschließlich periodischer Snapshots; sie beschränken sich nicht auf Wertänderungen. Verwenden Sie das Mindestintervall des Ereignisknotens, um zu begrenzen, wie häufig er einen Flow startet, und die Mindeständerung, um Messwerte zu filtern. Ein Ereignis kann nicht verfügbare Daten melden; prüfen Sie daher `wago.available`, wenn es auf Aktualität ankommt.

Alle vier WAGO-Knoten funktionieren auch in [globalen Flows](flows/global-flows.md). Ein globaler Flow ist bei Konfliktprüfungen und Flow-Verweisen ein eigener Kanalbesitzer (`global flow <id>`), und Links zu seinen Knoten zeigen auf `/devices/flows/:flowId?node=<nodeId>`. In einem globalen Flow gibt es keine feste Ressource, verwenden Sie daher nur die Steuerung und den Namen des Kanals.

Verbinden Sie zum Beispiel **WAGO event received → WAGO read state → eine Bedingung**, um auf einen Kontakt zu reagieren und dabei einen anderen Kanal zu prüfen. Verwenden Sie **WAGO command → WAGO wait for state**, wenn der Flow erst fortfahren soll, nachdem ein Eingang den erwarteten Zustand meldet.

## Wiederherstellung

### Brokerverlust

Die Laufzeitumgebung markiert den Zustand als getrennt, wenn ihr MQTT-Client schließt. Jeder konfigurierte Ausgang hat in der Soll-Konfiguration (Desired Configuration) eine Richtlinie bei Verbindungsverlust:

- `hold`: den Ausgang unverändert lassen
- `immediate`: einen sofortigen Wechsel auf „aus“ anfordern
- `watchdog`: einen Wechsel auf „aus“ nach dem konfigurierten Timeout anfordern

Dies sind ausschließlich betriebliche Steuerungen, keine Sicherheitsfunktionen. Stellen Sie die Broker-Verbindung wieder her, prüfen Sie den retained Zustand und den letzten Heartbeat und verifizieren Sie dann die physischen Ausgänge, bevor Sie den normalen Betrieb wieder aufnehmen.

### Ungültige Konfiguration

Lassen Sie die Laufzeitumgebung laufen. Prüfen Sie die gemeldete Konfiguration (Reported Configuration) auf Fehler auf Feldebene, korrigieren Sie den vollständigen Snapshot der Soll-Konfiguration und veröffentlichen Sie eine neue Version mit dem zugehörigen Inhalts-Hash. Ein abgelehnter Snapshot darf nicht durch manuelles Ändern der persistenten Zustandsdatei umgangen werden.

### Container-Absturz

```sh
docker ps -a --filter name=attraccess-wago-cc100
docker logs --tail 500 attraccess-wago-cc100
docker inspect --format '{{json .State}}' attraccess-wago-cc100
docker start attraccess-wago-cc100
```

Wiederholt sich der Absturz, stoppen Sie den Container und bewahren Sie die Logs auf, bevor Sie Image oder Konfiguration ändern. Prüfen Sie die Erreichbarkeit des Brokers, die Zugangsdaten, beschreibbaren persistenten Speicher und jeden konfigurierten E/A-Pfad des Hosts.

### Neustart der Steuerung

Bestätigen Sie nach der Rückkehr der CC100, dass Docker aktiv ist und die Laufzeitumgebung einen neuen Heartbeat veröffentlicht. Verifizieren Sie bei der geführten Inbetriebnahme, dass der Boot-Hook CODESYS deaktiviert gehalten und den eng gefassten Registerzugriff verifiziert hat, bevor Attraccess gestartet wurde; fehlgeschlagene Prüfungen müssen es gestoppt lassen. Verifizieren Sie den retained Zustand und die gemeldete Konfiguration (Reported Configuration), bevor Sie die E/A testen. Das persistente Volume behält den akzeptierten Snapshot und den begrenzten Befehlsverlauf; es ist kein Backup bereits vorhandener Workloads und spielt bestätigte Befehle oder Impulse nicht erneut ab.

### Image oder Konfiguration zurücksetzen

Behalten Sie den vorherigen Image-Digest und das persistente Volume, bis der Ersatz akzeptiert wurde.

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

Validieren Sie den zurückgegebenen Image-Digest, den Heartbeat, die retained Konfiguration und die physischen Ausgänge. Um die Konfiguration zurückzusetzen, veröffentlichen Sie den vorherigen vollständigen Snapshot der Soll-Konfiguration als neue Version; bearbeiten Sie `state.json` nicht von Hand. Verwerfen Sie das Zustands-Volume nur im Rahmen eines genehmigten Wiederherstellungsverfahrens, denn es enthält Konfigurationsverlauf, Daten zur Deduplizierung von Befehlen und möglicherweise Zugangsdaten.

## Checkliste zur physischen Verifizierung

Halten Sie Nachweise gegen [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) fest; das Bestehen dieser Checkliste ist vor der Supported-Beta-Freigabe erforderlich.

- Bestätigen Sie die Bestellnummer der Steuerung `751-9301`, die installierte Firmware, die Docker-Aktivierung, den ARMv7-Image-Digest und das Neustartverhalten bei persistenter Installation.
- Bestätigen Sie, dass die Aufbauten `879-3000` und `879-1300` die vorgesehene Spannungsversorgung, Verdrahtung, Modbus-Einstellungen, Adresszuordnung, Messwerte, Behandlung von Überläufen (Rollover) und Fehlermeldung aufweisen, sobald ein Laufzeit-Release die Modbus-Adapter auswählt.
- Bestätigen Sie jeden konfigurierten digitalen Onboard-Pfad gegen das sysfs-Layout der Ziel-Firmware. Validieren Sie Analog-/Pt1000-Pfade und `/etc/calib` nur, wenn die Laufzeitumgebung die Kalibrierung implementiert.
- Bestätigen Sie, dass `/dev/serial` die RS-485-Schnittstelle ist und dass kein unbeteiligter serieller oder Gerätezugriff gewährt wird, sobald RS-485-Unterstützung implementiert ist.
- Bestätigen Sie, dass die endgültige Geräteliste und die Bind-Mounts des Containers minimal sind, und dokumentieren Sie den Grund für jeden Eintrag; entfernen Sie `--privileged` vor der Freigabe.
- Erproben Sie Erkennung, Claim, Rotation und Widerruf von Zugangsdaten, sobald das Image sie implementiert.
- Erproben Sie Annahme und Ablehnung der Soll-/gemeldeten Konfiguration, Wiederverbindung, Neustart der Steuerung, doppelte Befehle, Impulse, Guards, Rückmeldungen, Messwerte, Fehler und Richtlinien bei Verbindungsverlust.
- Verifizieren Sie, dass die offiziellen Not-Halt- und Sicherheitsschaltungen unabhängig und unberührt bleiben.

## Quellen

- [WAGO-CC100-Docker-Lebenszyklus](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/config-tools/config_docker_home)
- [Direkter Onboard-E/A-Zugriff bei WAGO](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md)
- [Erkennung der seriellen Schnittstelle der WAGO CC100](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/init.d/serial_features)

### Verwaltete Registrierung und Abgleich

Verwaltete Registrierung, Wiederholung des verwalteten Zugangs und automatischer Abgleich stehen ohne zusätzliche Umgebungskonfiguration zur Verfügung. Die Inbetriebnahme verifiziert vor dem Fortfahren die Kompatibilität der Steuerung, die Voraussetzungen der Laufzeitumgebung und die verschlüsselten Verwaltungs-Zugangsdaten. Der Hintergrund-Abgleich startet mit dem Plugin und verwaltet nur Steuerungen mit einer registrierten Identität. Neue Laufzeitverbindungen lösen sofort einen Abgleich aus; periodische Heartbeats fassen Fallback-Scans der gesamten Flotte zu höchstens einem neuen Scan pro 30 Sekunden zusammen. Verschlüsselte Offenlegung der Wiederherstellung und Aktionen zur Wiederherstellung des Bootstrap-Zustands bleiben Administratoren vorbehalten. Die physische FW31-Qualifizierung bleibt eine separate Anforderung für die Freigabe: Wiederherstellung, SSH-Ablehnung, Watchdog/Neustart und die Abnahme wiederholter Updates müssen an einer isolierten Prüfstand-Steuerung getestet werden.

Administratoren können ein fehlgeschlagenes, blockiertes oder eine Wiederherstellung erforderndes Laufzeit-Update im Bereich **Wiederherstellungsoptionen** des **Details**-Seitenpanels der Steuerung erneut versuchen. Dies verschiebt die dauerhafte Wiederholungsfrist unter der gemeinsamen Geräte-Lease; ausstehende Belege für Zurücksetzen und akzeptierte Bereinigung bleiben erhalten und werden abgeschlossen, bevor ein neueres Image gestartet wird. Die Außerbetriebnahme wird nach dem Erwerb des Geräte-Besitzes erneut geprüft, und bedingte Zugangsübergänge können die dauerhafte Absicht zur Außerbetriebnahme nicht überschreiben.
