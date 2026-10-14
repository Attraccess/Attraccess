# Geführte WAGO-CC100-Inbetriebnahme

> **In Arbeit.** Dies ist der Betreiberleitfaden der aktuellen geführten Inbetriebnahme. Er ist kein Hardware-Freigabeverfahren: [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) bleibt die Hardware-in-the-Loop-Freigabeschranke. Halten Sie den Controller von Produktionsanlagen getrennt, bis dieser Nachweis vollständig ist.

Verwenden Sie diesen Leitfaden, um einen WAGO CC100 `751-9301` in einer lokalen, vom Internet getrennten Attraccess-Installation in Betrieb zu nehmen. Lokaler Attraccess-Server und Controller müssen im selben privaten Netzwerk liegen.

## Sicherheitsgrenze

Die CC100-Runtime ist nicht sicherheitszertifiziert. Sie ist weder Not-Aus noch Personenschutzfunktion oder Ersatz zertifizierter Sicherheitsschaltungen. Halten Sie Sicherheitsschaltungen vom Controller unabhängig und prüfen Sie die physische Baugruppe unter ATT-984 vor Freigabe.

## Was Attraccess übernimmt und was nicht

Attraccess verwendet einen reinen SSH-Inbetriebnahmeablauf. WAGO Web-Based Management (WBM) gehört **nicht** zur normalen Inbetriebnahme:

- Der Browser automatisiert, proxyt oder umgeht weder WBM noch dessen Zertifikatsbehandlung oder Zugangsdaten.
- Attraccess erkennt keine Controller im Subnetz. Die Eingabe einer privaten Controller-IP-Adresse ist nur ein Hinweis, kein Identitätsnachweis.
- Vergleichen Sie vor Auslieferungsfreigabe physisches Label und Service-Netzwerkstandort des gewählten Controllers mit dem Ziel und beziehen Sie seinen SSH-Fingerabdruck aus vertrauenswürdigem Inventar oder von einem autorisierten Techniker über einen unabhängigen Kanal. Zurückkopieren des gescannten Fingerabdrucks ins Formular ist keine unabhängige Identitätsauthentifizierung. Nehmen Sie nicht an, dass der CC100 seinen SSH-Fingerabdruck anzeigt.
- USB-C-Servicezugang und WBM sind ausschließlich Notfall-Wiederherstellungswege. Verwenden Sie WAGOs firmwarespezifische Wiederherstellungsanweisungen lokal bei unverfügbarem SSH; verwenden Sie WBM nicht zum Umgehen eines Attraccess-Inbetriebnahmefehlers.

Der Server prüft den festgelegten Host-Key sowie Prüfsumme und Manifest der gebündelten Runtime-Version, bereitet die unterstützte Plattform vor, überträgt die Version über SSH und startet Registrierung. Vorbereitung verwendet firmwareinstallierte Vendor-Docker-Werkzeuge und schafft dauerhaften Zugang nur zu erforderlichen Digitalregistern. Die erfasste FW31-Vendor-Aktion `install` lädt oder entpackt keine Engine; fehlende Docker-Binaries bleiben unsupported. Der Controller benötigt für Installation nie Image-Registry oder Internetverbindung.

**Destruktive Inbetriebnahme (2026-09-06):** bestehende Anwendungen und Workloads können ausfallen oder gelöscht werden. Attraccess erhält, sichert und restauriert keine vorherigen CODESYS-Anwendungen, gespeicherten PLC-Daten, anderen Workloads oder Host-Einstellungen. Es stoppt und deaktiviert CODESYS immer dauerhaft und prüft Prozess- und Boot-Zustand vor I/O-Zugang. Ist dies nicht prüfbar, scheitert Installation vor Registrierung/Runtime-Start. Die [frühere Erhaltungsentscheidung](devices/wago-fw31-support.md) bleibt ersetzte Historie.

## Voraussetzungen

- Bestätigen Sie Controller-Bestellnummer `751-9301` und privates IPv4-Netzwerk: `10.0.0.0/8`, `172.16.0.0/12` oder `192.168.0.0/16`.
- Prüfen Sie die unterstützte Firmware-Basis unter **WAGO-Controller**. Aktueller Standard ist WAGO-CC100-Firmware `31`; BSP-Version `2024.12.0` allein identifiziert sie nicht. Siehe [FW31-Unterstützungsgrenzen](devices/wago-fw31-support.md) für Quellkompatibilität und Qualifikationslimits.
- Wählen Sie den lokalen MQTT-Server des Controllers. Inbetriebnahme folgt dessen konfiguriertem Transport, einschließlich unverschlüsseltem MQTT oder TLS mit konfigurierten Zertifikatsoptionen. Importieren Sie bei privater CA das ausstellende CA-PEM-Bundle in MQTT-Einstellungen.
- Der geführte Ablauf nimmt den werkseitigen SSH-Login (`root` / `wago`) an. Bei geändertem Login wählen Sie **Anderen SSH-Login verwenden** für Installation, Inspektion oder Wiederherstellung. Nicht-root-Identitäten benötigen `sudo`. Eigene Passwörter werden nicht mit der Inbetriebnahmesitzung gespeichert.
- Die Runtime wird aus denselben Quellen gebaut und automatisch mit jedem Produktionsserver-Image gebündelt. Der Dialog zeigt die gebündelte Version; eigene Runtime-Uploads werden nicht unterstützt. Führen Sie lokal zuerst `pnpm nx run plugin-wago:install-runtime-dev` aus und starten Sie dann eine laufende API mit `pnpm serve` neu. Dieses explizite Ziel baut die Runtime und kopiert sie in lokalen Serverspeicher. Entwicklungsserverstart baut sie nicht.

Die Release-Paketierung akzeptiert ein unkomprimiertes Docker-Archiv über `--image-archive` und speichert gzip-Daten im Element `image.tar` des äußeren Tar. Sie erstellt äußeres Tar und passende SHA-256 nach Kompression. Übergeben Sie kein bereits komprimiertes Archiv. Vergleichen Sie die **finale äußere Tar-Größe** mit dem aktuellen Speicher-Preflight des Controllers; Stream-Größe allein genügt nicht. Jeder Auslieferungsversuch löst die aktuelle Version auf, auch Retries von Sitzungen vor einem Versionswechsel.

- Stellen Sie Erreichbarkeit des gewählten lokalen MQTT-Brokers sicher. Externe Registry, DNS oder Internetzugang werden weder benötigt noch verwendet.

## Controller in Betrieb nehmen

1. Öffnen Sie **WAGO-Controller**, wählen Sie **Controller in Betrieb nehmen**, geben Sie einen **Controller-Namen** ein und wählen Sie **Weiter**.
2. Geben Sie die **Controller-IP-Adresse** ein. Ein einzelner MQTT-Server wird automatisch gewählt; wählen Sie nur bei mehreren Servern. Die gebündelte Runtime wird automatisch geprüft. Wählen Sie bei Verfügbarkeit **Weiter**.
3. Bei noch nicht vertrauenswürdigem Controller-Schlüssel vergleichen Sie ihn mit einem vertrauenswürdigen Datensatz unter **Mit vertrauenswürdigem SSH-Fingerabdruck prüfen**. Alternativ verbinden Sie nur diesen Controller mit isoliertem Service-Netzwerk, prüfen sein physisches CC100-Label und wählen **Diesen Controller verwenden**. Dies legt den ersten Schlüssel fest und darf nicht auf geteiltem LAN verwendet werden.
4. Machen Sie angeschlossene Anlagen sicher, sichern Sie bestehende Anwendungen und wählen Sie **Runtime installieren**. Diese Aktion autorisiert den Installationsversuch einschließlich CODESYS-Deaktivierung. Keine zusätzliche Freigabecheckbox ist nötig. Werkseitiges SSH wird verwendet, sofern Sie nicht **Anderen SSH-Login verwenden** wählen. Eigene Passwörter werden nach Absenden oder Schließen gelöscht.
5. Verfolgen Sie Installationsfortschritt oder kehren Sie später über die Gerätetabelle zurück. **Technische Details und Aktivität** enthält optionale Inspektion und gespeicherte Diagnose. Wählen Sie nach Übernahme **Ein- und Ausgänge konfigurieren**, um den Konfigurationseditor zu öffnen.

Bevor Vorbereitung den Controller ändert, prüft Attraccess Voraussetzungen für verwaltetes SSH. CC100 FW31 liefert `passwd`, `useradd`, `groupadd` und `sudo`; `chpasswd`, `getent` oder `visudo` sind nicht erforderlich. Provisionierung verwendet lokale Kontodateien und prüft begrenzte sudo-Richtlinie vor root-Zugangsrotation. Fehlgeschlagene Einrichtung erfasst feste Phase und Lösung ohne rohe SSH-Ausgaben oder Zugangsdaten zu erhalten.

Gespeicherter Fortschritt beschreibt Identität, Paket- und Controller-Preflight, Übertragung, Registrierung, Konfiguration und Runtime-Installation. Attraccess-Neustart wiederholt SSH niemals automatisch.

Während Auslieferung prüft Attraccess den festgelegten SSH-Schlüssel erneut mit strikter Host-Key-Prüfung und verifiziert die Runtime-Bundle-Prüfsumme auf dem lokalen Server. Installationsjournale schützen Vorgangsintegrität und Bereinigung; sie sind kein Backupdienst für vorherige Workloads. Neue Registrierung erhält frischen Runtime-Speicher statt stiller Wiederverwendung widerrufener Zugangsdaten. Umgebungsdateien werden mit Modus `0600` vorbereitet; privates CA-Vertrauen verwendet separaten lesenden Bind-Mount aus geschütztem Host-Verzeichnis.

CODESYS-Deaktivierung wird dauerhaft über Neustarts eingerichtet. Host-Überwachung prüft Deaktivierung, exklusive Zuständigkeit und engen Registerzugang vor jedem Runtime-Start, einschließlich begrenzter Crash-Retries. Automatischer Docker-Neustart ist deaktiviert. Fehlgeschlagene Prüfungen stoppen den Schreiber, erhalten Aktivierung und wiederholen nach verifizierter Eindämmung und 30 Sekunden Abkühlzeit. Letzter Fehler bleibt in `/etc/attraccess-wago/supervisor.last-error`. Ältere Hooks verriegelten die Runtime als deaktiviert; diese Installationen benötigen weiterhin [explizite Wiederherstellung](#recover-after-latched-containment). Softwareprüfung ersetzt keine physische Neustart- und I/O-Abnahme.

## MQTT-Übernahme und Bereitschaft

Nach Runtime-Auslieferung verwendet der Controller eingeschränkte Registrierungszugangsdaten zur Ankündigung über den gewählten lokalen MQTT-Broker. Attraccess sendet permanente controllerbezogene Zugangsdaten. Veröffentlichung dieser Übernahme beweist weder Runtime-Wiederverbindung noch Widerruf der Registrierungszugangsdaten.

Die Sitzung bleibt **Prüfung erforderlich**. Die UI prüft separat frischen permanenten Heartbeat, Registrierungswiderruf, angewendete Soll-/Ist-Konfiguration und frische passende Runtime-Probe `state.readiness`. Veraltete oder abweichende Probe ist nicht bereit. Verwaltungsstatus stammt aus der gespeicherten Sicherheitstransaktion. Physische Qualifikation bleibt nötig; erfolgreiche Installation, Schlüsselregistrierung oder MQTT-Übernahme ist kein Hardware-Abnahmenachweis.

Synchronisieren Sie Controller- und Anwendungsuhren mit NTP. Eingehende Telemetrie, Flow-Lesen/Warten, Runtime-Bereitschaft und heartbeatbasierte Zugangsdatenrotation erlauben bis zu fünf Sekunden positiven Controller-Zeitversatz, passend zur Uhrtoleranz der Inbetriebnahme. Quellzeitstempel bleiben erhalten; Alterslimits und Sequenz-, Replay- und ausgemusterte Stream-Prüfungen bleiben unverändert. Zeitstempel jenseits der Toleranz werden vor Aktualisierung des akzeptierten Streams abgelehnt. Ein brokerverbundener Controller kann deshalb bei deutlich falscher Uhr weiterhin veraltet erscheinen.

### Verwaltungssicherheit

Der Bereich **Verwaltungssicherheit** bietet Inspektion, Review, Anwendung und Wiederherstellung. Inspektion meldet Firmware, SSH-Implementierung und mögliche Verwaltungslistener ohne Zugangsänderung. Der integrierte Provider unterstützt reversible additive Schlüsselregistrierung für ein bestehendes nicht-root-OpenSSH-Konto oder erkanntes laufendes Dropbear-2025.88-Konto. Er erstellt einen eindeutigen Schlüssel mit deaktivierter Weiterleitung und PTY, verschlüsselt privates Material in Attraccess, aktiviert Rollback und prüft separate festgelegte reine Schlüsselverbindung. Privates Schlüsselmaterial wird durch einen eigenen kurzlebigen Agenten statt temporärer Schlüsseldatei übergeben. Bestehende Kontorechte und andere Loginmethoden bleiben aktiv.

Schlüsselergänzung lässt bestehende Passwörter/Standardzugang unverändert und gilt **nicht** als gehärtet. Verbleibende WBM-/Service-Exposition und unqualifizierte Rechte sind explizite Restpunkte. Eine vollständige Baseline kann erst nach Qualifikation ihrer Firmware-31-Befehle, minimalen Rechte und reboot-sicheren Wiederherstellung angewendet werden. Das Framework ordnet Schlüsselprüfung vor Beschränkung und liefert den geprüften Schlüssel für Nachprüfungen; es erfindet nie Vendor-Befehle. Keine verpflichtende WBM-Einrichtungsschranke wird eingeführt.

### Einschränkung der Konfigurationsbereitschaft

Die vollständige Konfigurationsreise ohne Code gehört ATT-1058 und muss im integrierten Build geprüft werden. Die folgenden Endpunkte sind **nur Entwickler-Integrationsreferenzen**, verlangen `resources.update` und erfüllen ATT-984 nicht:

1. Vollständige Soll-Konfiguration an `POST /api/wago/controllers/:id/configuration/draft` mit `{ "snapshot": { ... } }` speichern. Ein durch die UI gespeicherter Entwurf ist ebenfalls gültige Eingabe für folgende Schritte.
2. Mit `POST /api/wago/controllers/:id/configuration/validate` prüfen. Stoppen und jeden zurückgegebenen Validierungsfehler beheben.
3. Resultierende Änderungen mit `POST /api/wago/controllers/:id/configuration/review` prüfen. Bestätigen, dass zurückgegebener `diff` beabsichtigt ist, und Entwurfs-`reviewedHash` erhalten.
4. Geprüften Entwurf mit `POST /api/wago/controllers/:id/configuration/publish` veröffentlichen. Zurückgegebene `revision` und `contentHash` erfassen; Attraccess veröffentlicht diese Soll-Konfiguration an den Controller.
5. `GET /api/wago/controllers/:id/configuration/revisions` abfragen, bis die erfasste Revision `state: "applied"`, nicht leeres `reportedAt` und denselben `contentHash` wie bei Veröffentlichung hat. Bei `rejected` stoppen, vollständige Soll-Konfiguration korrigieren und mit neuer Revision wiederholen.

Bestätigen Sie außerdem aktuellen Heartbeat und erwartete Runtime-Version. Eine angewendete Konfigurationsmeldung beweist Revisionsannahme, keine physische Hardwarebereitschaft oder Ausgangsrückmeldung. Betreiben Sie Anlagen nicht allein aufgrund einer API-Antwort. Prüfen Sie integrierte Diagnose- und Konfigurationsseiten im exakt getesteten Build und erfassen Sie physische/nichttechnische Nachweise mit [WAGO-Abnahmenachweisen](devices/wago-acceptance-evidence.md).

## Wiederherstellung

| Situation                                   | Betreiberaktion                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IP abgelehnt                                | Gültige private IPv4-Adresse verwenden und Zugehörigkeit zum physisch gewählten CC100 bestätigen.                                                                                                                                    |
| SSH-Schlüssel nicht scanbar oder abweichend | Stoppen. Controller-Label, Adresse und vertrauenswürdigen Fingerabdruck erneut prüfen. Geänderten Schlüssel nicht blind annehmen. Lokale USB-C-/WBM-Wiederherstellung nur zur Wiederherstellung unterstützten SSH-Zugangs verwenden. |
| SSH-Authentifizierung oder `sudo` scheitert | Bei geändertem Werklogin **Erweitert: andere SSH-Zugangsdaten verwenden** wählen. Rechte und Erreichbarkeit vor Retry prüfen.                                                                                                        |
| Modell oder Firmware unsupported            | Nicht fortsetzen. Unterstützte Firmware durch kundenseitigen WAGO-Wiederherstellungsprozess restaurieren, dann neue Sitzung starten.                                                                                                 |
| Docker-Aktivierung scheitert                | Sitzungsfehler und Controller-Logs erfassen. Docker über WAGO-unterstütztes lokales Verfahren reparieren; keine alternative Container-Engine installieren.                                                                           |
| Bundle-Prüfsumme oder Manifest scheitert    | Stoppen. Lokales Artefakt durch erwartete Version ersetzen. Validierung nicht umgehen und kein Registry-Image kopieren.                                                                                                              |
| Auslieferung scheitert                      | **Fortschritt anzeigen** öffnen, angezeigten Fehlergrund erfassen, Erreichbarkeit/Voraussetzungen herstellen, dann **Installation wiederholen** wählen. Bei nötigem Zugangsdatenwiderruf erst diesen Zustand beheben.                |
| Controller verbindet oder übernimmt nicht   | Lokale MQTT-Erreichbarkeit und Brokerauswahl prüfen, dann Runtime-Logs über gesicherten SSH-Weg inspizieren. Registrierungszugangsdaten laufen nach 15 Minuten ab; bei Ablauf Sitzung abbrechen und neue erstellen.                  |
| Initiale Konfiguration abgelehnt            | Vollständige Soll-Konfiguration korrigieren, dann neue Revision über Konfigurations-API validieren, prüfen und veröffentlichen. Controller-Zustandsdatei nicht von Hand bearbeiten.                                                  |

Wählen Sie **Registrierung abbrechen** nur zum Aufgeben der Sitzung. Es widerruft Registrierungszugangsdaten und löscht die Attraccess-Inbetriebnahmesitzung. Entfernen eines Controllers aus Attraccess widerruft ebenfalls seinen MQTT-Zugang, deinstalliert aber die Runtime auf dem CC100 nicht.

**Fehlgeschlagene Installation bereinigen** autorisiert einen Wiederherstellungsversuch ohne zusätzliche Checkbox. Attraccess verwendet verschlüsselte Wiederherstellungszugangsdaten erst nach Prüfung gegen den festgelegten Controller; sonst den angegebenen SSH-Login. Wählen Sie nur bei Bedarf anderen Login. Erhaltene Runtime- oder Vorbereitungstransaktion muss vor erneutem Installieren bereinigt werden. Es unterbricht Attraccess-Runtime und gleicht Installation, Vorbereitungsjournal und Zugangsdaten ab. Es kann weder brokerseitigen Zugangsdatenwiderruf rückgängig machen, vorherige Anwendungen/Daten oder Host-Einstellungen restaurieren noch CODESYS reaktivieren. Unvollständige oder unterbrochene Bereinigung erhält Integritätsdatensatz für weiteren expliziten Versuch. Bereinigung ist weder Voraussetzung initialer destruktiver Installationszustimmung noch Zusage der Workload-Wiederherstellung.

Bereinigung bleibt fehlgeschlagen, wenn Attraccess nicht prüfen kann, dass die eigene Runtime gestoppt oder entfernt wurde. Unerreichbarer Docker-Daemon beweist keinen gestoppten Container. Stellen Sie Beobachtbarkeit des unterstützten lokalen Diensts her und wiederholen Sie explizite Bereinigung; erhalten Sie Fehlerdatensatz bis erfolgreicher Prüfung.

### Wiederherstellung nach verriegelter Eindämmung :id=recover-after-latched-containment

Aktuelle Hooks erhalten Runtime-Aktivierung nach fehlgeschlagenen Prüfungen und wiederholen durch die Hardwareprüfung nach verifizierter Eindämmung. Prüfen Sie `supervisor.last-error` für die letzte fehlgeschlagene Beobachtung. Ältere Hooks entfernten Aktivierung und verriegelten Start als deaktiviert; Hook-Upgrade erstellt diese fehlende Absicht nicht neu. Offline-Heartbeat allein unterscheidet diese Zustände nicht. Der folgende Wiederherstellungsweg gilt für diese älteren verriegelten oder explizit fehlgeschlagenen Installationen.

Verwenden Sie nach Ursachenbehebung die bestehenden Assistentenaktionen einer aktuellen geführten Installation mit erhaltener Wiederherstellungszuständigkeit:

1. **Fortschritt anzeigen** des Controllers öffnen und **Fehlgeschlagene Installation bereinigen** mit frischen **Wiederherstellungs-SSH**-Zugangsdaten und expliziter Bereinigungsfreigabe wählen. Auf **Runtime-Installation bereinigt** und Abschluss der Zugangsdaten-/Vorbereitungsbereinigung warten. **Wiederherstellung benötigt Aufmerksamkeit** bedeutet weiterhin offenen Bereinigungsbedarf.
2. Bei unübernommener Sitzung mit **Installation wiederholen** frische temporäre SSH-Zugangsdaten eingeben, destruktive Folgen genehmigen und wiederholen.
3. Bei übernommenem Controller Fortschrittsanweisung **Controller entfernen** folgen, dann **Controller in Betrieb nehmen** wählen und neue Sitzung abschließen. Registrierungsentfernung entfernt auch Konfiguration; neue Installation vor Verwendung konfigurieren und prüfen.

Installation erstellt Aktivierung nur durch geprüften Vorbereitungs-/Auslieferungsablauf neu. Dieser Weg braucht weder Shell noch Reaktivierungsaktion. Bereinigung kann ohne gültige erhaltene Zuständigkeit und beobachtbaren Container-Stopp/Entfernung nicht gelingen; halten Sie Installation blockiert und holen Sie Support statt die Verriegelung zu umgehen, wenn Aktion unverfügbar oder Wiederherstellung ungeprüft bleibt. Erfolgreicher Hook-Exit beweist keine laufende Runtime; frische Bereitschaft und physische Qualifikation bleiben separate Anforderungen.

Wenn Attraccess während Übernahmeveröffentlichung neu startet, beweist ein gespeicherter Controller-Datensatz `claimed` allein keine ausgelieferten permanenten Zugangsdaten. **Übernahmewiederherstellung erforderlich** blockiert automatische Neuinstallation und erhält den Verifier bis expliziter Wiederherstellung. Entfernen Sie nach Wiederherstellung übernommener oder unterbrochen übernommener Installation ihre bestehende Registrierung und erstellen Sie neue Inbetriebnahmesitzung; die UI bietet keinen unbrauchbaren Retry mit gelöschtem Verifier.

**Controller-Vorbereitung bereinigen** behandelt reine Vorbereitungsfehler mit frischen Zugangsdaten und expliziter Freigabe. Verwenden Sie nach begonnener Runtime-Installation zuerst **Fehlgeschlagene Installation bereinigen**. Bereinigung nimmt Vendor-Docker-Netzwerk-/Speicheränderungen nicht zurück und restauriert vorherige Workloads nicht. Historische Journale verlangen weiterhin gültige Zuständigkeit und Integritätsprüfungen; fehlende oder widersprüchliche Datensätze beweisen keine erfolgreiche Bereinigung. **Gespeicherten Zugang wiederherstellen** bleibt separate Verwaltungsschlüssel-Wiederherstellung. Registrierungsentfernung wird mit diesen Vorgängen serialisiert und erhält ungeklärte Datensätze. Bloße Verwaltungsinspektion macht Rollback nie zur Abbruchvoraussetzung.

Unterbrochene Installation wird nach Neustart als fehlgeschlagene Auslieferung gezeigt. Verwenden Sie bestehende Bereinigung bei erhaltenem Installations- oder Vorbereitungsjournal und wiederholen Sie dann. Es gibt keine separate Koordinator-Wiederherstellungsaktion.

Bereinigung wartet bis zu 310 Sekunden, bis der laufende Runtime-Monitor seine Sicherheitsprüfung beendet und Controller-Transaktionssperre freigibt. Funktionierender SSH-Login bedeutet nicht verfügbare Sperre. Lassen Sie den Bereinigungsdialog beim Warten offen; löschen Sie niemals `install.lock`, um aktiven Vorgang zu umgehen. Sperrtimeout, SSH-Authentifizierung, erhaltene Zuständigkeit und Runtime-Bereinigungsfehler haben getrennte Diagnosen. Bereinigung prüft zuerst verschlüsselten root-Wiederherstellungslogin und verwendet angegebenen Werk- oder eigenen Login, falls Passwortrotation nie abgeschlossen wurde.

## Aktuelle Release-Einschränkungen

### Integrationsvertrag

- Installations- und Wiederherstellungsendpunkte verlangen `{ confirmInstall: true, temporarySsh: { username, password } }` nur für die explizite Anfrage. Wiederherstellungsendpunkt ist `POST /api/wago/commissioning/sessions/:id/recover`.
- `GET /api/wago/commissioning/sessions/:id/verification` liefert nicht geheime Felder `controllerId`, `permanentConnection`, `enrollmentRevoked`, `configurationApplied`, `managementHardening`, `hardwareReadiness`, `softwareReady`, `physicalQualification` und `ready`. Konfigurationsanwendung allein ist keine Hardwarebereitschaft. `ready` bleibt false, solange physische Qualifikation erforderlich ist.
- Runtime verwendet frisches `/var/lib/attraccess-wago` je Registrierung. Privates CA-Vertrauen verwendet `NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem` mit zusätzlichem lesendem Bind-Mount; Runtime-Code darf dieses Vertrauen weder ersetzen noch umgehen. Bereinigungsjournale versprechen keinen Erhalt vorheriger Workloads.
- ATT-1056 muss qualifizierte Geräterecht-/Mount- und Runtime-Gesundheitsnachweise liefern, bevor Inbetriebnahme physische Bereitschaft melden kann. Der Installer erfindet keine GPIO-Zuordnungen und ergänzt keinen privilegierten Hardwarezugang.
- Prozesslokale Vorgänge sind je Controller geordnet; controllerseitiges `flock` deckt Übertragung, Staging und Ersetzung ab. Installationsjournale erhalten unterbrochene Arbeit zur expliziten Bereinigung.
- ATT-983 / PR #1802s gemeinsame Brücke `context.audit` integrieren; dieser Code liefert keine zweite Auditsenke. Automatische Übernahme führt gespeicherten authentifizierten Initiator mit. Bei HTTP-Freigabe den einzelnen Audit-Wrapper innerhalb `removeControllerSafely(id, assertOwned => audit.run(..., () => wago.remove(id, assertOwned)))` erhalten. Auditquittungsverfügbarkeit ist unabhängig vom Vorgangserfolg; bei Host-unavailable wird keine dauerhafte Speicherung erfunden.

Aktuelles Softwareverhalten und verbleibende Freigabegrenzen:

- Additive verifizierte Schlüsselregistrierung für bestehendes nicht-root-OpenSSH- oder erkanntes Dropbear-2025.88-Konto ist implementiert. SSH-Passwortrotation/Entfernung von Standardzugangsdaten ist noch nicht implementiert; ändern Sie Werkzugang separat vor Bereitstellung außerhalb isolierter Servicenetze. Firmwarespezifische Kontoerstellung und root-Login-Beschränkungen benötigen ebenfalls Qualifikation.
- Komprimierte Paketierung und servereigener Runtime-Katalog prüfen Bundle-Prüfsumme, Build-Beschreibung, Manifest und Hardwareprofil vor Auslieferung. Inbetriebnahme-API akzeptiert keine eigenen Runtime-Uploads oder alte umgebungsbasierte Bundles.
- Erhalt und Wiederherstellung vorheriger CODESYS-/Workloads liegen außerhalb Produktumfang. Eindeutiger minimal privilegierter SSH-Verwaltungszugang und verbleibende Verwaltungsdienstbaseline benötigen weiterhin Implementierung und Firmware-31-Qualifikation; ihr Status darf nicht als pauschaler Docker-/I/O-Blocker erscheinen.
- Container-Start ist kein Erfolgsnachweis. Frischer permanenter Heartbeat und passende Runtime-Bereitschafts-/Konfigurationsproben sind nötig, gefolgt von physischer Qualifikation.
- Aktuelle Runtime-Bereitstellung unterliegt weiterhin Image-Digest, minimalem Privilegienmodell und Hardwareprüfnachweisen aus [WAGO CC100 Docker-Runtime](devices/wago-cc100-runtime.md).

Verwenden Sie diese Lücken nicht zum Umgehen von Host-Key-, Bundle-Prüfsummen-/Manifest- oder MQTT-Identitäts-/Zugangsdatenprüfungen. Eskalieren Sie sie im Freigabeprozess und fügen Sie Hardware-Nachweise [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) bei.
