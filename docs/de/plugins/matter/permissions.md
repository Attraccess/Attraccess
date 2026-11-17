# Matter: Berechtigungen

<!-- llms-description: Matter- und Thread-Berechtigungsschlüssel mit Standardrollen, welcher Schlüssel für welche Aktion nötig ist, Bestätigungsregel für direkte Befehle, Audit und Upgrade-Hinweise. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Matter** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Das Matter-Plugin deklariert eigene Berechtigungsschlüssel, statt die breite Berechtigung `system.plugins.manage` zu
verwenden. Sie finden sie im Rollen-Editor und in der Auswahl für API-Tokens in der Gruppe **Matter & Thread**. Wie
Plugin-Berechtigungen allgemein funktionieren, auch während das Plugin deinstalliert ist, beschreibt
[Berechtigungen](user-management/permissions.md#plugin-berechtigungen).

## Berechtigungsschlüssel

| Schlüssel                       | Erlaubt                                                                                                | Standardrollen                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `matter.devices.read`           | Verbindungsstatus, Fabric- und Backup-Status, Geräte, deren Zustand und den Abgleich anzeigen          | `administrator`, `resource-manager` |
| `matter.devices.manage`         | Verbindungseinstellungen, Fabric, Wiederherstellungsschlüssel, Backups, Restore und Gerätedaten ändern | `administrator`, `resource-manager` |
| `matter.devices.commission`     | Geräte in Betrieb nehmen, mit einer anderen Fabric teilen und aus der Fabric entfernen                 | `administrator`, `resource-manager` |
| `matter.devices.command-direct` | Direkte Testbefehle an ein Gerät senden, außerhalb von Flows                                           | `administrator`, `resource-manager` |
| `thread.network.read`           | Status des Thread-Netzwerks und nicht geheime Dataset-Metadaten anzeigen                               | `administrator`, `resource-manager` |
| `thread.network.manage`         | Thread-Dataset setzen, Border-Router verwalten und das Dataset-Geheimnis exportieren                   | `administrator`, `resource-manager` |

Die Standardrollen erhalten die Schlüssel einmal, wenn das Plugin zum ersten Mal auf einem Host lädt.
**Systemadministrator** (`system-admin`) erhält keinen davon. **Administrator** hält immer alle. Eigene Rollen
erhalten sie nur, wenn Sie sie hinzufügen.

Die Seite **Geräte → Matter** und ihr Seitenleisten-Eintrag erscheinen für Benutzer mit `matter.devices.read` oder
`thread.network.read`. Ein Benutzer mit nur `matter.devices.read` sieht die Statusansichten, aber kein
Einstellungsformular und keine Bedienelemente für Fabric, Wiederherstellungsschlüssel, Backup oder Restore; dafür ist
`matter.devices.manage` nötig. Vergeben Sie `matter.devices.manage` zusammen mit `matter.devices.read`: Die Seite zeigt
die Bedienelemente nur Benutzern, die beide Schlüssel halten.

`matter.devices.manage` bedeutet volle Kontrolle über die Fabric: Damit lassen sich der Wiederherstellungsschlüssel
rotieren, die verschlüsselten Backups herunterladen und wiederherstellen. Vergeben Sie den Schlüssel nur an Personen,
denen Sie auch direkte Befehle anvertrauen würden. Wer die Verbindungs-URL oder das CA-Zertifikat ändert, muss das
Service-Token erneut eingeben, sodass das gespeicherte Token nie an einen neuen Endpunkt gesendet wird.

## Welcher Schlüssel für welche Aktion

Jede Route antwortet ohne ihren Schlüssel mit `403`, bevor sie die Datenbank liest oder den Sidecar aufruft, und die
Antwort enthält keinen Bestand, keinen Zustand, keine Zugangsdaten, Wiederherstellungsschlüssel, Backup-Inhalte,
Einrichtungsdaten oder Thread-Geheimnisse. API-Tokens funktionieren, wenn Token und Besitzer den Schlüssel halten.

### Bereits verfügbar

| Aktion                                                                                                                                         | Schlüssel               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `GET connection/status`, `GET fabric`, `GET backups` (Metadaten)                                                                               | `matter.devices.read`   |
| `GET nodes`, `GET nodes/:id`, `GET endpoints/:id/state`, `GET reconciliation`                                                                  | `matter.devices.read`   |
| `GET connection` (das Einstellungsformular mit URL und CA; das Service-Token wird nie zurückgegeben)                                           | `matter.devices.manage` |
| `PUT connection`, `DELETE connection`                                                                                                          | `matter.devices.manage` |
| `POST fabric/create`, Wiederherstellungsschlüssel erzeugen, bestätigen und rotieren, `POST recovery/accept-sidecar`, `POST recovery/start-new` | `matter.devices.manage` |
| `POST backups`, `GET backups/:id/download`                                                                                                     | `matter.devices.manage` |
| `POST restore/validate`, `POST restore/confirm`, `POST restore/:id/cancel`                                                                     | `matter.devices.manage` |
| `PATCH nodes/:id`, claim, relink, repair, archive, restore, force-remove, `PATCH endpoints/:id`, `POST reconciliation`                         | `matter.devices.manage` |

Alle Pfade liegen unter `/api/matter/`. Wiederherstellungsschlüssel und Backup-Download funktionieren auch mit einem
API-Token, das `matter.devices.manage` trägt.

### Geplante Aktionen

Diese Aktionen gibt es noch nicht. Ihre Schlüssel stehen schon fest, sodass Sie Ihre Rollen vorbereiten können.

| Aktion                                                                                | Schlüssel                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Inbetriebnahme starten und ihren Status lesen, Gerät teilen, aus der Fabric entfernen | `matter.devices.commission`                                         |
| Fehlgeschlagene Attestierung bei der Inbetriebnahme übergehen                         | `matter.devices.commission` **und** `matter.devices.manage`         |
| Direkte Testbefehle                                                                   | `matter.devices.command-direct`                                     |
| Status von OTA-Updates                                                                | `matter.devices.read`                                               |
| OTA-Update freigeben und anwenden                                                     | `matter.devices.manage`                                             |
| Thread-Status und Dataset-Metadaten (nicht geheim)                                    | `thread.network.read`                                               |
| Thread-Dataset setzen, Border-Router (OTBR) verwalten                                 | `thread.network.manage`                                             |
| Thread-Dataset-Geheimnis exportieren                                                  | `thread.network.manage`, nur in einer Websitzung (keine API-Tokens) |
| Entwicklungs-Overrides                                                                | `matter.devices.manage`                                             |
| Live-Updates zu Gerätebestand und Zustand                                             | `matter.devices.read`                                               |
| Live-Updates zum Thread-Netzwerk                                                      | `thread.network.read`                                               |

Befehle, die ein [Flow](flows/overview.md) an ein Matter-Gerät sendet, brauchen keinen Matter-Schlüssel: Sie folgen
den normalen Flow- und Ressourcenberechtigungen. Denselben Befehl direkt zu senden, erfordert
`matter.devices.command-direct`.

### Bestätigung für direkte Befehle

Direkte Befehle, die ein Gerät **entriegeln**, **den Riegel zurückziehen** oder **einschalten**, verlangen vor dem
Senden eine Bestätigung des Benutzers. Diese Regel gilt, sobald direkte Befehle verfügbar sind.

## Audit

Matter-Aktionen werden im [Audit-Protokoll](settings/audit-log.md) festgehalten, mit Akteur, betroffenem Knoten,
Endpunkt oder Fabric, Aktion, Ergebnis und einer Korrelations-ID, die zusammengehörige Einträge teilen. Einträge
enthalten nie das Service-Token, Wiederherstellungsschlüssel, Backup-Inhalte, Einrichtungscodes oder Thread-Datasets.
Backup-Downloads und abgebrochene Wiederherstellungen werden ebenfalls festgehalten.

- Aktionen, die Attraccess selbst ausführt, etwa der automatische Abgleich, zeigen **System oder anonym** als
  Akteur.
- Zustandsänderungen, die Geräte von sich aus melden, werden nicht protokolliert und haben keinen Akteur.
- Abgelehnte Versuche (`403`) werden nicht protokolliert.

## Hinweise zum Upgrade

Vor dieser Version brauchten alle Matter-Funktionen `system.plugins.manage`. Nach dem Upgrade gilt:

- **Administrator** und **Ressourcen-Verwalter** haben vollen Matter- und Thread-Zugriff.
- Benutzer, die Matter nur über **Systemadministrator** oder über eine eigene Rolle mit `system.plugins.manage`
  erreichten, **verlieren den Zugriff** auf die Matter-Seite und ihre API.

Um den Zugriff wiederherzustellen, legen Sie eine eigene Rolle an oder bearbeiten eine, fügen die nötigen
Matter-Schlüssel hinzu (zum Beispiel `matter.devices.read` und `matter.devices.manage`) und weisen sie den Benutzern
zu. Für ein API-Token, das `system.plugins.manage` für Matter nutzte, legen Sie in Ihren Kontoeinstellungen ein neues
Token mit den neuen Schlüsseln an und widerrufen das alte; die Kontoeinstellungen ändern die Schlüssel eines
bestehenden Tokens nicht.
