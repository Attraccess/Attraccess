# CC100-Inbetriebnahme: Plattformsoftware

Seit **2026-09-06** ist Inbetriebnahme destruktiv. Bestehende Anwendungen und Workloads können ausfallen oder gelöscht werden. Attraccess erhält, sichert und restauriert keine vorherigen CODESYS-Anwendungen, gespeicherten PLC-Daten, anderen Workloads oder deren Host-Einstellungen. Die [frühere Erhaltungsentscheidung und Vendor-Quellbefunde](devices/wago-fw31-support.md) bleiben Historie. Tests verwenden temporäre Dateien und simulierte Gerätetransporte; **keine physische I/O-, Firmware-Neustart- oder Verwaltungshärtungsabnahme wird behauptet**. ATT-984 bleibt eine Freigabeschranke.

## Geführte Auslieferung

Die bestehende Auslieferungsanfrage enthält `confirmInstall: true` und frische temporäre SSH-Zugangsdaten. Eine Folgenbestätigung autorisiert destruktive Vorbereitung; keine separate Workload-Erhaltungs-, Docker- oder verpflichtende WBM-Schranke existiert.

Auslieferung prüft festgelegte SSH-Identität, Offline-Runtime-Prüfsumme und Broker-Anforderungen und bereitet den Controller dann unter seiner Vorgangssperre vor:

1. CC100-`751-9301`-FW31-Identität, erforderliche firmwareinstallierte Werkzeuge und erwartete Vendor-Getter-Ergebnisse prüfen. `/etc/os-release` als Text lesen; doppelte oder widersprüchliche Felder ablehnen. BSP `VERSION_ID="2024.12.0"` allein genügt nicht.
2. CODESYS immer stoppen und dauerhaft deaktivieren, einschließlich aktiver PLC oder gestoppter bootaktivierter PLC. Prozess- und Boot-Zustand vor I/O-Zugang prüfen. Fehler stoppt Inbetriebnahme vor Registrierung oder Runtime-Start.
3. Firmwareinstallierte Vendor-Docker-Runtime vorbereiten und bei Bedarf aktivieren. Keine Ersatz-Engine oder Images aus externer Registry laden. Nicht unterstützte Pakete, fehlende Werkzeuge und mehrdeutige Service-Zustände blockieren.
4. Dauerhaften Zugang nur zu erforderlichen Digitalregistern einrichten und Ausgangszuständigkeit sowie Runtime-Kontoberechtigungen nachprüfen.
5. Eingeschränkte Registrierung und gesperrte Runtime-Auslieferung abschließen, dann auf permanente Erkennung und unabhängige Bereitschaftsprüfung warten.

`codesysState=disabled` wird erst nach erfolgreicher verifizierter Vorbereitung erfasst. Vorbereitungsfehler erzeugen `delivery_failed`; Zugangsdaten und Zustimmung werden nicht wiederverwendet. Retry verlangt frische Zugangsdaten und destruktive Installationsfreigabe. Voraussetzungeninspektion bleibt lesend und optional; gespeicherte Berichte autorisieren nie Vorbereitung ohne aktuelle Anfrage und serverseitige Prüfungen.

Der aktuelle Weg erfordert lokale Docker-Client-/Daemon-Binaries und Docker-/Runtime-Werkzeuge der Firmware. Ein Bericht `install-vendor-runtime` wählt den Vendor-Befehl `config_docker install`; in der erfassten FW31-Implementierung prüft er nur Aktivierungszustand und lädt oder entpackt nichts. Sein Installationsstatus-Getter ist keine Binär-/Versionsinventarisierung. Fehlende Binaries/Werkzeuge bleiben unsupported. Ein laufender bootaktivierter Docker-Daemon wird nicht bedingungslos deaktiviert oder neu installiert. Vor Vendor-Installation/Aktivierung prüft die Vorbereitung das Boot-Medium unabhängig und lehnt leeres Ergebnis oder `sd-card` ab. Sie prüft, dass ausführbares `S99_docker` nach `/etc/init.d/dockerd` auflöst, Aktivierungs-Getter `active` liefert und Daemon Docker `25.0.4` meldet. Siehe [Befunde exakter Quellen](devices/wago-fw31-support.md#exact-extension-source-and-captured-fw31-evidence) für erfasstes Verhalten und verbleibende Grenzen der Abhängigkeitsherkunft.

## Hardware- und Neustartgrenze

Der Installer folgt dem [Runtime-Hardwarevertrag](https://github.com/Attraccess/Attraccess/blob/main/apps/plugins/wago/cc100-runtime/HARDWARE.md) und stellt bereit mit:

```text
--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges
--network host --restart no
--env WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1
--mount type=bind,src=/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din,dst=/run/attraccess-wago/io/din,readonly
--mount type=bind,src=/sys/kernel/dout_drv/DOUT_DATA,dst=/run/attraccess-wago/io/dout
--mount type=bind,src=/sys/devices/platform/led/leds/run-green/brightness,dst=/run/attraccess-wago/io/led-run-green
--mount type=bind,src=/sys/devices/platform/led/leds/run-red/brightness,dst=/run/attraccess-wago/io/led-run-red
```

Die zwei RUN-LED-Mounts sind optionale Statusrückmeldung. Sie werden nur bei vorhandenen Dateien ergänzt; fehlgeschlagene LED-Rechte blockieren I/O nie (siehe [RUN-LED-Status](#run-led-status)). DIN-/DOUT-Quellen müssen als erwartete reguläre Dateien existieren, nicht Ersatzverzeichnisse oder Symlinks der letzten Pfadkomponente. Kein root-Fallback, privilegierter Modus, breiter `/sys`-, `/dev`-, Host-root- oder Docker-Socket-Mount ist erlaubt. Geschütztes Runtime-Zustandsverzeichnis und separater lesender privater CA-Mount behalten ihren TLS-Vertrag.

Der dauerhafte Boot-Hook `/etc/rc.d/S99_zz_attraccess_wago start` prüft CODESYS-Deaktivierung, Eigentum und engen Registerzugriff vor Attraccess-Start. Dockers Neustartrichtlinie ist `no`. Ein root-eigener Host-Supervisor erlaubt höchstens fünf Crash-Neustarts je Supervisor-Lauf und wiederholt die vollständige Host-Prüfung vor jedem Start. Er prüft auch den laufenden Schreiber bei jedem Zyklus mit zwei Sekunden Pause dazwischen. Beobachtungsfehler, Konflikte und ausgeschöpfte Retries deaktivieren Runtime-Aktivierung und versuchen begrenzte Eindämmung. Fehlgeschlagenes oder ungeprüftes Stoppen bleibt wiederherstellungsbedürftiger Fehler; es gilt nie als erfolgreiche Eindämmung. Start verlangt außerdem begrenzte Bestätigung eines Supervisors mit eigener Sperre; alleiniger Hintergrundprozessstart ist keine erfolgreiche Startquittung.

Ein Docker-Daemon-Neustart startet den Container nicht selbst. Solange Runtime-Aktivierung vorhanden bleibt, können Supervisor oder geprüfter Hook ihn durch die vollständige Schranke und innerhalb ihrer Limits fortsetzen. Fehlgeschlagene Beobachtung während Daemon-Ausfall kann stattdessen Eindämmung durch Entfernen von `/etc/attraccess-wago/runtime-enabled` verriegeln. Danach aktivieren weder Hook-Start noch Controller-Neustart die Runtime erneut. Hook `start` endet derzeit mit `0` ohne Start bei fehlender Aktivierung; dies ist deaktivierte Wirkungslosigkeit, kein erfolgreicher Runtime-Start.

Beheben Sie die Ursache und verwenden Sie den bestehenden [Assistenten zur Bereinigung und erneuten Inbetriebnahme](devices/wago-cc100-commissioning.md#recover-after-latched-containment). Bei aktuellen geführten Sitzungen bietet die UI Bereinigung nur mit erhaltener Runtime-Zuständigkeit; `/recover` gleicht tokengebundenes Journal und Zugangsdaten ab. Eine unübernommene Sitzung kann danach Auslieferung wiederholen; eine übernommene Sitzung verlangt Registrierungsentfernung und neue Sitzung. Nur frische genehmigte Installation erstellt Aktivierung neu. Es gibt keinen Wiederaktivierungsbutton oder Marker-Bearbeitungsschritt. Fehlende Zuständigkeit oder fehlgeschlagene Bereinigung bleibt Blocker. Boot-Reihenfolge und Fixture-Erfolg belegen kein physisches Neustartverhalten. Die [Sicherheitsersetzung vom 2026-09-06](devices/wago-fw31-support.md#security-follow-up-on-2026-09-06) dokumentiert die ersetzte zwischenzeitliche Neustartrichtlinie.

Preflight prüft Rechte als UID/GID 10001 ohne Zusatzgruppen oder Fähigkeiten mit kompatiblen Privilegienwerkzeugen und no-new-privileges. Er prüft DIN-Lesen und DOUT-Lesen/Schreiben ohne Registertestwerte zu schreiben. Fehlende Werkzeuge, Register oder ungeprüfte Rechte blockieren. Dauerhafte Softwareeinrichtung benötigt weiterhin physische Neustartvalidierung.

Vorbereitung stoppt beide Vendor-Runtime-Auswahlen explizit vor Erzwingen von Auswahl `0`. Sie prüft fehlende PLC-Prozesse, reguläres `rtsversion` mit exakt `0`, fehlendes `S98_runtime` und keinen anderen aktivierten Boot-Eintrag zu einem bekannten PLC-/Runtime-Programm. Prüfungen wiederholen sich nach Persistenzflush und vor Runtime-Start.

Ausgangszuständigkeitsinspektion prüft CODESYS-Prozesse/Boot-Zustand und alle Container einschließlich gestoppter. Exakte Ausgangsdatei-, Elternverzeichnis- und kanonische Symlink-Alias-Mounts sowie andere privilegierte Container verursachen Konflikte. Nur der exakte Vorgänger `attraccess-wago` ist ausgeschlossen, da der gesperrte Installer seinen Ersatz kontrolliert. Vor Rechtegewährung muss dieser Vorgänger nachweislich gestoppt sein und Neustart deaktiviert haben.

Die Host-Prüfung lehnt Host-Konto-/Gruppennutzung von UID/GID 10001, fremde Prozesse mit dieser numerischen Identität, ungeprüfte User-Namespace-Zuordnungen und offene schreibbare DOUT-Deskriptoren einschließlich Pfadaliase zum selben Gerät/Inode ab. Ein eigener Runtime-Prozess ist erst nach vollständigen Docker-ID-, Namespace- und cgroup-Prüfungen ausgenommen. Unbekannte oder fehlgeschlagene Beobachtungen blockieren Start. Dies sind wiederholte Beobachtungen, kein Schutz vor jedem privilegierten Host-Schreiber, der mit einer Prüfung konkurriert; exklusive Zuständigkeit bleibt Betriebs- und physische Qualifikationsanforderung.

Konfigurationsverzeichnisse und Sperren müssen erwartetes root-Eigentum, restriktive Rechte und Dateitypen haben. Boot-Veröffentlichung verwendet eine eindeutige reguläre Staging-Datei im validierten Boot-Verzeichnis. Unsichere bestehende Pfade werden abgelehnt.

Docker-Befehle wählen den lokalen Unix-Endpunkt des Controllers und verwerfen geerbte Remote-Kontexteinstellungen. Sie zielen nie auf den Daemon des Entwicklerrechners.

## RUN-LED-Status :id=run-led-status

Die Runtime steuert die RUN-LED des CC100 (grüne und rote LED-Chips; gemeinsam leuchtend gelb):

| Muster                                  | Bedeutung                                                |
| --------------------------------------- | -------------------------------------------------------- |
| Dauerhaft gelb                          | Runtime-Prozess startet                                  |
| Gelb blinkend                           | Verbunden, wartet auf Übernahme (Pairing)                |
| Rot blinkend                            | MQTT-Broker nicht erreichbar                             |
| Grün/gelb abwechselnd                   | Übernommen, noch keine akzeptierte Konfiguration         |
| Überwiegend rot, kurze Lücke            | Hardware- oder Konfigurationsfehler; Bereitschaft prüfen |
| Grüner Heartbeat, regelmäßige Lichtshow | Bereit                                                   |
| Aus                                     | Runtime gestoppt (oder LED-Zugang unverfügbar)           |

WAGO `ledserverd` lässt RUN nach CODESYS-Deaktivierung auf `STATIC_OFF` und konkurriert deshalb nicht mit der Runtime. Die LED ist kosmetisch: fehlende Dateien oder Rechte deaktivieren nur sie, und sie ist kein Sicherheitsindikator.

## Berichte, Bereinigung und Sicherheit

Der Version-1-Bericht enthält exakt acht mit Zeilenumbruch abgeschlossene Felder:

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

Aktuelle Provisionierungszustände enthalten `prepare-controller` und `install-vendor-runtime`. Unterstützte Vorbereitung kann `codesys-active`, `codesys-boot-enabled` und `uid10001-access-denied` beheben; diese Beobachtungen sind keine bedingungslosen UI-Blocker. Nicht unterstützte Firmware/Komponenten, fehlende Register, unbekannte Zuständigkeit und unabhängige Ausgangsschreiber bleiben Blocker. Historische Berichte `qualification=required` und alte Provisionierungszustände bleiben lesbar. `software-supported` bedeutet, dass der Bericht einen Vorbereitungsweg über erwartete Vendor-Werkzeuge/Getter fand; es ist weder Byte-/Build-Bestätigung des gesamten FW31-Abhängigkeitssatzes noch physische Qualifikation. Ein bereits laufender Daemon ohne Vorbereitungsweg kann weiterhin wie oben `qualification=required` melden. Unvollständige oder unbekannte Berichtsfelder sind kein leerer Workload.

Der Plattformaktivierungsendpunkt behält den bestehenden Vertrag `reviewedDockerActivation: true` für explizit geprüfte destruktive Vorbereitung. Die geführte UI verwendet die einzelne Auslieferungsaktion. Serverseitige Zuständigkeitstokens und Vorbereitungszustände werden vor Remote-Mutation gespeichert; Zeitüberschreitungen bleiben unbestimmt bis explizitem Abgleich. Clients liefern keine Skripte, internen Tokens oder vertrauenswürdigen Inspektionsberichte.

**Fehlgeschlagene Installation bereinigen** verwendet den bestehenden Wiederherstellungsendpunkt mit frischen SSH-Zugangsdaten und expliziter Bereinigungsfreigabe. Es gleicht Runtime-Installation, Zugangsdaten und Vorbereitungsjournal ab. **Controller-Vorbereitung bereinigen** behandelt reine Vorbereitungsfehler; Runtime-Bereinigung hat Vorrang nach begonnenem Runtime-Installieren. Keine Aktion stellt vorherige PLC-Programme, Workloads, Daten oder Docker-Host-Einstellungen wieder her oder aktiviert CODESYS erneut. Fremde oder inkonsistente Integritätsdatensätze bleiben Fehler. Ein vor Upload gespeichertes Auslieferungstoken kann fehlendes Runtime-Journal über passende destruktive Vorbereitungszuständigkeit abgleichen. Vorbereitungsfehler vor Remote-Journal-Veröffentlichung haben einen expliziten Bereinigungsweg; dauerhafte tokengebundene Quittungen machen verlorene Antworten und Koordinator-Speicher-Retries wiederholbar. Fehlendes Journal behauptet keine Wiederherstellung vorheriger Workloads. Alte Journale behalten Integritätsprüfungen. Bei journalisierter Installation prüft Bereinigung vor Erfolg, dass Neustart deaktiviert und der eigene Container gestoppt oder abwesend ist. Runtime-Entfernung prüft danach ebenso Abwesenheit. Fehlender/unerreichbarer Daemon oder fehlgeschlagene Docker-Abfrage beweist keinen gestoppten Schreiber; Fehler und Wiederherstellungszuständigkeit bleiben erhalten.

Festgelegtes SSH, Runtime-Prüfsummen-/Manifest-Prüfungen, TLS und Registrierungswiderruf bleiben durchgesetzt. Verwaltungsschlüsselregistrierung und **Gespeicherten Zugang wiederherstellen** behalten ihren separaten Sicherheits-/Wiederherstellungsvertrag. Vollständige Verwaltungshärtung bleibt unsupported, wenn Vendor-Abhängigkeiten und aussperrsichere Wiederherstellungsvoraussetzungen fehlen; dieser Status macht unterstützte Docker-/I/O-Vorbereitung nicht unverfügbar.

Container-Start, Bereinigung oder allein `codesysState=disabled` sind kein Abschluss. Verlangen Sie frischen permanenten Heartbeat, Registrierungswiderruf, passende angewendete Konfiguration und aktuelle Runtime-`state.readiness`. Physische Qualifikation und verbleibende Verwaltungsbaseline müssen korrekt dargestellt werden.

## Quellnachweise und Entscheidungshistorie

WAGOs [Direkt-I/O-Leitfaden](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md) dokumentiert exakte Register, gepackten Dezimalzugriff und Zuordnung des niedrigstwertigen Bits. Das offizielle [CC100-Firmware-SDK](https://github.com/WAGO/cc100-firmware-sdk/tree/b2a09cc66ad07af54a34701d6cfc90f31aca5cd0) liefert Vendor-Docker-, Runtime- und Boot-Verträge der ursprünglichen Prüfung. Diese Revision ist FW30-V04.08.09, kein pauschaler FW31-Nachweis. Das spätere Audit exakter Quellen untersuchte separat gehashte erfasste FW31-Docker-, Runtime- und Boot-Dateien. Seine Befunde ersetzen Annahmen über Archiventpackung aus älteren SDK-Varianten; das aktuelle [Unterstützungsregister](devices/wago-fw31-support.md#exact-extension-source-and-captured-fw31-evidence) erfasst Erfassungsherkunft und unterscheidet sie von der inoffiziellen Erweiterung.

Vendor-Aktivierung kann Boot-Links, Routing, Firewall und Speicher ändern; Vendor-Deactivate-/Remove-Aktionen sind keine allgemeinen Umkehrungen. Die destruktive Produktentscheidung entfernt die Pflicht zur Wiederherstellung alter Workloads und Einstellungen. Sie entfernt keine Komponentenkompatibilitätsprüfungen, dauerhafte Vorgangszuständigkeit, Nachbedingungsprüfung, minimale I/O-Rechte oder physische Abnahme. Der [FW31-Unterstützungsdatensatz](devices/wago-fw31-support.md) erhält ursprüngliche Befunde und kennzeichnet ihre Ersetzung explizit.
