# Audit-Integration der WAGO-Administration

> [!NOTE]
> Nur verfügbar, wenn das Plugin **WAGO** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Der WAGO-HTTP-Controller und die sperrgeschützten Konfigurationsdienste geben über
`PluginContext.audit` Audit-Lebenszyklen auf einer Positivliste aus. Der Host bindet die Plugin-Identität aus seinem geladenen Manifest.
Der Controller bezieht die Benutzeridentität aus dem durch den Guard authentifizierten `request.user`
mittels `wagoAuditPrincipal`; Request-Bodys, JWT-Werte und Zugangsdaten werden nie
als Principal-Metadaten verwendet.

## Dauerhafte Speicherung

Das Core-`AuditModule` registriert den Plugin-Audit-Host unter
`PLUGIN_AUDIT_HOST_PROVIDER` (`Symbol.for('attraccess.plugin.auditHostProvider')`).
Der Host prüft das Ereignis gegen die vom Plugin registrierte Domäne, bildet es auf das
Core-Audit-Ereignis ab und schreibt es über denselben `AUDIT_RECORDER`-Port wie die Core-Dienste
in die gemeinsame Tabelle `audit_log`. Es gibt keine WAGO-eigene Tabelle und kein Inbetriebnahme-Fortschrittsprotokoll. Die vorhandene Authentifizierungsprotokollierung
und die Audit-Speicherung der Passwortrichtlinie bleiben getrennt; dies implementiert weder jede
Domäne noch die vollständige Administrationsoberfläche aus ATT-906 / ATT-917 / ATT-235.

Der exportierte Vertrag `PluginAuditHostProvider.record` lautet:

```ts
record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt>;
// PluginAuditReceipt = { status: 'recorded' } | { status: 'unavailable' }
```

`recorded` bedeutet ein abgeschlossenes Autocommit-Einfügen über einen separaten Verbindungspool zur
PostgreSQL-Datenbank des Hosts mit aktivem `synchronous_commit`. Zeilen enthalten Server-Zeitstempel, Akteurs- und
API-Token-IDs, Plugin-Identität, Vorgangs-UUID, Ergebnis, Ziel und sichere Details.
Historische Bezeichner haben keine kaskadierenden Fremdschlüssel: Das Löschen eines Controllers,
Principals, Tokens oder Plugins löscht dessen Historie nicht. Ein Datenbank-Trigger weist
Zeilenänderungen zurück; die Aufbewahrung ist der vorgesehene Löschpfad. Die Host-Bridge
überschreibt jede vom Aufrufer gelieferte Plugin-ID.

Plugin-Aufrufe tragen keine Host-Transaktion, daher wird die Zeile nicht gemeinsam mit der eigenen Änderung des Plugins
committet oder zurückgerollt. Jeder Aufruf wird auf der
separaten Audit-Verbindung geschrieben: Bis zu 1.000 können in der Warteschlange stehen, und ein Schreibvorgang, der
auf eine Datenbanksperre wartet, wird einige Male wiederholt, statt sofort aufzugeben.
Ein nicht gespeicherter Schreibvorgang liefert `unavailable`, protokolliert eine
`Audit record dropped`-Zeile im API-Log und erhöht
`attraccess_audit_records_dropped_total` (siehe den
[Audit-Alarm](monitoring/prometheus-grafana.md#audit-alarm)). Gründe sind ein
Speicherfehler, eine volle Warteschlange, nicht verfügbarer Audit-Speicher (Start fehlgeschlagen), Herunterfahren, nicht lesbare Audit-Einstellungen oder ein ungültiges
Ereignis. Schreibvorgänge, die beim Beginn des Herunterfahrens bereits in der Warteschlange stehen, werden noch bis zu 4 Sekunden lang gespeichert. Die Bridge
liefert außerdem `unavailable`, wenn kein Provider registriert ist oder der Provider
eine Ausnahme wirft; sie serialisiert Fehler nie als Ersatzeinträge. Deaktiviertes Audit oder eine
deaktivierte Plugin-Domäne liefert ebenfalls `unavailable`, zählt aber nicht als verworfen.
WAGO gibt bei jeder `unavailable`-Quittung nur die feste Warnung `WAGO audit storage unavailable` aus.
Abgewiesene Schreibvorgänge werden nicht wiederholt, und die Quittung kann das Domänenergebnis nicht ändern:
Domänenoperationen werden fortgesetzt. Persistenztests verwenden isolierte PostgreSQL-Testdatenbanken.
Aktualisieren Sie das Host-SDK, bevor Sie ein
Plugin ausrollen, das diese Bridge erwartet. Ältere Kontexte ohne `audit` bleiben unterstützt.

### Migrations- und Abfragevertrag

Die Core-Migration `DurableAudit1783700000000` erstellt `audit_log`, seine Abfrageindizes,
den Trigger für unveränderliche Zeilen und `system.audit.read`. Die Berechtigung wird beim Upgrade nur
der integrierten Administratorrolle gewährt. Bestehende Rollen, Controller-Daten und
spezialisierte Audit-Tabellen bleiben unangetastet. Der normale Migrations-Runner des Hosts wendet sie
vor dem Modulstart an; es wird keine Schema-Synchronisierung zur Laufzeit verwendet. Ihre `down`-Migration
entfernt die Audit-Tabelle samt Historie und ihre Berechtigung; exportieren Sie daher
die Datenbank oder bewahren Sie sie auf, bevor Sie ein beabsichtigtes Downgrade durchführen, das diese Historie benötigt.

`GET /api/admin/audit-log` erfordert `system.audit.read`. Sitzungsberechtigungen und
Berechtigungsobergrenzen von API-Tokens nutzen die vorhandenen Authentifizierungs-/RBAC-Guards; allein
`system.settings.manage` gewährt keinen Zugriff auf die Audit-Historie.

Die Antwort lautet `{ items: AuditLog[], nextCursor: number | null }`. Die Zeilen sind
nach absteigender Zeilen-ID sortiert. Senden Sie `beforeId=nextCursor` für die nächste Seite. `limit` ist standardmäßig 50
und auf 1..100 begrenzt; ungültige oder unbekannte Abfragefelder werden abgelehnt.
Unterstützte Filter sind `domain=wago`, exaktes `action`, `eventPrefix` (zum Beispiel
`wago.commissioning.`), `outcome`, `operationId`, `actorId`, `subjectType`,
`subjectId` sowie inklusive ISO-Zeitstempelgrenzen `from`/`to`. Zieltypen sind
`wago.controller` und `wago.commissioning`. `GET /api/admin/audit-log/meta`
zählt die dem Host derzeit bekannten Domänen, Aktionen und Zieltypen auf —
Core-Werte plus die Beiträge geladener Plugins —, sodass Clients das WAGO-Vokabular nie
fest codieren. Daten werden als ISO-Zeitstempel zurückgegeben.
Zeilen behalten Bezeichner und ausdrücklich sichere Metadaten, nicht aber Akteursnamen, Befehls-
werte, Zugangsdaten, beliebige Fehlerzeichenfolgen oder rohe Konfigurations-Schnappschüsse.

`GET /api/settings/audit` und `PATCH /api/settings/audit` erfordern die vorhandene
Berechtigung `system.settings.manage`. Die Einstellungen verwenden `SettingsStoreService` mit
dem übergeordneten Schlüssel `audit` und den folgenden JSON-codierten Schlüsseln:

| Schlüssel                 | Standard     | Grenzen                                                                                                                                                   |
| ------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                 | `true`       | Boolescher Hauptschalter.                                                                                                                                 |
| `domains`                 | Core-Domänen | Positivliste nur der Core-Domänen (im Besitz des Hosts).                                                                                                  |
| `plugin_domains_disabled` | `[]`         | Sperrliste von durch Plugins beigetragenen Domänen. Die Domäne `wago` wird aufgezeichnet, solange das Plugin geladen und nicht in dieser Liste enthalten ist; Administratoren schalten sie hier ab. |
| `retention_days`          | `90`         | Ganzzahl 1..3650.                                                                                                                                         |

PATCH akzeptiert diese Felder, zum Beispiel `{ "retention_days": 30 }`. Ungültige
persistierte Einstellungen schlagen geschlossen fehl (fail closed), statt stillschweigend die Erfassung zu aktivieren oder
mit einer erfundenen Aufbewahrungsdauer zu löschen. Schreibvorgänge lesen die Einstellungen vor der Übergabe an den Speicher;
der vorhandene Einstellungs-Cache wird durch lokale PATCH-Aufrufe aktualisiert und kann in einem anderen Prozess bis zu einer
Minute bis zur Aktualisierung brauchen. Es wird kein zweiter, nur über Umgebungsvariablen gespeister Einstellungsspeicher
eingeführt.

Die Senke lässt höchstens acht ausstehende Schreibvorgänge zu und hält keine Wiederholungswarteschlange vor.
Details sind auf 4 KiB begrenzt und werden gegen Positivlisten je Aktion validiert, die das
Plugin selbst deklariert. Das WAGO-Backend-Modul exportiert seine Richtlinie als
`WAGO_AUDIT_DOMAIN` (`apps/plugins/wago/backend/audit/policy.ts`) über
`PluginBackendModule.auditDomains`; der Host registriert die Deklaration beim Laden des Plugins
und setzt sie bei jedem aufgezeichneten Ereignis durch. Die Core-Anwendung enthält keinen
WAGO-spezifischen Audit-Code: Ein Ereignis wird nur zugelassen, wenn sein Aktionspräfix
auf eine vom aufzeichnenden Plugin registrierte Domäne zeigt, Aktion und Zieltyp
deklariert sind und jedes Detailfeld seine deklarierte Feldrichtlinie erfüllt.
Aufrufer-Objekte werden einmal aus Dateneigenschaften als Schnappschuss übernommen; Accessoren, benutzerdefinierte
Prototypen, unbekannte Felder, fremde Plugin-Identitäten und nicht unterstützte Ereignisse werden
vor der Persistenz abgelehnt. Eine Erweiterung der Audit-Abdeckung erfordert eine ausdrückliche,
geprüfte Deklaration im Plugin, keine Erlaubnis, beliebiges JSON zu übermitteln. Insbesondere
werden Telemetrie-Ereignisse nicht akzeptiert.

Die Aufbewahrung läuft beim Start und stündlich, löscht abgelaufene Zeilen in Stapeln zu 1.000
und gibt zwischen den Stapeln die Kontrolle ab, bis der Rückstand abgebaut ist. Nur Löschzahlen
werden protokolliert. Abgelaufene Zeilen sind sofort von Abfragen ausgeschlossen, auch wenn
ein Bereinigungsversuch fehlschlägt. Das Deaktivieren der Erfassung deaktiviert weder die Aufbewahrung noch löscht es
die aktuell aufbewahrte Historie.

## Angebundene HTTP-Lebenszyklen

| Route                                                   | Aktion             | Erfolgsgrenze                                                                                                                       |
| ------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST controllers/:id/claim`                            | `wago.claim`       | Der vorhandene Dienst `claim` schließt nach dem Versand der Zugangsdaten ab; bestätigt nicht den Empfang durch den Controller.      |
| `DELETE controllers/:id`                                | `wago.unclaim`     | Der vorhandene Dienst `remove` schließt nach Widerruf/Entfernung ab. Ein späterer Fehler beim Bereinigen der Inbetriebnahme-Historie löscht ein erfolgreiches Unclaim nicht. |
| `POST controllers/:id/configuration/publish`            | `wago.publication` | Die vorhandene Veröffentlichung schließt ab; der Abschluss enthält die zurückgegebene `revision`. Bestätigt nicht die Anwendung durch den Controller. |
| `POST controllers/:id/configuration/rollback/:revision` | `wago.rollback`    | Die Veröffentlichung schließt ab; enthält die angeforderte `sourceRevision` und die neu zurückgegebene `revision`.                  |

Jeder Vorgang zeichnet `attempted` auf, gefolgt von `succeeded` oder `failed`, mit
einer gemeinsamen generierten Vorgangs-UUID. Eine Ablehnung durch den Dienst wird unverändert an den
Aufrufer weitergegeben; ihre Meldung, ihr Stacktrace, ihr Response-Body und ihre Payload gelangen nie in die Audit-Details.
Ein Versuch hat keine erfundene Revision, wenn der Dienst noch keine zugewiesen hat.
Fehler nach teilweisen Dienständerungen können keine zugewiesene Revision melden, wenn
der aktuelle Dienst eine Ausnahme wirft, ohne sie zurückzugeben; die Verantwortlichen der Dienste müssen diese Verknüpfung
an der tatsächlichen Änderungsgrenze liefern.

## Wiederverwendbarer Integrationsvertrag für die verbleibenden Verantwortlichen

`apps/plugins/wago/backend/audit/index.ts` exportiert `WagoAudit`, Lebenszyklus-/Ergebnis-
Schnittstellen sowie sichere Zusammenfassungs- und Projektionsfunktionen. Kein Dienst anderer Verantwortlicher
muss Implementierungsdetails des Core-Audits importieren.

```ts
const audit = new WagoAudit(context);
const principal = wagoAuditPrincipal(request); // authenticated request only
const result = await audit.run(
  principal,
  controllerId,
  'forced_publication',
  {},
  () => serviceOperation(), // Promise<WagoRevisionAuditResult>
  (value) => ({ revision: value.revision }),
);
```

`run<T>` gibt den **exakten ursprünglichen Dienstwert** als `Promise<T>` zurück und wirft den
ursprünglichen Dienstfehler erneut. Sein Abschluss-Projektor gibt nur
`WagoAuditDetails` zurück. Er fügt bestehenden HTTP-Antworten keine Audit-Quittungen hinzu.

Für Dispatch-/Bestätigungs-Workflows verwenden Sie `begin`, das `WagoAuditLifecycle` zurückgibt: `operationId: string`,
`attempt(): Promise<PluginAuditReceipt>` und
`finish('succeeded' | 'failed', details?): Promise<PluginAuditReceipt>`.
Wiederholte attempt-/finish-Aufrufe auf demselben Handle geben höchstens ein Attempt-
und ein Abschlussereignis aus; der erste Abschlussaufruf gewinnt. Finish wartet implizit auf
das Attempt. Das Handle ist prozesslokal, kein persistierter Korrelationszustand.

| Verantwortlicher für den Vorgang            | Aktion und erforderliche Integrationsdaten                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatisches Claim der Inbetriebnahme      | Rufen Sie den Lebenszyklus `claim` um das tatsächliche automatische Claim auf und führen Sie den authentifizierten auslösenden Principal durch Sitzung/Job mit. Der vorhandene dienstinterne Aufruf umgeht den HTTP-Claim-Hook. Synthetisieren Sie nie einen Akteur aus Controller-Daten.                                                                                                                                                                               |
| Zugangsdatenrotation/manuelle Registrierung | `credential_rotation` / `manual_credential_fallback`; mit der persistierten Controller-ID und dem authentifizierten Principal beginnen, erst nach tatsächlichem Abschluss der Rotation bzw. des Fallbacks abschließen. Ein `Promise<void>`-Vorgang braucht keinen Abschluss-Projektor. Übergeben Sie nie bereitgestellte Zugangsdaten oder manuelle Anweisungen.                                                                                                        |
| Erzwungene Veröffentlichung                 | `forced_publication`; der Vorgang gibt `WagoRevisionAuditResult` (`{ revision: number }`) zurück.                                                                                                                                                                                                                                                                                                                                                                       |
| Bestätigung einer Ablehnung                 | `rejection_acknowledgement`; mit `{ revision }` beginnen, abschließen, wenn die Bestätigung durch den Bediener persistiert ist. Dies ist eine authentifizierte Bedieneraktion, kein roher MQTT-Rejection-/Telemetrie-Callback.                                                                                                                                                                                                                                          |
| Vorlage anwenden/erneut anwenden            | Wählen Sie `preset_application` oder `preset_reapplication` anhand der tatsächlich persistierten Herkunft unter der Konfigurationssperre. Geben Sie `WagoPresetAuditResult` (`presetId`, `channelId`, `before`, `after`) zurück und projizieren Sie diese Felder.                                                                                                                                                                                                       |
| Hardwareprofil erstellen/ändern             | `profile_creation` / `profile_change`; geben Sie `WagoProfileAuditResult` (`profileId: string`, `profileVersion: number`, `before`, `after`) zurück. Erfassen Sie die Identität aus dem validierten Profil, das in `snapshot.modbus.profiles` eingebettet ist, an der Persistenzgrenze des zuständigen Konfigurationsentwurfs bzw. der Veröffentlichung, nicht aus einem separaten Profildatensatz oder einer lokalen Vorschau.                                         |
| Manueller Befehl                            | `manual_command`; weisen Sie die echte Befehls-UUID vor `begin` zu, übergeben Sie `{ channelId, operation, commandId }` und schließen Sie mit einem Ergebnis aus `WagoManualCommandAuditResult` ab. Für reine Dispatch-Semantik verwenden Sie `dispatched`; für Bestätigungssemantik warten Sie auf `acknowledged`, `rejected`, `timeout` oder `transport_failure`. Die letzten drei schließen als `failed` ab. Zeichnen Sie nie Befehlswerte oder Broker-Payloads auf. |

`before` und `after` verwenden `WagoAuditSummary`: nur `physicalPointCount` und
`logicalChannelCount`. Berechnen Sie beide innerhalb der Änderungssperre des Verantwortlichen aus den
tatsächlich persistierten Schnappschüssen mit `wagoAuditSummary`; keine separaten Vorab-Lesevorgänge,
die mit einem anderen Schreibvorgang konkurrieren könnten. Diese bewusst minimalen Zusammenfassungen schließen
Konfigurationswerte aus. Die Vorlagenidentität ist auf den Katalog beschränkt, Kanal-IDs auf
1–64 ASCII-Buchstaben/-Ziffern/Unterstrich/Bindestrich, Befehls-IDs auf UUID-Syntax, und
Operationen/Ergebnisse auf ausdrückliche Enums. Revisionen müssen positive sichere Ganzzahlen sein.
Der Profilvertrag entspricht ATT-1059 / Modbus-Commit `20ef1db4`: `profileId` ist eine
Zeichenfolge mit nichtleerem `trim()`-Ergebnis und ursprünglicher JavaScript-`.length` von höchstens
160 (UTF-16-Codeeinheiten); `profileVersion` ist eine sichere Ganzzahl in `1..1000000`.
Akzeptierte IDs bleiben wortgetreu erhalten und werden nie gekürzt, abgeschnitten, umgewandelt oder
auf UUID-/ASCII-Syntax beschränkt. Die einzige eingebaute Referenz ist
`wago-879-3020`, Version 1; eigene IDs
sind vom Benutzer bearbeitbare Zeichenfolgen. Ungültige Felder und zusätzliche Schlüssel auf jeder Ebene werden
verworfen und nicht in Fehler-Metadaten kopiert. Die Längenprüfung ist keine Geheimniserkennung:
IDs müssen aus validierten Domänenidentitäten stammen, nie aus beliebigem Request-Text oder
Fehlerzeichenfolgen. Vollständige Profile, Transporteinstellungen, Zugangsdaten, Messwert-/Aktions-
Zuordnungen und rohe Fehler dürfen nicht als Identitätsfelder geliefert werden.

### Vorlagen- und Revisionsintegration unter Konfigurationssperre

`WagoPresetAuditResult` ist genau `{ presetId, channelId, before, after }`;
`presetId` ist eine Katalog-ID, und beide Zusammenfassungen sind `WagoAuditSummary`.
Lesen Sie im vorhandenen Callback `withConfigurationLock` die persistierte Herkunft,
wählen Sie `preset_application` oder `preset_reapplication` und berechnen Sie `before`
aus dem unter der Sperre gelesenen persistierten Schnappschuss. Rufen Sie `audit.run` innerhalb derselben Sperre mit
dem authentifizierten Principal, der Controller-ID, der gewählten Aktion und
`{ presetId, channelId, before }` auf. Der Operations-Callback muss die
Änderung persistieren und `WagoPresetAuditResult` zurückgeben und dabei `after` aus dem tatsächlich
gespeicherten Schnappschuss berechnen, bevor die Sperre freigegeben wird. Projizieren Sie im Abschluss-Callback nur diese vier Ergebnisfelder.
Verschachteln Sie keine weitere Konfigurationssperre und wählen Sie die
Aktion nicht über Vorab-Lesevorgänge am Controller. Lokale Vorschau/Anwendung wird nicht persistiert und
darf keine erfolgreichen Ereignisse zur persistierten Vorlagenanwendung ausgeben.

Für `publication` / `forced_publication` gibt der Vorgang
`WagoRevisionAuditResult` (`{ revision: number }`) nach der Persistenz der Veröffentlichung zurück;
projizieren Sie `{ revision: value.revision }`. Wählen Sie die Aktion an der tatsächlichen
validierten Veröffentlichungsgrenze des Verantwortlichen und vermeiden Sie doppelte Ausgabe durch einen vorhandenen HTTP-
Wrapper. Bei `rollback` lauten die Anfangsdetails `{ sourceRevision }`, und der Abschluss
ergänzt die neu zugewiesene `{ revision }`. Bei `rejection_acknowledgement` lauten die Anfangs-
details `{ revision }`; der Erfolg folgt der persistierten Bedienerbestätigung,
nicht dem Empfang einer Geräte-Ablehnung. Ein `Promise<void>`-Vorgang kann den
Abschluss-Projektor weglassen. Keines dieser Erfolgsereignisse behauptet eine Anwendung auf der Hardware
oder eine erfolgreiche Audit-Quittung; das oben beschriebene Verhalten bei nicht verfügbarer Senke gilt weiterhin.

Die zusammengesetzten Vorlagenrouten implementieren Katalog, Vorschau und persistierte Anwendung.
Auswahl der Audit-Aktion für Anwendung/erneute Anwendung, Zusammenfassungen und Persistenz laufen innerhalb der Konfigurationssperre
mit dem authentifizierten HTTP-Principal. Die Vorschau gibt kein erfolgreiches Ereignis zur persistierten Anwendung aus. Eine
ausdrückliche erneute Anwendung im Editor kann ein Ereignis auslösen, auch wenn die Konfigurationswerte unverändert sind; ein
wiederholtes Speichern ohne neue Anwendungsherkunft löst keines aus. Veröffentlichung und erzwungene Veröffentlichung wählen ihre Audit-Aktion nach Prüfung und Auswirkungs-
validierung unter der Konfigurationssperre. Das Rollback gibt einen Lebenszyklus mit Quell-
und resultierender Revision aus. Validierte Erstellungen/Änderungen eigener Modbus-Profile werden
bei der ausdrücklichen Persistenz des Entwurfs auditiert. Die Bestätigung einer Ablehnung gibt ihren Lebenszyklus nach der Validierung
unter der Konfigurationssperre aus; eine bereits bestätigte Revision ist
ein No-Op. Rotation, Abschluss des manuellen Zugangsdaten-Fallbacks und HTTP-Operationen für manuelle Befehle
fehlen weiterhin im Integrationsstand `491054ab`. Flow-Knoten-Befehle werden nicht
automatisch als manuelle Befehle eingestuft. Hilfstests für diese Aktionsnamen sind
kein Nachweis für eine Anbindung zur Laufzeit.

### Zusammensetzung des Inbetriebnahme-Stacks

Der Inbetriebnahme-PR #1817 bei `f136365b` gibt über dieselbe Host-Bridge aus. Sein
Helfer `auditCommissioning` verwendet `wago.commissioning`-Ziele (die persistierte
Sitzungs-ID) für `wago.commissioning.install`, `recover`, `security_inspect`,
`security_review`, `security_apply`, `security_recover`, `platform_inspect`,
`platform_activate` und `platform_recover`. Die Details sind leer.
Das automatische Claim gibt stattdessen `wago.claim` gegen die echte `wago.controller`-ID aus.
Der authentifizierte auslösende Principal wird in den Inbetriebnahme-Sitzungen persistiert;
Legacy-Sitzungen ohne gültigen Auslöser dürfen keinen erfinden.

Dieser Inbetriebnahme-Stack ist älter als die zusammengesetzten Konfigurations-Hooks. Der Integrator
muss die HTTP-Claim- und sperrgeschützten Konfigurations-Hooks des Integrationszweigs erhalten
und nicht durch den älteren Controller-/Dienst-Schnappschuss des Inbetriebnahme-Zweigs ersetzen.
Erhalten Sie beim Unclaim die Besitzprüfungen der Inbetriebnahme und setzen Sie den vorhandenen Audit-
Wrapper in deren Callback für sicheres Entfernen:

```ts
const principal = wagoAuditPrincipal(request);
await this.commissioning.removeControllerSafely(id, (assertOwned) =>
  this.audit.run(principal, id, 'unclaim', {}, () => this.wago.remove(id, assertOwned)),
);
```

Dadurch bleibt ein erfolgreiches Unclaim erhalten, auch wenn die anschließende Sitzungsbereinigung fehlschlägt. Setzen Sie
die Principal-Migration der Inbetriebnahme mit ihrem Verantwortlichen-Stack zusammen; übertragen oder
duplizieren Sie sie nicht in die Core-Audit-Migration. Das automatische Claim braucht genau einen
Lebenszyklus, nicht sowohl den Inbetriebnahme-Helfer als auch einen weiteren `WagoAudit`-Wrapper.

### Verbleibende Hooks der Verantwortlichen

- Verantwortlicher für Zugangsdaten: Stellen Sie einen authentifizierten Abschluss des manuellen Fallbacks oder eine Rotations-
  operation bereit, ermitteln Sie die echte persistierte Controller-ID und umschließen Sie den tatsächlichen Abschluss
  mit `manual_credential_fallback` oder `credential_rotation`. Registrierungs-IDs sind keine
  Controller-IDs. Das Zurückgeben von Zugangsdaten oder Anweisungen ist kein abgeschlossener Fallback.
- Verantwortlicher für Befehle: Fügen Sie einen ausdrücklich authentifizierten Einstiegspunkt für manuelle Befehle hinzu. Geben Sie
  den auslösenden Principal an die Ausführung weiter, weisen Sie die echte Befehls-UUID vor
  `begin` zu und verwenden Sie dann `attempt` und genau ein `finish` bei Dispatch/Bestätigung oder
  Fehler. Bilden Sie Timeout, Ablehnung und Transport-/Shutdown-Fehler auf die vorhandenen
  Ergebnis-Enums ab. Bezeichnen Sie die automatische Flow-Ausführung nie als manuell und persistieren Sie keine Werte.
- Verantwortlicher für die Konfiguration: Behalten Sie eine zugewiesene/wiederverwendete Revisionsnummer im
  Fehlerpfad bei. Die aktuelle Veröffentlichung/das aktuelle Rollback kann eine ausstehende Revision persistieren und dann beim
  Dispatch fehlschlagen; `run` erhält die Revision nur bei Erfolg. Verwenden Sie einen vom Verantwortlichen verwalteten Lebenszyklus
  innerhalb der vorhandenen Sperre, fügen Sie nach der Zuweisung `{ revision }` zum fehlgeschlagenen Abschluss hinzu und erhalten Sie
  die `sourceRevision` des Rollbacks ohne einen inneren doppelten Veröffentlichungs-
  Lebenszyklus. Validierungsfehler vor der Zulassung des Lebenszyklus geben derzeit
  kein Attempt-Ereignis aus.

Diese Anweisungen beschreiben Arbeit der Verantwortlichen, die durch die Änderung an der dauerhaften Senke nicht erledigt wurde.
Sie bleiben Abnahmelücken, unabhängig davon, ob bereits ausgegebene Ereignisse
dauerhaft gespeichert werden. Software-Fixtures belegen keine Controller-Qualifizierung und
schließen das Live-Release-Gate nicht.
