# Geführte Inbetriebnahme des WAGO CC100
<!-- llms-description: Anleitung zur Inbetriebnahme eines WAGO-CC100-Controllers in einer lokalen, vom Internet getrennten Installation, einschließlich MQTT-Claim und Wiederherstellung. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

> **In Arbeit.** Dies ist die Anleitung für Betreiber zur aktuellen Implementierung der geführten Inbetriebnahme. Sie ist kein Freigabeverfahren für die Hardware: [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) bleibt die Hardware-in-the-Loop-Freigabeschwelle. Halten Sie den Controller von Produktionsanlagen getrennt, bis dieser Nachweis vollständig vorliegt.

Verwenden Sie diese Anleitung, um einen WAGO CC100 `751-9301` in eine lokale, vom Internet getrennte Attraccess-Installation in Betrieb zu nehmen. Der lokale Attraccess-Server und der Controller müssen sich im selben privaten Netzwerk befinden.

## Sicherheitsgrenze

Die CC100-Laufzeit ist nicht sicherheitsbewertet. Sie ist kein Not-Halt, keine Personenschutzfunktion und kein Ersatz für zertifizierte Sicherheitsschaltkreise. Halten Sie Sicherheitsschaltkreise unabhängig vom Controller und prüfen Sie den physischen Aufbau gemäß ATT-984 vor der Freigabe.

## Was Attraccess tut und was nicht

Attraccess verwendet einen reinen SSH-Inbetriebnahmeablauf. Das WAGO Web-Based Management (WBM) ist **kein** Bestandteil der normalen Inbetriebnahme:

- Der Browser automatisiert, leitet oder umgeht weder das WBM noch dessen Zertifikatsbehandlung oder Zugangsdaten.
- Attraccess erkennt keine Controller in einem Subnetz. Die Eingabe einer privaten Controller-IP-Adresse ist nur ein Hinweis und kein Identitätsnachweis.
- Vergleichen Sie vor der Freigabe der Übertragung das physische Etikett und den Standort im Servicenetz des ausgewählten Controllers mit dem Ziel-Controller. Beschaffen Sie anschließend dessen SSH-Fingerabdruck aus einem vertrauenswürdigen Inventar oder von einem autorisierten Techniker über einen unabhängigen Kanal. Den gescannten Fingerabdruck zurück in das Formular zu kopieren ist keine unabhängige Identitätsauthentifizierung. Gehen Sie nicht davon aus, dass der CC100 seinen SSH-Fingerabdruck anzeigt.
- USB-C-Servicezugang und WBM sind ausschließlich Notfallwege (Break-Glass) zur Wiederherstellung. Verwenden Sie die firmwarespezifischen Wiederherstellungsanweisungen von WAGO vor Ort, wenn SSH nicht verfügbar ist; verwenden Sie das WBM nicht, um einen Fehler der Attraccess-Inbetriebnahme zu umgehen.

Der Server prüft den gepinnten Host-Schlüssel sowie die Prüfsumme und das Manifest des mitgelieferten Laufzeit-Releases, bereitet die unterstützte Plattform vor, überträgt das Release per SSH und startet die Registrierung. Die Vorbereitung verwendet die in der Firmware installierten Docker-Werkzeuge des Herstellers und richtet dauerhaften Zugriff nur auf die erforderlichen digitalen Register ein. Die erfasste FW31-Herstelleraktion `install` lädt keine Engine herunter und entpackt keine; fehlende Docker-Binärdateien bleiben nicht unterstützt. Der Controller benötigt für die Installation weder eine Image-Registry noch eine Internetverbindung.

**Destruktive Inbetriebnahme (2026-09-06):** Vorhandene Anwendungen und Workloads funktionieren möglicherweise nicht mehr oder werden gelöscht. Attraccess erhält vorhandene CODESYS-Anwendungen, remanente SPS-Daten (Retain-Daten), andere Workloads oder deren Host-Einstellungen nicht, erstellt keine Sicherungskopie davon und stellt sie nicht wieder her. CODESYS wird immer gestoppt und dauerhaft deaktiviert; dabei werden Prozess- und Boot-Zustand geprüft, bevor E/A freigegeben wird. Lässt sich dies nicht verifizieren, schlägt die Installation vor der Registrierung bzw. dem Start der Laufzeit fehl. Die [frühere Entscheidung zur Erhaltung](plugins/wago/fw31-support.md) bleibt als überholte Historie erhalten.

## Voraussetzungen

- Bestätigen Sie, dass die Bestellnummer des Controllers `751-9301` lautet und er sich in einem privaten IPv4-Netzwerk befindet: `10.0.0.0/8`, `172.16.0.0/12` oder `192.168.0.0/16`.
- Bestätigen Sie die unterstützte Firmware-Basis unter **WAGO-Steuerungen**. Die aktuelle Standardbasis ist die WAGO-CC100-Firmware `31`; die BSP-Version `2024.12.0` allein identifiziert diese Firmware nicht. Siehe [Unterstützungsgrenzen für FW31](plugins/wago/fw31-support.md) zu Quellkompatibilität und Qualifizierungsgrenzen.
- Wählen Sie den lokalen MQTT-Server, den der Controller verwenden soll. Die Inbetriebnahme folgt dem konfigurierten Transport dieses Servers, entweder einfaches MQTT oder TLS mit den konfigurierten Zertifikatsoptionen. Importieren Sie für eine private CA das PEM-Bundle der ausstellenden CA in den MQTT-Einstellungen.
- Der geführte Ablauf setzt die werkseitige SSH-Anmeldung (`root` / `wago`) voraus. Wurde diese Anmeldung geändert, wählen Sie für Installation, Prüfung oder Wiederherstellung **Andere SSH-Anmeldung verwenden**. Nicht-Root-Identitäten benötigen `sudo`-Zugriff. Eigene Passwörter werden nicht mit der Inbetriebnahmesitzung gespeichert.
- Die Laufzeit wird aus demselben Quellcode gebaut und automatisch mit jedem Produktions-Server-Image ausgeliefert. Der Dialog zeigt das mitgelieferte Release; eigene Laufzeit-Uploads werden nicht unterstützt. Führen Sie für die lokale Entwicklung zuerst `pnpm nx run plugin-wago:install-runtime-dev` aus und starten Sie eine laufende API anschließend mit `pnpm serve` neu. Dieses explizite Target baut die Laufzeit und kopiert sie in den lokalen Serverspeicher. Das Starten des Entwicklungsservers baut sie nicht.

Der Release-Packager akzeptiert über `--image-archive` ein unkomprimiertes Docker-Archiv und speichert gzip-Daten im Member `image.tar` des äußeren Tar-Archivs. Er erzeugt das äußere Tar-Archiv und die passende SHA-256-Prüfsumme nach der Kompression. Übergeben Sie kein bereits komprimiertes Archiv. Vergleichen Sie die **endgültige Größe des äußeren Tar-Archivs** mit der aktuellen Speicherprüfung des Controllers; die Größe des Datenstroms allein genügt nicht. Jeder Übertragungsversuch löst das aktuelle Release auf, auch Wiederholungen von Sitzungen, die vor einem Release-Wechsel erstellt wurden.

- Stellen Sie sicher, dass der Controller den ausgewählten lokalen MQTT-Broker erreichen kann. Es ist kein externer Registry-, DNS- oder Internetzugang erforderlich oder wird verwendet.

## Controller in Betrieb nehmen

1. Öffnen Sie **WAGO-Steuerungen**, wählen Sie **Steuerung in Betrieb nehmen**, geben Sie einen **Name der Steuerung** ein und wählen Sie **Weiter**.
2. Geben Sie die **IP-Adresse der Steuerung** ein. Ein einzelner MQTT-Server wird automatisch ausgewählt; wählen Sie nur dann einen Server, wenn mehrere verfügbar sind. Die mitgelieferte Laufzeit wird automatisch geprüft. Wählen Sie **Weiter**, sobald sie verfügbar ist.
3. Ist der Schlüssel des Controllers noch nicht vertrauenswürdig, vergleichen Sie ihn unter **Mit vertrauenswürdigem SSH-Fingerabdruck prüfen** mit einem vertrauenswürdigen Eintrag. Alternativ verbinden Sie ausschließlich diesen Controller mit einem isolierten Servicenetz, prüfen sein physisches CC100-Etikett und wählen **Diese Steuerung verwenden**. Dadurch wird der erste Schlüssel gepinnt; dies darf nicht in einem gemeinsam genutzten LAN erfolgen.
4. Attraccess erstellt keine Sicherungskopie vorhandener Anwendungen und stellt sie nicht wieder her. Speichern Sie alles, was Sie noch brauchen, selbst, bringen Sie angeschlossene Anlagen in einen sicheren Zustand und wählen Sie **Laufzeitumgebung installieren**. Diese Aktion autorisiert diesen Installationsversuch einschließlich der Deaktivierung von CODESYS. Ein zusätzliches Bestätigungskästchen ist nicht erforderlich. Es wird die werkseitige SSH-Anmeldung verwendet, sofern Sie nicht **Andere SSH-Anmeldung verwenden** wählen. Eigene Passwörter werden nach dem Absenden oder Schließen gelöscht.
5. Verfolgen Sie den Installationsfortschritt oder kehren Sie später über die Gerätetabelle zurück. **Technische Details und Aktivität** enthält optionale Prüfungen und gespeicherte Diagnosen. Sobald der Controller registriert ist, wählen Sie **Ein- und Ausgänge konfigurieren**, um die Frontplatte **Ein- & Ausgänge** des Controllers zu öffnen. Sie zeigt die CC100-Klemmen und Modbus-Geräte mit ihren Live-Zuständen; dort benennen und konfigurieren Sie sie und wählen dann **Auf Controller anwenden**.

Bevor die Vorbereitung den Controller verändert, prüft Attraccess die verwalteten SSH-Voraussetzungen. Der CC100 FW31 stellt `passwd`, `useradd`, `groupadd` und `sudo` bereit; `chpasswd`, `getent` oder `visudo` sind nicht erforderlich. Die Bereitstellung verwendet lokale Kontodateien und prüft die eingeschränkte sudo-Richtlinie, bevor der Root-Zugang rotiert wird. Eine fehlgeschlagene Einrichtung hält eine feste Phase und eine Lösung fest, ohne rohe SSH-Ausgaben oder Zugangsdaten zu speichern.

Der gespeicherte Fortschritt beschreibt Identität, Paket- und Controller-Vorabprüfung, Übertragung, Registrierung, Konfiguration und Laufzeitinstallation. Ein Neustart von Attraccess wiederholt SSH nie automatisch.

Während der Übertragung prüft Attraccess den gepinnten SSH-Schlüssel erneut mit strikter Host-Schlüssel-Prüfung und verifiziert die Prüfsumme des Laufzeit-Bundles auf dem lokalen Server. Installationsjournale schützen die Integrität von Vorgängen und die Bereinigung; sie sind kein Sicherungsdienst für vorhandene Workloads. Eine neue Registrierung erhält frischen Laufzeitspeicher, statt stillschweigend widerrufene Zugangsdaten wiederzuverwenden. Umgebungsdateien werden mit dem Modus `0600` bereitgestellt; das Vertrauen in eine private CA verwendet einen separaten schreibgeschützten Bind-Mount aus einem geschützten Host-Verzeichnis.

Die Deaktivierung von CODESYS ist so konfiguriert, dass sie einen Neustart überdauert. Die Host-Überwachung prüft vor jedem Start der Laufzeit, einschließlich begrenzter Absturzwiederholungen, erneut die Deaktivierung, den exklusiven Besitz und den eng begrenzten Registerzugriff. Der automatische Docker-Neustart ist deaktiviert. Fehlgeschlagene Prüfungen stoppen den Schreiber, behalten die Aktivierung bei und wiederholen nach verifizierter Eindämmung und einer Wartezeit von 30 Sekunden. Der letzte Fehler bleibt in `/etc/attraccess-wago/supervisor.last-error` erhalten. Ältere Hooks haben den Start der Laufzeit dauerhaft gesperrt; solche Installationen benötigen weiterhin eine [ausdrückliche Wiederherstellung](#wiederherstellung-nach-dauerhaft-gesperrter-eindämmung). Die Software-Verifizierung ersetzt weder den physischen Neustart noch die E/A-Abnahme.

## MQTT-Claim und Zustand „Ready“

Nach der Übertragung der Laufzeit meldet sich der Controller mit einem eingeschränkten Registrierungs-Zugangsdatum über den ausgewählten lokalen MQTT-Broker. Attraccess sendet dauerhafte, controllerbezogene Zugangsdaten. Die Veröffentlichung dieses Claims ist kein Nachweis, dass sich die Laufzeit wieder verbunden hat oder dass das Registrierungs-Zugangsdatum widerrufen wurde.

Die Sitzung bleibt im Zustand **Einrichtung wird geprüft**. Die Oberfläche prüft getrennt einen frischen dauerhaften Heartbeat, den Widerruf der Registrierung, die angewendete gewünschte bzw. gemeldete Konfiguration und eine frische, passende Laufzeit-Prüfung `state.readiness`. Eine veraltete oder nicht passende Prüfung gilt nicht als bereit. Der Verwaltungsstatus wird aus der gespeicherten Sicherheitstransaktion gelesen. Die physische Qualifizierung bleibt erforderlich; weder eine erfolgreiche Installation noch eine Schlüsselregistrierung oder ein MQTT-Claim ist ein Nachweis für die Hardware-Abnahme.

Halten Sie die Uhren von Controller und Anwendung per NTP synchron. Eingehende Telemetrie,
Flow-Lesezugriffe und -Wartevorgänge, die Bereitschaft der Laufzeit und die Heartbeat-basierte
Rotation von Zugangsdaten erlauben bis zu fünf Sekunden positive Zeitabweichung der Controller-Uhr,
entsprechend der Uhrentoleranz der Inbetriebnahme. Quell-Zeitstempel bleiben erhalten; die Grenzen
für veraltete Daten sowie die Prüfungen von Sequenz, Wiedergabe und stillgelegten Datenströmen
bleiben unverändert. Zeitstempel jenseits dieser Toleranz werden abgelehnt, bevor der akzeptierte
Datenstrom aktualisiert wird. Ein mit dem Broker verbundener Controller kann daher weiterhin als
veraltet erscheinen, wenn seine Uhr erheblich falsch geht.

### Verwaltungssicherheit

Das Panel **Sicherheit des Verwaltungszugriffs** bietet Prüfung, Überprüfung, Anwendung und Wiederherstellung. Die Prüfung meldet Firmware, SSH-Implementierung und mögliche Verwaltungs-Listener, ohne den Zugang zu verändern. Der eingebaute Anbieter unterstützt die umkehrbare, additive Schlüsselregistrierung für ein vorhandenes Nicht-Root-OpenSSH-Konto oder ein erkanntes laufendes Dropbear-2025.88-Konto. Er erzeugt einen eindeutigen Schlüssel mit deaktivierter Weiterleitung und deaktiviertem PTY, verschlüsselt dessen privates Material in Attraccess, aktiviert den Rollback und verifiziert eine separate Verbindung mit gepinntem, ausschließlich schlüsselbasiertem Zugang. Privates Schlüsselmaterial wird über einen dedizierten kurzlebigen Agenten übergeben und nicht in eine temporäre Schlüsseldatei geschrieben. Vorhandene Kontorechte und andere Anmeldemethoden bleiben aktiviert.

Das Hinzufügen eines Schlüssels lässt vorhandene Passwörter bzw. den Standardzugang unverändert und zählt **nicht** als Härtung. Verbleibende WBM-/Service-Exposition und unqualifizierte Rechte sind ausdrücklich benannte Restrisiken. Eine vollständige Baseline kann erst angewendet werden, wenn ihre Firmware-31-Befehle, minimalen Rechte und die neustartsichere Wiederherstellung qualifiziert sind. Das Framework ordnet die Schlüsselverifizierung vor der Einschränkung ein und stellt den verifizierten Schlüssel für Prüfungen nach der Einschränkung bereit; es erfindet niemals Herstellerbefehle. Es wird keine verpflichtende WBM-Einrichtungsschranke eingeführt.

### Einschränkung der Konfigurationsbereitschaft

Die vollständige No-Code-Konfigurationsstrecke wird von ATT-1058 verantwortet und muss im integrierten Build verifiziert werden. Die folgenden Endpunkte sind **ausschließlich Referenzen für die Entwicklerintegration** und erfordern `resources.update`; ihre Verwendung erfüllt ATT-984 nicht:

1. Speichern Sie die vollständige gewünschte Konfiguration mit `POST /api/wago/controllers/:id/configuration/draft` und `{ "snapshot": { ... } }`. Ein über die Oberfläche gespeicherter Entwurf ist ebenfalls gültige Eingabe für die folgenden Schritte.
2. Validieren Sie ihn mit `POST /api/wago/controllers/:id/configuration/validate`. Stoppen Sie und korrigieren Sie jeden zurückgegebenen Validierungsfehler.
3. Prüfen Sie die resultierenden Änderungen mit `POST /api/wago/controllers/:id/configuration/review`. Bestätigen Sie, dass das zurückgegebene `diff` beabsichtigt ist, und behalten Sie den zurückgegebenen `reviewedHash` des Entwurfs.
4. Veröffentlichen Sie den geprüften Entwurf mit `POST /api/wago/controllers/:id/configuration/publish`. Notieren Sie die zurückgegebenen Werte `revision` und `contentHash`; Attraccess veröffentlicht diese gewünschte Konfiguration an den Controller.
5. Fragen Sie `GET /api/wago/controllers/:id/configuration/revisions` ab, bis die notierte Revision `state: "applied"`, ein nicht leeres `reportedAt` und denselben `contentHash` wie beim Veröffentlichen hat. Lautet ihr Zustand `rejected`, stoppen Sie, korrigieren Sie die vollständige gewünschte Konfiguration und wiederholen Sie den Ablauf mit einer neuen Revision.

Bestätigen Sie außerdem einen aktuellen Heartbeat und die erwartete Laufzeitversion. Ein Bericht über eine angewendete Konfiguration belegt die Annahme dieser Revision, nicht die physische Hardware-Bereitschaft oder eine Rückmeldung der Ausgänge. Betreiben Sie Anlagen nicht allein aufgrund einer API-Antwort. Prüfen Sie die integrierten Diagnose- und Konfigurationsansichten im exakt getesteten Build und dokumentieren Sie physische bzw. nichttechnische Nachweise mit [WAGO-Abnahmenachweis](plugins/wago/acceptance-evidence.md).

## Wiederherstellung

| Situation                                                        | Maßnahme des Betreibers                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IP wird abgelehnt                                                | Verwenden Sie eine gültige private IPv4-Adresse und bestätigen Sie, dass sie zum physisch ausgewählten CC100 gehört.                                                                                                                                                                                       |
| SSH-Schlüssel lässt sich nicht scannen oder stimmt nicht überein | Stoppen Sie. Prüfen Sie Etikett, Adresse und vertrauenswürdigen Fingerabdruck des Controllers erneut. Ein geänderter Schlüssel darf nicht blind akzeptiert werden. Verwenden Sie die lokale USB-C-/WBM-Wiederherstellung nur, um den unterstützten SSH-Zugang des Controllers wiederherzustellen.          |
| SSH-Authentifizierung oder `sudo` schlägt fehl                   | Wurde die werkseitige Anmeldung geändert, wählen Sie **Andere SSH-Anmeldung verwenden**. Prüfen Sie Rechte und Erreichbarkeit, bevor Sie es erneut versuchen.                                                                                                                                              |
| Modell oder Firmware wird nicht unterstützt                      | Fahren Sie nicht fort. Stellen Sie die unterstützte Firmware über den vom Kunden betriebenen WAGO-Wiederherstellungsprozess wieder her und starten Sie dann eine neue Sitzung.                                                                                                                             |
| Docker-Aktivierung schlägt fehl                                  | Sammeln Sie den Sitzungsfehler und die Controller-Protokolle. Reparieren Sie Docker mit dem von WAGO unterstützten lokalen Verfahren; installieren Sie keine alternative Container-Engine.                                                                                                                 |
| Prüfsumme oder Manifest des Bundles schlägt fehl                 | Stoppen Sie. Ersetzen Sie das lokale Artefakt durch das erwartete Release. Umgehen Sie die Validierung nicht und kopieren Sie kein Image aus einer Registry.                                                                                                                                               |
| Übertragung schlägt fehl                                         | Öffnen Sie **Einrichtung ansehen**, notieren Sie den angezeigten Fehlergrund, stellen Sie Erreichbarkeit oder Voraussetzungen wieder her und wählen Sie dann **Installation erneut versuchen**. Erfordert der Widerruf von Zugangsdaten Aufmerksamkeit, beheben Sie diesen Zustand vor einer Wiederholung. |
| Controller verbindet sich nicht oder registriert sich nicht      | Prüfen Sie die lokale MQTT-Erreichbarkeit und die Broker-Auswahl und untersuchen Sie dann die Laufzeitprotokolle des Controllers über den gesicherten SSH-Weg. Das Registrierungs-Zugangsdatum läuft nach 15 Minuten ab; brechen Sie die Sitzung ab und erstellen Sie eine neue, wenn es abgelaufen ist.   |
| Erstkonfiguration wird abgelehnt                                 | Korrigieren Sie die vollständige gewünschte Konfiguration, validieren und prüfen Sie sie und veröffentlichen Sie dann über die Konfigurations-API eine neue Revision. Bearbeiten Sie die Zustandsdatei des Controllers nicht von Hand.                                                                     |

Wählen Sie **Registrierung abbrechen** nur, um die Sitzung zu verwerfen. Dies widerruft das Registrierungs-Zugangsdatum und löscht die Attraccess-Inbetriebnahmesitzung. Das Entfernen eines Controllers aus Attraccess widerruft ebenfalls dessen MQTT-Zugang, deinstalliert die Laufzeit jedoch nicht vom CC100.

**Fehlgeschlagene Installation bereinigen** autorisiert einen Wiederherstellungsversuch ohne zusätzliches Bestätigungskästchen. Attraccess verwendet sein verschlüsseltes Wiederherstellungs-Zugangsdatum erst, nachdem es gegen den gepinnten Controller verifiziert wurde; andernfalls verwendet es die angegebene SSH-Anmeldung. Wählen Sie eine andere Anmeldung nur bei Bedarf. Eine beibehaltene Laufzeit- oder Vorbereitungstransaktion muss bereinigt werden, bevor die Installation wiederholt wird. Die Bereinigung unterbricht die Attraccess-Laufzeit und gleicht Installation, Vorbereitungsjournal und Zugangsdaten ab. Sie kann den brokerseitigen Widerruf von Zugangsdaten nicht rückgängig machen, vorhandene Anwendungen/Daten oder Host-Einstellungen nicht wiederherstellen und CODESYS nicht wieder aktivieren. Eine unvollständige oder unterbrochene Bereinigung behält ihren Integritätsdatensatz für einen weiteren ausdrücklichen Versuch. Die Bereinigung ist keine Voraussetzung dafür, die ursprüngliche Zustimmung zur destruktiven Installation zu erteilen, und kein Versprechen, Workloads wiederherzustellen.

Die Bereinigung bleibt fehlgeschlagen, wenn Attraccess nicht verifizieren kann, dass die eigene Laufzeit gestoppt oder entfernt wurde. Ein nicht erreichbarer Docker-Daemon beweist nicht, dass der Container gestoppt wurde. Stellen Sie die Beobachtbarkeit des unterstützten lokalen Dienstes wieder her und wiederholen Sie die ausdrückliche Bereinigung; behalten Sie den Fehlerdatensatz, bis die Verifizierung gelingt.

### Wiederherstellung nach dauerhaft gesperrter Eindämmung

Aktuelle Hooks behalten die Aktivierung der Laufzeit nach fehlgeschlagenen Prüfungen bei
und wiederholen nach verifizierter Eindämmung über die Hardware-Schranke. Prüfen Sie
`supervisor.last-error` auf die letzte fehlgeschlagene Beobachtung. Ältere Hooks entfernten die
Aktivierung und sperrten den Start dauerhaft; ein Upgrade des Hooks stellt diese
fehlende Absicht nicht wieder her. Ein Offline-Heartbeat allein unterscheidet diese Zustände nicht.
Die folgende Wiederherstellungsroute gilt für jene älteren dauerhaft gesperrten oder ausdrücklich fehlgeschlagenen Installationen.

Verwenden Sie nach Behebung der Ursache die vorhandenen Assistenten-Steuerelemente für eine
aktuelle geführte Installation mit beibehaltenem Wiederherstellungsbesitz:

1. Wählen Sie beim Controller **Einrichtung ansehen** und dann **Fehlgeschlagene Installation bereinigen**
   mit frischen Zugangsdaten in **SSH-Benutzername zur Wiederherstellung** und **SSH-Passwort zur Wiederherstellung** und ausdrücklicher Freigabe der Bereinigung. Warten Sie auf
   **Laufzeitinstallation bereinigt** und den Abschluss der Bereinigung von Zugangsdaten und Vorbereitung.
   **Wiederherstellung erfordert Aufmerksamkeit** bedeutet, dass die Bereinigung noch geklärt werden muss.
2. Ist die Sitzung nicht registriert und bietet **Installation erneut versuchen** an, geben Sie frische
   temporäre SSH-Zugangsdaten ein, genehmigen Sie die destruktiven Folgen und versuchen Sie es erneut.
3. Wurde der Controller registriert, folgen Sie der Anweisung im Fortschritt, **Steuerung
   entfernen** zu wählen, wählen Sie dann **Steuerung in Betrieb nehmen** und schließen Sie eine neue Sitzung ab.
   Das Entfernen der Registrierung entfernt auch ihre Konfiguration; konfigurieren und verifizieren Sie die
   neue Installation vor der Verwendung.

Die Installation stellt die Aktivierung nur über den verifizierten Ablauf aus Vorbereitung und Übertragung
wieder her. Diese Route benötigt weder eine Shell noch ein Steuerelement zum erneuten Aktivieren. Die Bereinigung kann ohne
gültigen beibehaltenen Besitz und beobachtbares Stoppen/Entfernen des Containers nicht gelingen; ist das Bereinigungs-Steuerelement
nicht verfügbar oder bleibt die Wiederherstellung unverifiziert, halten Sie die Installation
blockiert und wenden Sie sich an den Support, statt die Sperre zu umgehen. Ein erfolgreicher Hook-Abschluss
ist kein Nachweis für eine laufende Laufzeit; frische Bereitschaft und physische Qualifizierung
bleiben getrennte Anforderungen.

Wird Attraccess während der Veröffentlichung des Claims neu gestartet, belegt ein gespeicherter Controller-Datensatz mit `claimed` allein nicht, dass dauerhafte Zugangsdaten zugestellt wurden. **Claim-Wiederherstellung erforderlich** blockiert die automatische Neuinstallation und bewahrt den Verifizierer bis zur ausdrücklichen Wiederherstellung. Entfernen Sie nach der Wiederherstellung einer registrierten oder bei der Registrierung unterbrochenen Installation die vorhandene Controller-Registrierung und erstellen Sie eine neue Inbetriebnahmesitzung; die Oberfläche bietet keine unbrauchbare Wiederholung mit gelöschtem Verifizierer an.

**Steuerungsvorbereitung bereinigen** behandelt Fehler, die nur die Vorbereitung betreffen, mit frischen Zugangsdaten und ausdrücklicher Freigabe. Hat die Laufzeitinstallation begonnen, verwenden Sie zuerst **Fehlgeschlagene Installation bereinigen**. Die Bereinigung macht Änderungen an Docker-Netzwerk/-Speicher des Herstellers nicht rückgängig und stellt frühere Workloads nicht wieder her. Historische Journale erfordern weiterhin gültige Besitz- und Integritätsprüfungen; fehlende oder inkonsistente Datensätze beweisen nicht, dass die Bereinigung erfolgreich war. **Gespeicherten Zugriff wiederherstellen** bleibt die getrennte Aktion zur Wiederherstellung des Verwaltungsschlüssels. Das Entfernen der Registrierung wird mit diesen Vorgängen serialisiert und behält ungelöste Datensätze. Das bloße Prüfen der Verwaltung macht einen Abbruch nie rollback-pflichtig.

Eine unterbrochene Installation wird nach einem Neustart als fehlgeschlagene Übertragung angezeigt. Verwenden Sie die vorhandene Bereinigungsaktion, falls ein Installations- oder Vorbereitungsjournal verbleibt, und versuchen Sie es dann erneut. Es gibt keine separate Koordinator-Wiederherstellungsaktion.

Die Bereinigung wartet bis zu 310 Sekunden, bis der laufende Laufzeit-Monitor seine
Sicherheitsprüfung abgeschlossen und die Transaktionssperre des Controllers freigegeben hat. Eine
funktionierende SSH-Anmeldung bedeutet nicht, dass diese Sperre verfügbar ist. Lassen Sie den Bereinigungsdialog geöffnet,
während er wartet; löschen Sie niemals `install.lock`, um einen aktiven Vorgang zu umgehen. Zeitüberschreitung der Sperre,
SSH-Authentifizierung, beibehaltener Besitz und Fehler der Laufzeitbereinigung haben getrennte
Diagnosen. Die Bereinigung verifiziert zuerst die verschlüsselte Root-Wiederherstellungsanmeldung und
verwendet die angegebene werkseitige oder eigene Anmeldung, falls die Passwortrotation nie abgeschlossen wurde.

## Aktuelle Einschränkungen des Releases

### Integrationsvertrag

- Installations- und Wiederherstellungs-Endpunkte erfordern ausschließlich für diese ausdrückliche Anfrage `{ confirmInstall: true, temporarySsh: { username, password } }`. Der Wiederherstellungs-Endpunkt ist `POST /api/wago/commissioning/sessions/:id/recover`.
- `GET /api/wago/commissioning/sessions/:id/verification` liefert nicht geheime Felder `controllerId`, `permanentConnection`, `enrollmentRevoked`, `configurationApplied`, `managementHardening`, `hardwareReadiness`, `softwareReady`, `physicalQualification` und `ready`. Die angewendete Konfiguration allein ist keine Hardware-Bereitschaft. `ready` bleibt false, solange eine physische Qualifizierung erforderlich ist.
- Die Laufzeit verwendet pro Registrierung ein frisches `/var/lib/attraccess-wago`. Das Vertrauen in die private CA verwendet `NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem` mit einem zusätzlichen schreibgeschützten Bind-Mount; Laufzeitcode darf dieses Vertrauen weder ersetzen noch umgehen. Bereinigungsjournale versprechen keine Erhaltung früherer Workloads.
- ATT-1056 muss qualifizierte Gerätefreigaben/-Mounts und Laufzeit-Gesundheitsnachweise liefern, bevor die Inbetriebnahme physische Bereitschaft ausweisen kann. Das Installationsprogramm erfindet keine GPIO-Zuordnungen und fügt keinen privilegierten Hardwarezugriff hinzu.
- Prozessinterne Vorgänge werden pro Controller sequenziert, und ein controllerseitiges `flock` umfasst Übertragung, Bereitstellung und Ersetzung. Installationsjournale behalten unterbrochene Arbeit für die ausdrückliche Bereinigung.
- Binden Sie die gemeinsame `context.audit`-Brücke von ATT-983 / PR #1802 ein; dieser Code liefert keine zweite Audit-Senke. Der automatische Claim übernimmt den gespeicherten authentifizierten Initiator. Behalten Sie beim HTTP-Unclaim dessen einzigen Audit-Wrapper in `removeControllerSafely(id, assertOwned => audit.run(..., () => wago.remove(id, assertOwned)))` bei. Die Verfügbarkeit der Audit-Quittung ist unabhängig vom Erfolg des Vorgangs; es wird kein dauerhafter Speicher erfunden, wenn der Host „nicht verfügbar“ meldet.

Aktuelles Softwareverhalten und verbleibende Release-Grenzen:

- Die additive, verifizierte Schlüsselregistrierung für ein vorhandenes Nicht-Root-OpenSSH- oder ein erkanntes Dropbear-2025.88-Konto ist implementiert. Die SSH-Passwortrotation bzw. das Entfernen der Standard-Zugangsdaten ist noch nicht implementiert; ändern Sie den werkseitigen Zugang separat, bevor Sie über ein isoliertes Servicenetz hinaus produktiv gehen. Firmwarespezifische Kontoerstellung und Root-Login-Einschränkungen erfordern ebenfalls eine Qualifizierung.
- Der komprimierende Packager und der serverseitige Laufzeitkatalog verifizieren vor der Übertragung Bundle-Prüfsumme, Build-Deskriptor, Manifest und Hardwareprofil. Die Inbetriebnahme-API akzeptiert weder eigene Laufzeit-Uploads noch ältere, per Umgebungsvariable konfigurierte Bundles.
- Erhaltung und Wiederherstellung vorhandener CODESYS-Anwendungen/Workloads liegen außerhalb des Produktumfangs. Eindeutiger SSH-Verwaltungszugang mit minimalen Rechten und die verbleibende Baseline der Verwaltungsdienste erfordern weiterhin Implementierung und Firmware-31-Qualifizierung; ihr Status darf nicht als pauschales Docker-/E/A-Hindernis dargestellt werden.
- Ein Containerstart ist kein Erfolgsnachweis. Erforderlich sind ein frischer dauerhafter Heartbeat sowie passende Prüfungen von Laufzeitbereitschaft und Konfiguration, danach die physische Qualifizierung.
- Der aktuelle Laufzeit-Betrieb unterliegt weiterhin dem Image-Digest, dem Modell der minimalen Rechte und den Hardware-Verifizierungsnachweisen, die unter [WAGO-CC100-Docker-Laufzeit](plugins/wago/cc100-runtime.md) dokumentiert sind.

Verwenden Sie diese Lücken nicht als Grund, Prüfungen von Host-Schlüssel, Bundle-Prüfsumme/Manifest oder MQTT-Identität/Zugangsdaten zu umgehen. Eskalieren Sie sie über den Release-Prozess und hängen Sie Hardware-Nachweise an [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) an.
