# CC100-Inbetriebnahme: Plattform-Software

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Seit dem **2026-09-06** ist die Inbetriebnahme destruktiv. Vorhandene Anwendungen und
Workloads können aufhören zu funktionieren oder gelöscht werden. Attraccess bewahrt vorhandene CODESYS-Anwendungen,
gespeicherte SPS-Daten, andere Workloads oder deren Host-Einstellungen nicht auf, erstellt keine Sicherungskopie davon
und stellt sie nicht wieder her. Die [frühere Entscheidung zur Bewahrung und die Befunde zur Herstellerquelle](plugins/wago/fw31-support.md)
bleiben als Historie bestehen. Tests verwenden temporäre Dateien und gefälschte
Geräte-Transporte; **es wird keine Abnahme für physische E/A, Firmware-Neustart oder
Management-Härtung behauptet**. ATT-984 bleibt ein Release-Gate.

## Geführte Bereitstellung

Die bestehende Bereitstellungsanfrage enthält `confirmInstall: true` und frische temporäre
SSH-Zugangsdaten. Eine einzige Bestätigung der Folgen autorisiert die destruktive Vorbereitung;
es gibt kein separates Gate für Workload-Bewahrung, Docker oder ein obligatorisches WBM.

Die Bereitstellung prüft die angeheftete SSH-Identität, die Offline-Prüfsumme der Laufzeit und die Broker-Anforderungen
und bereitet dann den Controller unter seiner Operationssperre vor:

1. Prüfen Sie die Identität des CC100 `751-9301` FW31, die erforderlichen von der Firmware installierten Werkzeuge
   und die erwarteten Ergebnisse der Hersteller-Getter.
   Lesen Sie `/etc/os-release` als Text; lehnen Sie doppelte/widersprüchliche Felder ab.
   BSP `VERSION_ID="2024.12.0"` allein genügt nicht.
2. Stoppen Sie CODESYS immer und deaktivieren Sie es dauerhaft, einschließlich einer aktiven SPS oder einer
   gestoppten SPS, die beim Booten aktiviert ist. Prüfen Sie Prozess- und Boot-Zustand, bevor E/A gewährt wird.
   Ein Fehler stoppt die Inbetriebnahme vor der Einrichtung oder dem Start der Laufzeit.
3. Bereiten Sie die von der Firmware installierte Hersteller-Docker-Laufzeit vor und aktivieren Sie sie bei Bedarf.
   Ziehen Sie keine Ersatz-Engine und kein Ersatz-Image aus einer externen Registry.
   Nicht unterstützte Pakete, fehlende Werkzeuge und mehrdeutige Dienstzustände schlagen geschlossen fehl (fail closed).
4. Richten Sie einen dauerhaften Zugriff ein, der auf die erforderlichen digitalen Register beschränkt ist, und prüfen Sie
   die Ausgangs-Eigentümerschaft und die Berechtigungen des Laufzeit-Kontos erneut.
5. Schließen Sie die eingeschränkte Einrichtung und die gesperrte Laufzeit-Bereitstellung ab und warten Sie dann
   auf die dauerhafte Erkennung und die unabhängige Bereitschaftsprüfung.

`codesysState=disabled` wird nur nach erfolgreich verifizierter Vorbereitung festgehalten.
Fehler bei der Vorbereitung führen zu `delivery_failed`; Zugangsdaten und Einwilligung werden nicht
wiederverwendet. Ein erneuter Versuch erfordert frische Zugangsdaten und die Freigabe der destruktiven Installation.
Die Prüfung der Voraussetzungen bleibt schreibgeschützt und optional; gespeicherte Berichte
autorisieren die Vorbereitung nie ohne die aktuelle Anfrage und ihre serverseitigen Prüfungen.

Der aktuelle Pfad erfordert lokale Docker-Client-/Daemon-Binärdateien und die Docker-/Laufzeit-Werkzeuge der Firmware.
Ein `install-vendor-runtime`-Bericht wählt den Hersteller-Befehl `config_docker install`; in der erfassten FW31-Implementierung prüft dieser nur
den Aktivierungszustand und lädt nichts herunter oder entpackt nichts.
Sein Install-Status-Getter ist kein Inventar von Binärdateien/Versionen. Fehlende Binärdateien/Werkzeuge bleiben nicht unterstützt.
Ein laufender, beim Booten aktivierter Docker-Daemon wird nicht bedingungslos deaktiviert oder
neu installiert. Vor der Herstellerinstallation/-aktivierung prüft die Vorbereitung unabhängig
das Boot-Medium und lehnt ein leeres Ergebnis oder `sd-card` ab. Sie verifiziert, dass das
ausführbare `S99_docker` auf `/etc/init.d/dockerd` auflöst, der Aktivierungs-Getter
`active` zurückgibt und der Daemon Docker `25.0.4` meldet.
Siehe die [Befunde zur exakten Quelle](plugins/wago/fw31-support.md#exakte-erweiterungsquelle-und-erfasste-fw31-nachweise)
für das erfasste Verhalten und die verbleibenden Grenzen bei der Herkunft der Abhängigkeiten.

## Hardware- und Neustart-Grenze

Das Installationsprogramm folgt dem [Hardware-Vertrag der Laufzeit](https://github.com/Attraccess/Attraccess/blob/main/apps/plugins/wago/cc100-runtime/HARDWARE.md)
und stellt bereit mit:

```text
--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges
--network host --restart no
--env WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-rtu-v1
--mount type=bind,src=/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din,dst=/run/attraccess-wago/io/din,readonly
--mount type=bind,src=/sys/kernel/dout_drv/DOUT_DATA,dst=/run/attraccess-wago/io/dout
--mount type=bind,src=/sys/devices/platform/led/leds/run-green/brightness,dst=/run/attraccess-wago/io/led-run-green
--mount type=bind,src=/sys/devices/platform/led/leds/run-red/brightness,dst=/run/attraccess-wago/io/led-run-red
```

Die beiden RUN-LED-Mounts sind optionale Statusrückmeldung. Sie werden nur hinzugefügt, wenn die
Dateien existieren, und eine fehlgeschlagene LED-Freigabe blockiert nie die E/A (siehe [RUN-LED-Status](#run-led-status)).
Beide DIN-/DOUT-Quellen müssen als die erwarteten regulären Dateien existieren, nicht als Ersatzverzeichnisse
oder Symlinks in der letzten Pfadkomponente. Es ist kein Root-Fallback, kein privilegierter Modus und kein breiter Mount von `/sys`,
`/dev`, Host-Root oder Docker-Socket zulässig. Das geschützte Laufzeit-
Statusverzeichnis und der separate schreibgeschützte Mount der privaten CA behalten ihren TLS-Vertrag.

Der dauerhafte Boot-Hook `/etc/rc.d/S99_zz_attraccess_wago start` verifiziert die Deaktivierung von CODESYS, die Eigentümerschaft und den
engen Registerzugriff, bevor Attraccess gestartet wird.
Die Neustartrichtlinie von Docker ist `no`. Ein root-eigener Host-Supervisor erlaubt höchstens fünf
Absturz-Neustarts pro Supervisor-Lauf und wiederholt vor jedem Start das vollständige Host-Gate.
Er prüft außerdem in jedem Zyklus den laufenden Schreiber, mit einer Pause von zwei Sekunden
zwischen den Zyklen. Beobachtungsfehler, Konflikte und erschöpfte Wiederholungsversuche deaktivieren die Freigabe der
Laufzeit und versuchen eine begrenzte Eindämmung. Ein fehlgeschlagenes oder nicht verifizierbares Stoppen bleibt
ein Fehler, der eine Wiederherstellung erfordert; es wird nie als erfolgreiche Eindämmung gemeldet.
Der Start erfordert außerdem eine begrenzte Bestätigung von einem Supervisor, der seine
eigene Sperre hält; der Start eines Hintergrundprozesses allein ist keine erfolgreiche Startquittung.

Ein Neustart des Docker-Daemons startet den Container nicht von selbst. Solange die Freigabe der Laufzeit
besteht, kann der Supervisor oder der geprüfte Hook ihn über das vollständige Gate und innerhalb seiner Grenzen fortsetzen.
Eine fehlgeschlagene Beobachtung während eines Daemon-Ausfalls kann stattdessen die Eindämmung verriegeln, indem
`/etc/attraccess-wago/runtime-enabled` entfernt wird.
Nach dieser Verriegelung aktiviert weder der Hook-Start noch ein Neustart des Controllers die Laufzeit erneut.
Der Hook-`start` beendet sich derzeit mit `0`, ohne zu starten, wenn die Freigabe fehlt; das
ist ein deaktivierter No-op, kein erfolgreicher Start der Laufzeit.

Beheben Sie die Ursache und nutzen Sie die bestehende
[Bereinigungs-/Wiederinbetriebnahme-Route des Assistenten](plugins/wago/cc100-commissioning.md#wiederherstellung-nach-verriegelter-eindämmung).
Bei aktuellen geführten Sitzungen bietet die Oberfläche die Bereinigung nur bei erhaltener Laufzeit-
Eigentümerschaft an; `/recover` gleicht sein Journal mit Token und die Zugangsdaten ab. Eine nicht beanspruchte
Sitzung kann dann die Bereitstellung wiederholen, während eine beanspruchte Sitzung die Entfernung der Registrierung
und eine neue Sitzung erfordert. Nur eine frische freigegebene Installation erzeugt die Freigabe neu.
Es gibt keine Schaltfläche zum erneuten Aktivieren und keinen Schritt zum Bearbeiten der Markierung. Fehlende Eigentümerschaft oder eine fehlgeschlagene
Bereinigung bleibt ein Blocker. Die Boot-Reihenfolge und Fixture-Erfolge belegen
das physische Neustartverhalten nicht. Die
[Ablösung durch die Sicherheitsentscheidung vom 2026-09-06](plugins/wago/fw31-support.md#sicherheits-nachtrag-vom-2026-09-06)
hält die ersetzte vorläufige Neustartrichtlinie fest.

Die Vorabprüfung verifiziert die Berechtigungen als UID/GID 10001, ohne zusätzliche Gruppen oder
Capabilities, mit kompatiblen Werkzeugen zur Rechteabgabe und no-new-privileges. Sie testet
DIN-Lesezugriff und DOUT-Lese-/Schreibzugriff, ohne Testwerte in Register zu schreiben.
Fehlende Werkzeuge, fehlende Register und nicht verifizierbare Berechtigungen schlagen geschlossen fehl.
Die dauerhafte Software-Einrichtung erfordert weiterhin eine Validierung durch einen physischen Neustart.

Die Vorbereitung stoppt ausdrücklich beide Hersteller-Laufzeitauswahlen, bevor sie die Auswahl
`0` erzwingt. Sie verifiziert fehlende SPS-Prozesse, eine reguläre `rtsversion`, die genau `0` enthält,
fehlendes `S98_runtime` und keinen anderen aktivierten Boot-Eintrag, der auf eine bekannte
SPS-/Laufzeit-Ausführungsdatei auflöst. Die Prüfungen wiederholen sich nach einem Persistenz-Flush und
bevor die Laufzeit startet.

Die Prüfung der Ausgangs-Eigentümerschaft untersucht CODESYS-Prozesse/Boot-Zustand und alle Container,
einschließlich gestoppter Container. Mounts der exakten Ausgangsdatei, übergeordneter Verzeichnisse und kanonischer
Symlink-Aliasse sowie andere privilegierte Container stellen einen Konflikt dar. Nur der exakte
Vorgänger `attraccess-wago` ist ausgenommen, da das gesperrte Installationsprogramm seine
Ersetzung steuert. Vor dem Gewähren von Berechtigungen muss dieser Vorgänger als
gestoppt mit deaktiviertem Neustart verifiziert sein.

Die Host-Absicherung lehnt die Nutzung der UID/GID 10001 durch Host-Konten/-Gruppen, nicht zugehörige Prozesse ab,
die diese numerische Identität verwenden, ebenso nicht verifizierte User-Namespace-Zuordnungen und offene beschreibbare
DOUT-Deskriptoren, einschließlich Pfaden, die dasselbe Gerät/denselben Inode referenzieren. Ein eigener Laufzeit-
Prozess ist nur nach vollständigen Prüfungen von Docker-ID, Namespace-Zuordnung und cgroup ausgenommen.
Unbekannte oder fehlgeschlagene Beobachtungen blockieren den Start. Dies sind wiederholte Beobachtungen,
kein Schutz vor jedem privilegierten Host-Schreiber, der eine Prüfung überholt; exklusive
Eigentümerschaft bleibt eine Betriebs- und physische Qualifizierungsanforderung.

Konfigurationsverzeichnisse und Sperren müssen die erwartete root-Eigentümerschaft,
restriktive Berechtigungen und Dateitypen haben. Die Boot-Veröffentlichung verwendet eine eindeutige reguläre
Staging-Datei im validierten Boot-Verzeichnis. Unsichere vorhandene Pfade werden abgelehnt.

Docker-Befehle wählen den lokalen Unix-Endpunkt des Controllers und verwerfen geerbte
Remote-Kontext-Einstellungen. Sie zielen nie auf den Daemon des Entwicklerrechners.

## RUN-LED-Status

Die Laufzeit steuert die RUN-LED des CC100 (grüne und rote Diode; beide leuchtend ergeben Gelb):

| Muster                                  | Bedeutung                                                |
| --------------------------------------- | -------------------------------------------------------- |
| Dauerhaft gelb                          | Laufzeitprozess startet                                  |
| Gelbes Blinken                          | Verbunden, wartet auf Beanspruchung (Kopplung)           |
| Rotes Blinken                           | MQTT-Broker nicht erreichbar                             |
| Abwechselnd grün/gelb                   | Beansprucht, noch keine Konfiguration akzeptiert         |
| Überwiegend rot, kurze Lücke            | Hardware- oder Konfigurationsfehler; Bereitschaft prüfen |
| Grüner Heartbeat, periodische Lichtshow | Bereit                                                   |
| Aus                                     | Laufzeit gestoppt (oder LED-Zugriff nicht verfügbar)     |

WAGO `ledserverd` belässt RUN auf `STATIC_OFF`, sobald CODESYS deaktiviert ist, und konkurriert daher nicht mit der
Laufzeit. Die LED ist kosmetisch: Fehlende Dateien oder Berechtigungen deaktivieren sie lediglich,
und sie ist keine Sicherheitsanzeige.

## Berichte, Bereinigung und Sicherheit

Der Bericht der Version 1 enthält genau acht mit einem Zeilenumbruch abgeschlossene Felder:

```text
version=1
platform=supported
hardware=accessible
exclusivity=clear
docker=running
configDocker=present
provision=none
qualification=required
```

Aktuelle Bereitstellungszustände umfassen `prepare-controller` und
`install-vendor-runtime`. Die unterstützte Vorbereitung kann `codesys-active`,
`codesys-boot-enabled` und `uid10001-access-denied` auflösen; diese Beobachtungen sind keine
bedingungslosen Blocker der Oberfläche. Nicht unterstützte Firmware/Komponenten, fehlende Register,
unbekannte Eigentümerschaft und unabhängige Ausgangs-Schreiber bleiben Blocker.
Historische Berichte mit `qualification=required` und alte Bereitstellungszustände bleiben
lesbar. `software-supported` bedeutet, dass der Bericht einen Vorbereitungspfad über die
erwarteten Hersteller-Werkzeuge/Getter gefunden hat; es ist keine Byte-/Build-Bestätigung des
gesamten FW31-Abhängigkeitssatzes und keine physische Qualifizierung. Ein bereits laufender Daemon
ohne Vorbereitungspfad kann wie oben weiterhin `qualification=required` melden.
Unvollständige oder unbekannte Berichtsfelder sind keine leere Workload.

Der Plattform-Aktivierungsendpunkt behält den bestehenden Vertrag
`reviewedDockerActivation: true` für ausdrücklich geprüfte destruktive
Vorbereitung bei. Die geführte Oberfläche nutzt die einzelne Bereitstellungsaktion. Vom Server ausgestellte
Eigentümer-Token und Vorbereitungszustände werden vor der Remote-Änderung persistiert;
Timeouts bleiben unbestimmt, bis sie ausdrücklich abgeglichen werden. Clients liefern
keine Skripte, internen Token oder vertrauenswürdigen Prüfberichte.

**Fehlgeschlagene Installation bereinigen** nutzt den bestehenden Wiederherstellungsendpunkt mit frischen
SSH-Zugangsdaten und ausdrücklicher Bereinigungsfreigabe. Es gleicht die Laufzeit-
Installation, die Zugangsdaten und das Vorbereitungsjournal ab. **Controller-Vorbereitung
bereinigen** behandelt Fehler, die nur die Vorbereitung betreffen; die Bereinigung der Laufzeit hat Vorrang,
wenn die Laufzeitinstallation begonnen hat. Keine der beiden Aktionen stellt vorhandene SPS-Programme,
Workloads, Daten oder Docker-Host-Einstellungen wieder her, noch aktiviert sie CODESYS erneut. Fremde oder
inkonsistente Integritätseinträge bleiben Fehler. Ein vor dem
Upload gespeichertes Bereitstellungs-Token kann ein fehlendes Laufzeitjournal über die passende destruktive
Vorbereitungs-Eigentümerschaft abgleichen. Für Vorbereitungsfehler vor der Veröffentlichung des Remote-Journals
gibt es einen ausdrücklichen Bereinigungspfad; dauerhafte Quittungen mit Token machen Wiederholungen bei verlorener Antwort und
bei Koordinator-Speicherfehlern wiederholbar. Das Fehlen eines Journals ist keine Aussage, dass
frühere Workloads wiederhergestellt wurden. Ältere Journale behalten ihre Integritätsprüfungen.
Bei einer journalisierten Installation verifiziert die Bereinigung, dass der Neustart deaktiviert und der eigene
Container gestoppt oder nicht vorhanden ist, bevor der Erfolg festgehalten wird. Das Entfernen der Laufzeit
verifiziert anschließend ebenfalls die Abwesenheit. Ein fehlender/nicht erreichbarer Daemon oder eine fehlgeschlagene Docker-Abfrage
ist kein Beweis für einen gestoppten Schreiber; der Fehler und die Wiederherstellungs-Eigentümerschaft bleiben erhalten.

Angeheftetes SSH, Prüfungen von Laufzeit-Prüfsumme/Manifest, TLS und der Widerruf der Einrichtung bleiben erzwungen.
Die Einrichtung des Management-Schlüssels und **Gespeicherten Zugriff wiederherstellen** behalten ihren eigenen
Sicherheits-/Wiederherstellungsvertrag. Die vollständige Management-Härtung bleibt nicht unterstützt, wo
ihre Herstellerabhängigkeit und die Anforderungen an eine aussperrsichere Wiederherstellung nicht erfüllt sind; dieser
Status macht die unterstützte Docker-/E/A-Vorbereitung nicht nicht verfügbar.

Der Start des Containers, die Bereinigung oder `codesysState=disabled` allein ist kein Abschluss.
Verlangen Sie einen frischen dauerhaften Heartbeat, den Widerruf der Einrichtung, die passende angewendete
Konfiguration und die aktuelle Laufzeit-`state.readiness`. Die physische Qualifizierung und
die verbleibende Management-Basis müssen zutreffend dargestellt werden.

## Quellnachweise und Entscheidungshistorie

Die [Direkt-E/A-Anleitung](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md) von WAGO
dokumentiert die exakten Register, den gepackten Dezimalzugriff und die Zuordnung des niederwertigsten Bits.
Das offizielle [CC100-Firmware-SDK](https://github.com/WAGO/cc100-firmware-sdk/tree/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0)
liefert die in der ursprünglichen Prüfung untersuchten Docker-, Laufzeit- und Boot-Verträge des Herstellers.
Diese Revision ist FW30-V04.08.09, kein pauschaler FW31-Nachweis.
Das spätere Audit der exakten Quelle untersuchte getrennt gehashte, erfasste FW31-Docker-,
Laufzeit- und Boot-Dateien. Seine Befunde lösen Annahmen über das Entpacken von Archiven
aus den älteren SDK-Varianten ab; das aktuelle [Support-Verzeichnis](plugins/wago/fw31-support.md#exakte-erweiterungsquelle-und-erfasste-fw31-nachweise)
hält die Herkunft der Erfassung fest und grenzt sie von der inoffiziellen Erweiterung ab.

Die Herstelleraktivierung kann Boot-Links, Routing, Firewall und Speicher verändern; die
Deaktivieren-/Entfernen-Aktionen des Herstellers sind keine allgemeinen Umkehrungen. Die destruktive
Produktentscheidung entfernt die Pflicht, alte Workloads/Einstellungen wiederherzustellen. Sie
entfernt weder Kompatibilitätsprüfungen der Komponenten, dauerhafte Operations-Eigentümerschaft,
Verifikation der Nachbedingungen, minimale E/A-Berechtigungen noch die physische Abnahme.
Der [FW31-Support-Eintrag](plugins/wago/fw31-support.md) bewahrt die ursprünglichen Befunde
und kennzeichnet ausdrücklich ihre Ablösung.
