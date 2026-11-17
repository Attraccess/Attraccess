# Bedrohungsmodell und Pen-Test-Briefing der WAGO-Integration
<!-- llms-description: Bedrohungsmodell und Pen-Test-Briefing für die WAGO-CC100-Integration mit Akteuren, Vertrauensgrenzen und Angriffsflächen. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Diese Seite ist das Bedrohungsmodell zur Produktionsabsicherung der WAGO-CC100-Integration (ATT-988). Sie listet auf,
was die Integration schützt, wo sich das Vertrauen ändert, was schiefgehen kann, welcher Code es heute verhindert und
welche Lücken bleiben. Sie ist eine Eingabe für einen Penetrationstest und eine externe Prüfung der funktionalen
Sicherheit (Safety-Review). **Keines von beidem wurde durchgeführt.** Das Bestehen dieses Modells ist weder eine
Security- noch eine Safety-Zertifizierung, und der physische Einsatz bleibt bis ATT-984 unqualifiziert.

Jede Lücke trägt genau eine Markierung:

- **hier behoben**: durch den ATT-988-Änderungssatz geschlossen, der diese Seite eingeführt hat.
- **für ATT-1057 gemeldet**: an [ATT-1057](https://linear.app/attraccess/issue/ATT-1057) gemeldet (Grundabsicherung des Controllers, TLS/Vertrauen, sichere Inbetriebnahme, Wiederherstellung). Hier nicht behoben.
- **akzeptiertes Risiko**: bekannt, keine Änderung geplant, mit Begründung.

Codeverweise nennen eine Datei und ein Symbol, damit sie Zeilenverschiebungen überstehen. Pfade sind relativ zu
`apps/plugins/wago/`, sofern sie nicht mit `apps/` beginnen.

## Akteure und Vertrauensgrenzen

| Grenze                          | Vertrauenswürdige Seite                                                | Weniger vertrauenswürdige Seite                    |
| ------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| B1 Browser zur API              | Attraccess-Sitzung mit Plugin-Berechtigungen                           | Jeder Netzwerk-Client                              |
| B2 API zum Broker               | Attraccess-Host und der darin konfigurierte MQTT-Servereintrag         | Der Broker und alles, was darauf veröffentlichen kann |
| B3 Broker zum Controller        | Broker-Konto pro Controller mit einer Topic-Richtlinie                 | Die Controller-Laufzeit und alles in deren LAN     |
| B4 Host zum Plugin              | Plugin-Code innerhalb seiner deklarierten Berechtigungen               | Andere Plugins                                     |
| B5 API zum Controller über SSH  | Vom Betreiber bereitgestellter SSH-Schlüssel, nur für verwaltete Updates verwendet | Das Host-Betriebssystem des Controllers |

Nachrichten vom Controller (B3) sind **nicht vertrauenswürdige Eingaben**, auch nach der Authentifizierung: Ein
Zugangsdaten-Leck oder ein Laufzeitfehler darf die Serverressourcen nicht erschöpfen können.

## 1. Registrierung

**Schutzgüter:** die Identität des Controllers (`hardwareId`), der Kopplungscode und der Fingerabdruck, das
einmalige Registrierungsgeheimnis, die Broker-Zugangsdaten pro Controller, die beim Beanspruchen übergeben werden.

**Vertrauensgrenzen:** B2, B3. Die Erkennungs-Zugangsdaten werden mit einem noch nicht beanspruchten Controller
geteilt und dürfen nur dessen eigene Ankündigung und Beanspruchungsbestätigung veröffentlichen sowie dessen eigenes
Beanspruchungs-Topic abonnieren.

**Bedrohungen:** Ein unerwünschtes Gerät kündigt die `hardwareId` eines Opfers an; ein Angreifer spielt einen
Kopplungscode erneut ein oder errät ihn; eine Beanspruchung wird abgefangen und wiederverwendet; eine alte
Beanspruchung überschreibt rotierte Zugangsdaten; eine überdimensionierte Ankündigung erschöpft die Serverressourcen.

**Aktuelle Schutzmaßnahmen**

- Der Betreiber muss einen Verifizierer vorlegen, der zum gespeicherten Hash des Kopplungscodes oder zum Fingerabdruck passt und in konstanter Zeit verglichen wird (`backend/controllers/service.ts` `matchesVerifier`, `backend/controllers/model.ts` `safeEqual`).
- Registrierungsgeheimnisse werden als Hashes gespeichert, an Server und `hardwareId` gebunden, laufen ab und sind nur einmal verwendbar (`backend/controllers/service.ts` `validEnrollment`, `isActiveEnrollment`).
- Das Erkennungskonto ist auf die eigenen Erkennungs-Topics des Controllers beschränkt (`backend/controllers/enrollment.ts` `topicPolicy`).
- Die Beanspruchung trägt ein Bestätigungs-Token, das der Server in konstanter Zeit vergleicht (`backend/controllers/model.ts` `isClaimAcknowledgement`); manuelle Beanspruchungen können innerhalb von 60 Sekunden ablaufen (`claim-expiry-v1`, `cc100-runtime/src/runtime/identity/discovery.ts`).
- Eine beanspruchte Registrierung hat eine `credentialEpoch`; eine Beanspruchung ohne oder mit abweichender Epoche kann rotierte Zugangsdaten nicht überschreiben (`cc100-runtime/src/runtime/identity/discovery.ts` `receiveDiscoveryClaim`).
- Ankündigungen und Beanspruchungsbestätigungen werden vor dem Parsen auf Größe und Tiefe geprüft (`backend/protocol/index.ts` `parseControllerJson`).

**Lücken**

| Lücke                                                                                                                                                                                      | Markierung                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Ankündigungen wurden in beliebiger Größe geparst.                                                                                                                                          | hier behoben                         |
| Das Beanspruchungs-Topic auf dem Controller akzeptierte vor dem Dekodieren unbegrenzte Payloads.                                                                                           | hier behoben (Verwerfen ab 64 KiB, gezählt) |
| Erkennung und Beanspruchung laufen über den Transport, den der in Attraccess konfigurierte MQTT-Servereintrag verwendet; ohne TLS läuft das Beanspruchungs-Passwort unverschlüsselt durch das LAN. | für ATT-1057 gemeldet                |
| Kopplungscodes sind kurz; es gibt keine serverseitige Sperre nach Fehlversuchen.                                                                                                           | für ATT-1057 gemeldet                |

## 2. MQTT-Autorisierung

**Schutzgüter:** Befehlsgewalt über physische Ausgänge, Integrität der Telemetrie, Verfügbarkeit des Brokers.

**Vertrauensgrenzen:** B2, B3.

**Bedrohungen:** Ein Controller-Konto veröffentlicht oder abonniert außerhalb seines Namensraums; ein Controller gibt
sich als ein anderer aus; ein geleaktes Controller-Zugangsdatum wird verwendet, um diesen Controller zu steuern oder
seine Konfiguration zu ersetzen; ein geleaktes Zugangsdatum funktioniert nach der Rotation weiter; ein Client
überflutet den Broker, das Wildcard-Abonnement des Servers oder die eigenen Abonnements eines Controllers.

**Aktuelle Schutzmaßnahmen**

- Jeder Controller erhält ein eigenes Konto. Es darf nur seine eigenen Topics für gewünschte Konfiguration, Befehle und Rotation der Zugangsdaten abonnieren und nur unter seinem eigenen `<namespace>/v1/controllers/<hardwareId>/#` veröffentlichen (`backend/controllers/enrollment.ts` `topicPolicy` bei der Beanspruchung; dieselbe Richtlinie bei der Rotation in `backend/credentials/service.ts` und bei Netzwerkänderungen in `backend/network/service.ts`). Das Konto eines Controllers kann auf den Topics eines anderen Controllers weder veröffentlichen noch abonnieren.
- Die Veröffentlichungsberechtigung ist eine mehrstufige Wildcard. Der RabbitMQ-Provider macht aus `#` ein Muster, das jede tiefere Ebene abdeckt (`apps/plugins/rabbitmq/backend/credentials/provider.ts` `mqttFilterToRegex`). Sie deckt daher auch die **eigenen** Topics `commands`, `configuration/desired` und `credentials/rotate` des Controllers ab, nicht nur seine Meldungen. Siehe die erste Lücke unten.
- Der Server prüft vor der Verwendung den ursprünglichen Server und das genaue Topic jeder Nachricht (`backend/controllers/subscriptions.ts`, `backend/credentials/service.ts`).
- Die Rotation der Zugangsdaten ändert das Broker-Passwort, speichert eine verschlüsselte Wiederherstellungskopie und schließt erst ab, wenn sich der Controller damit wieder verbindet ([Rotation der Zugangsdaten](plugins/wago/credential-rotation.md)).
- Die Broker-ACL wird vom Broker durchgesetzt, nicht von diesem Plugin.

**Lücken**

| Lücke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Markierung                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Das eigene Konto eines Controllers darf auf seinen eigenen Topics für Befehle, gewünschte Konfiguration und Rotation der Zugangsdaten veröffentlichen, weil seine Veröffentlichungsberechtigung `<namespace>/v1/controllers/<hardwareId>/#` lautet. Wer dieses eine Zugangsdatum besitzt, kann Befehle an diesen Controller senden, eine retained gewünschte Konfiguration mit einem selbst berechneten Hash veröffentlichen (der Hash belegt die Integrität, nicht die Herkunft) und das Befehls-Abonnement des Controllers überfluten, sodass echte Serverbefehle, einschließlich Ausgang-aus, als Überlast verworfen werden. Die Auswirkung ist auf diesen Controller begrenzt. Die Berechtigung auf die Meldungs-Topics einzuengen gehört zur Arbeit an der Basis-ACL. | für ATT-1057 gemeldet                                                                                                                                             |
| Die MQTT-Schicht des Hosts hat keine Obergrenze für die Nachrichtengröße; eine einzige überdimensionierte Veröffentlichung wird an jeden Abonnenten zugestellt. Nur durch das empfohlene Broker-Limit (2 MiB, siehe [Produktivbetrieb und Kompatibilität](plugins/wago/production-support.md)) abgemildert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | akzeptiertes Risiko (eine hostweite Obergrenze ist ein festgehaltenes Nicht-Ziel)                                                                                 |
| Das Plugin kann nicht prüfen, ob der Broker die angeforderte Topic-Richtlinie tatsächlich durchsetzt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | akzeptiertes Risiko (der Betreiber prüft das mit den Laborübungen)                                                                                                |
| Transportsicherheit und Verifizierung der Broker-Identität.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | für ATT-1057 gemeldet                                                                                                                                             |
| Controller-Nachrichten sind nicht signiert; jeder mit dem eigenen Zugangsdatum des Controllers kann als dieser sprechen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | akzeptiertes Risiko (begrenzt durch die ACL pro Controller und die Rotation; was dieses Zugangsdatum mit seinem eigenen Controller tun kann, ist die erste Lücke) |

## 3. Protokoll-Parsing

**Schutzgüter:** Serverspeicher und Event-Loop-Zeit, der Diagnosespeicher, die Integrität des gespeicherten
Controller-Zustands.

**Vertrauensgrenzen:** B3 in den Server (Heartbeats, Zustand, Messwerte, Fehler, Bestätigungen, Konfigurationsmeldungen,
Beanspruchungs- und Rotationsbestätigungen) und B2 in den Controller (Befehle, gewünschte Konfiguration,
Beanspruchungen, Rotationsnachrichten).

**Bedrohungen:** überdimensioniertes oder tief verschachteltes JSON; eine Flut kleiner Nachrichten; fehlerhafte
Umschläge; Sequenztricks, um Zustand zu verbergen oder erneut einzuspielen; Fehlertext, der Geheimnisse oder
Log-Injection enthält.

**Aktuelle Schutzmaßnahmen**

- Jede Controller-Payload, die der Server liest, wird durch eine einzige Funktion dekodiert (`backend/protocol/index.ts` `parseControllerJson`). Sie weist eine Payload über 64 KiB vor `toString` ab, sodass eine überdimensionierte Nachricht nie dekodiert wird. Danach weist sie eine Verschachtelung tiefer als 8 Ebenen ab, indem sie den dekodierten Text vor `JSON.parse` durchsucht. Die Einstiegspunkte sind Ankündigung, Heartbeat, Betriebsnachrichten, Diagnose, Befehlsbestätigungen, Beanspruchungsbestätigungen, Rotationsbestätigungen, Konfigurationsmeldungen und die Bereitschaftsprüfung der Inbetriebnahme. Bestätigungen von Netzwerkänderungen behalten ihre strengere 1-KiB-Prüfung (`backend/network/service.ts` `evidence`).
- Zeitstempel, Sequenzen und Stream-Kennungen werden validiert, und Streams werden verfolgt, damit Wiedereinspielungen und Proben in falscher Reihenfolge nicht als aktuell angezeigt werden (`backend/protocol/index.ts` `parseOperationalMessage`, `backend/diagnostics/store.ts`).
- Der Diagnosespeicher ist in Controllern, Kanälen und Ereignissen begrenzt (`backend/diagnostics/store.ts`).
- Auf dem Controller hat jedes Abonnement eine Byte-Obergrenze, die vor dem Dekodieren geprüft wird, und höchstens 100 wartende Nachrichten. Nachrichten werden pro Abonnement bis zu 100 gleichzeitig verarbeitet. Gewünschte Konfigurationen werden nur innerhalb der Sperre für Konfigurationsaktualisierungen dekodiert, sodass höchstens eine dekodierte Konfiguration gehalten wird; die übrigen warten als rohe Payloads (im ungünstigsten Fall bis zu etwa 200 MiB, was Veröffentlichungsrechte auf dem Desired-Topic erfordert). Verworfene Nachrichten werden nach Grund gezählt (`oversized`, `overload`) und nie beantwortet (`cc100-runtime/src/transport/admission.ts` `SubscriptionAdmission`, `cc100-runtime/src/transport/mqtt.ts`).
- Controller-Meldungen sind begrenzt: Ablehnungsmeldungen auf 50 Fehler und 64 KiB, Bereitschaftsfehler auf 8 KiB, Fehlertext auf 1 KiB (`cc100-runtime/src/runtime/bounded.ts`).

**Lücken**

| Lücke                                                                                                                                                                                                                                                                                                                                                                  | Markierung                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Server-Einstiegspunkte lasen Payloads beliebiger Größe.                                                                                                                                                                                                                                                                                                                | hier behoben                                                                                                             |
| Der Controller verarbeitete unbegrenzt viele gleichzeitige Nachrichten und Meldungen.                                                                                                                                                                                                                                                                                  | hier behoben                                                                                                             |
| Die Ratenbegrenzung von Nachrichten pro Controller auf dem Server beschränkt sich auf das, was der Diagnosespeicher begrenzt.                                                                                                                                                                                                                                          | akzeptiertes Risiko (eine Flut kostet begrenzten Speicher; Ratenlimits auf Broker-Ebene liegen in der Hand des Betreibers) |
| Die Zulassungslimits gelten pro Abonnement, nicht pro Client.                                                                                                                                                                                                                                                                                                          | akzeptiertes Risiko                                                                                                      |
| Laufzeiten älter als `0.3.0` veröffentlichen Ablehnungsmeldungen beliebiger Größe. Der Server ignoriert jede Controller-Nachricht über 64 KiB oder tiefer als 8 Ebenen verschachtelt, sodass eine sehr große Ablehnung einer alten Laufzeit dazu führt, dass die Revision als veröffentlicht ohne Ablehnung angezeigt wird. | akzeptiertes Risiko (zuerst die Laufzeit aktualisieren, [Runbook 5](plugins/wago/recovery-runbooks.md#_5-laufzeit-upgrade-und-rollback)) |

## 4. Konfiguration

**Schutzgüter:** die Kanalzuordnung, die entscheidet, welchen physischen Ausgang ein Befehl bewegt und was der sichere
Zustand bedeutet.

**Vertrauensgrenzen:** B1 (Editor), B2 (Veröffentlichung), B3 (Annahme durch den Controller).

**Bedrohungen:** Eine manipulierte oder versehentliche Konfiguration ordnet Ausgänge neu zu; ein Hash oder eine
Revision wird gefälscht; eine Konfiguration ist so groß oder so tief, dass der Controller sie nicht melden kann; ein
Rollback führt eine gefährliche Zuordnung wieder ein.

**Aktuelle Schutzmaßnahmen**

- Konfigurationen sind versioniert, kanonisiert und gehasht; der Controller weist einen Hash-Konflikt, ein unbekanntes Feld, eine veraltete Revision oder eine ungültige Freigabebedingung, Rückmeldung, Pulsvorgabe, Trennungsrichtlinie oder Messung ab (`cc100-runtime/src/runtime/configuration/validation.ts`, `cc100-runtime/src/runtime/configuration/configuration.ts`).
- Die Ausgangsführung kann sich nicht ändern, solange ein Ausgang eingeschaltet ist (`cc100-runtime/src/outputs/controller.ts` `assertConfigurationSafe`).
- Der Editor validiert vor dem Veröffentlichen dieselben Regeln (`backend/configuration/editor.ts` `validateEditorSnapshot`).
- Neue Limits weisen Konfigurationen ab, die größer als 1 MiB sind, tiefer als 16 Ebenen verschachtelt sind, IDs über 256 Zeichen oder mit Steuerzeichen enthalten, mehr als 2048 Kanäle oder Punkte haben, mehr als 256 aktivierte Kanäle haben oder deren Statusmeldung im ungünstigsten Fall über 64 KiB liegt (`shared/configuration-limits.ts`). Sie gelten für neue Revisionen und Rollbacks im Editor, in der API und in der Laufzeit. Die Laufzeit überspringt sie nur, wenn Revision und Hash der eingehenden Konfiguration ihrer gespeicherten akzeptierten Konfiguration entsprechen, sodass eine laufende oder erneut zugestellte Konfiguration deswegen nie abgewiesen wird (`cc100-runtime/src/runtime/configuration/configuration.ts`).

**Lücken**

| Lücke                                                                                                                                                                                                                                                                                                                                                                                                                                  | Markierung                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keine Limits für Größe, Tiefe, IDs oder Anzahl bei Konfigurationen.                                                                                                                                                                                                                                                                                                                                                                    | hier behoben                                                                                                                                       |
| Die Laufzeit akzeptiert jede gewünschte Konfiguration, deren Hash zu ihrem Inhalt passt; es gibt keine Signatur über eine Revision. Weil das eigene Konto des Controllers auf seinem Desired-Topic veröffentlichen darf (Abschnitt 2), genügt sein Zugangsdatum allein, um eine retained Konfiguration darauf zu installieren.                                                                                                              | für ATT-1057 gemeldet                                                                                                                              |
| Ein ersetzter oder zurückgesetzter Controller hat keine gespeicherte akzeptierte Konfiguration. Eine vor diesen Limits veröffentlichte retained Revision, die sie überschreitet (zum Beispiel zwei eingebaute 879-3020-Zähler mit je 131 Punkten und 131 Kanälen), wird daher mit `configuration_limit_exceeded` abgewiesen. Controller, die sie bereits ausführen, behalten sie. | akzeptiertes Risiko (die Konfiguration verkleinern und eine neue Revision veröffentlichen, [Runbook 4](plugins/wago/recovery-runbooks.md#_4-einen-controller-ersetzen)) |
| Ein Rollback veröffentlicht eine alte Revision unverändert; ihre Prüfung liegt in der Verantwortung des Betreibers.                                                                                                                                                                                                                                                                                                                    | akzeptiertes Risiko                                                                                                                                |

## 5. Befehle

**Schutzgüter:** die physischen Ausgänge.

**Vertrauensgrenzen:** B1, B2, B3.

**Bedrohungen:** wiedereingespielte oder abgelaufene Befehle; Befehle gegen eine veraltete Konfiguration; Fluten, um die
Ausgangswarteschlange auszuhungern; ein langsamer Ausgang, der andere blockiert; Befehle, die Freigabebedingungen oder
die manuelle Bedienung an der Frontplatte umgehen.

**Aktuelle Schutzmaßnahmen**

- Befehle tragen eine `id`, ein `expiresAt` und die `expectedConfigurationRevision`; abgelaufene, doppelte und Befehle mit veralteter Revision werden abgewiesen und über Neustarts hinweg dedupliziert (`cc100-runtime/src/runtime/commands/commands.ts`).
- Freigabebedingungen, Rückmeldungen, Pulslimits und Trennungsrichtlinien werden auf dem Controller durchgesetzt, nicht nur in der Oberfläche.
- Schreibzugriffe werden pro Kanal mit einer begrenzten Warteschlange serialisiert (`queue_full`).
- Befehle über 64 KiB werden ungeparst verworfen; ein Befehl gibt seinen Verarbeitungsplatz frei, sobald er in die Warteschlange seines Kanals eintritt, sodass ein langsamer Ausgang nicht die anderen 99 Plätze blockieren kann (`cc100-runtime/src/runtime/commands/commands.ts`, `cc100-runtime/src/transport/admission.ts`).
- Ein verworfener Befehl erhält keine Antwort. Das Befehls-Zeitlimit des Servers greift genau wie bei einem Offline-Controller.

**Lücken**

| Lücke                                                                                                                                                                                                                                                          | Markierung                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unbegrenzte Befehls-Payloads und Nebenläufigkeit auf dem Controller.                                                                                                                                                                                           | hier behoben                                                                                   |
| Jeder, der auf dem Befehls-Topic des Controllers veröffentlichen darf, kann ihn steuern: das Broker-Konto des Servers und, wegen seiner `#`-Veröffentlichungsberechtigung, das eigene Konto des Controllers (Abschnitt 2). Es gibt keine Signatur pro Befehl.  | für ATT-1057 gemeldet                                                                          |
| Die Zulassung in der Laufzeit folgt strikt dem Prinzip „wer zuerst kommt, mahlt zuerst“. Bei einer Flut werden Ausgang-aus-Befehle und die Failsafe-Nachricht des Laufzeit-Updates (auf dem Desired-Konfigurations-Topic) wie jede andere Nachricht verworfen. | akzeptiertes Risiko (Rückfall: die Trennungsrichtlinien und Befehls-Zeitlimits)                |
| Verworfene Befehle sind für den Aufrufer nicht von einem Offline-Controller zu unterscheiden.                                                                                                                                                                  | akzeptiertes Risiko (Zähler sind in der Diagnose sichtbar)                                     |
| Software-Befehle sind keine Sicherheitsfunktion; es gibt keinen zertifizierten Pfad für sicher abgeschaltetes Moment (Safe Torque Off) oder Not-Halt.                                                                                                          | akzeptiertes Risiko (dokumentiert in der [Sicherheitsgrenze](plugins/wago/safety-boundary.md)) |

## 6. Plugin-Grenzen

**Schutzgüter:** die Host-Datenbank und Geheimnisse, die Daten anderer Plugins, die gemeinsamen MQTT-Verbindungen.

**Vertrauensgrenzen:** B4.

**Bedrohungen:** Das Plugin liest die Geheimnisse eines anderen Plugins; das Plugin greift auf Host-Interna zu; ein
anderes Plugin liest WAGO-Geheimnisse; ein Plugin sendet mehr, als es deklariert hat.

**Aktuelle Schutzmaßnahmen**

- Deklarierte Berechtigungen (`plugin.json`: `PLUGIN_STORAGE`, `ACCESS_MQTT_SERVERS`, `TRIGGER_FLOWS`, `MANAGE_SECRETS`) werden vom abgesicherten Kontext des Hosts durchgesetzt.
- Plugin-Geheimnisse werden mit einem Schlüssel verschlüsselt, der pro Plugin-ID aus dem Server-Geheimnis abgeleitet wird (`apps/api/src/encryption/encryption.service.ts` `getPluginEncryptionKey`).
- Eine Lint-Regel und ein Modulgrenzen-Skript verhindern, dass das Plugin Host-Interna oder andere Plugins importiert (`@nx/enforce-module-boundaries`, `scripts/lint-module-boundaries.mjs`).

**Lücken**

| Lücke                                                                                                                      | Markierung                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Der MQTT-Kontext wird von allen Plugins mit `ACCESS_MQTT_SERVERS` geteilt; es gibt keine Topic-Abgrenzung pro Plugin.      | für ATT-1057 gemeldet                                                        |
| Eine hostweite Obergrenze für die Nachrichtengröße existiert nicht.                                                        | akzeptiertes Risiko (festgehaltenes Nicht-Ziel; Broker-Limit empfohlen)      |

## Pen-Test-Briefing

**Ziel:** Wege finden, einen Ausgang ohne Autorisierung zu bewegen, den Server oder Controller durch Eingaben
lahmzulegen oder die Geheimnisse einer anderen Partei zu lesen oder zu verändern.

**Im Umfang**

- Vom Controller ausgehendes MQTT auf jedem Topic in den Abschnitten 1 bis 3 gegen einen Attraccess-Testserver.
- Vom Server ausgehendes MQTT gegen die Controller-Laufzeit (Befehle, gewünschte Konfiguration, Beanspruchungen, Rotation).
- Die HTTP-API des Plugins für Konfiguration, Befehle, Inbetriebnahme und Rotation der Zugangsdaten.
- Die Simulator-Laufzeit ([Simulator-README](https://github.com/Attraccess/Attraccess/blob/main/apps/plugins/wago/cc100-runtime/README.simulator.md)); ein physischer Controller ist nicht erforderlich.

**Nicht im Umfang:** die Broker-Software selbst, der Attraccess-Host außerhalb des Plugins, physische Angriffe auf einen
CC100 und Denial-of-Service, der nur die Netzwerkbandbreite sättigt.

**Anzugreifende Einstiegspunkte**

| Einstiegspunkt                                                                          | Richtung                | Zu brechendes Limit                                 |
| --------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| `attraccess/wago/discovery/<hardwareId>`                                                | Controller zu Server    | 64 KiB, 8 Ebenen                                    |
| `.../controllers/<id>/heartbeat`, `state`, `measurements`, `faults`, `acknowledgements` | Controller zu Server    | 64 KiB, 8 Ebenen                                    |
| `.../controllers/<id>/configuration/reported`                                           | Controller zu Server    | 64 KiB, 8 Ebenen                                    |
| `.../discovery/<id>/claim/ack`, `.../credentials/rotate/ack`                            | Controller zu Server    | 64 KiB, 8 Ebenen                                    |
| `.../controllers/<id>/credentials/rotate/ack` während eine Netzwerkänderung verifiziert wird | Controller zu Server | 1 KiB                                               |
| `.../controllers/<id>/commands`                                                         | Server zu Controller    | 64 KiB, 100 gleichzeitig                            |
| `.../controllers/<id>/configuration/desired`                                            | Server zu Controller    | 1 MiB, Konfigurationslimits, unter der Update-Sperre dekodiert |
| `.../discovery/<id>/claim`, `.../credentials/rotate`                                    | Server zu Controller    | 64 KiB                                              |

**Fixtures und Konten, die der Tester braucht**

- Eine Wegwerf-Attraccess-Instanz mit installiertem WAGO-Plugin, ein Administratorkonto und ein zweites Konto ohne WAGO-Berechtigungen.
- Ein dedizierter RabbitMQ-4-Broker (oder der Broker der Zuverlässigkeits-Testumgebung) mit einem administrativen Konto für den Tester und einem Konto mit minimalen Rechten pro simuliertem Controller, erstellt durch den normalen Registrierungsablauf.
- Mindestens zwei simulierte Controller (`cc100-runtime/docker-compose.simulator.yml`), damit die Imitation zwischen Controllern ausprobiert werden kann.
- Der Kopplungscode und der Fingerabdruck eines noch nicht beanspruchten Controllers; nicht die eines beanspruchten.
- Kein physischer CC100 und kein Produktions-Broker.

**Aufzunehmende Testfälle**

- Mit dem eigenen Zugangsdatum eines Controllers auf dessen Topics `commands`, retained `configuration/desired`
  (mit selbst berechnetem Hash) und `credentials/rotate` veröffentlichen. Heute erwartet: vom Controller akzeptiert
  (bekannte Lücke, für ATT-1057 gemeldet). Dasselbe auch auf den Topics eines anderen Controllers versuchen.
  Erwartet: vom Broker abgewiesen.
- Mit diesem Zugangsdatum das eigene Befehls-Abonnement des Controllers fluten und prüfen, dass ein Serverbefehl,
  einschließlich Ausgang-aus, als `overload` verworfen wird und in ein Zeitlimit läuft (akzeptiertes Risiko,
  Abschnitt 5).
- Payloads knapp über jedem Limit der Einstiegspunkt-Tabelle sowie eine Verschachtelung von 9 Ebenen senden und prüfen,
  dass sie ohne Dekodierung ignoriert werden.

**Rückmeldung:** jeder Befund mit Topic oder Endpunkt, Payload, beobachteter Wirkung und dem umgangenen Limit.
Befunde, die eine Grundabsicherung erfordern, werden gegen ATT-1057 erfasst.
