# Plugins installieren

<!-- llms-description: Plugins über die Weboberfläche hochladen, aktivieren, deaktivieren und entfernen, mit Fehlerbehebung. -->

Plugins werden durch Hochladen ueber die Attraccess-Weboberflaeche installiert. Diese Seite erklaert, wie Sie Plugins hochladen, aktivieren und verwalten.

## Voraussetzungen

- Sie benoetigen **Administratorzugang** zur Plugin-Verwaltung
- Das Plugin-System darf nicht deaktiviert sein (siehe [Umgebungsvariablen](installation/environment-variables.md))

## Abhängigkeiten im Marktplatz

Öffne **Einstellungen → Plugins → Plugin installieren → Marktplatz durchsuchen** und wähle ein Plugin. Details und Installationsbestätigung zeigen erforderliche Plugins einschließlich indirekter Abhängigkeiten, aufgelöste Versionen, Berechtigungen und ob sie installiert oder weiterverwendet werden. Eine Bestätigung installiert den gesamten Baum. Konflikte oder Zyklen verhindern die Installation und erklären die Ursache.

Updates und Downgrades dürfen keine Abhängigkeiten verletzen. Beim Entfernen eines benötigten Plugins zeigt die Bestätigung alle abhängigen Plugins: Behalte das Plugin oder bestätige ihre gemeinsame Entfernung ausdrücklich. Automatisch installierte Abhängigkeiten bleiben normale Plugins und werden beim Entfernen ihres Anbieters nicht automatisch entfernt. Beim Entfernen von npm-Plugins bleiben Daten und Geheimnisse erhalten.

Wenn eine Abhängigkeit nicht geladen werden kann, bleiben ihre abhängigen Plugins inaktiv. Öffne die Fehlerdetails unter **Einstellungen → Plugins**, repariere die Abhängigkeit oder versuche sie erneut zu laden und starte neu.

## Release-Kanäle

Offizielle Plugins werden auf npm unter diesen Dist-Tags veröffentlicht:

| Tag      | Gesetzt von               | Inhalt                                                                                                                                       |
| -------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `latest` | Attraccess-Releases       | Die mit einem Attraccess-Release veröffentlichte Plugin-Version. **Der Marktplatz eines Release-Hosts zeigt und installiert diese Version.** |
| `next`   | Nightly-Builds von `main` | Builds aus erfolgreichen, hardwaregeprüften `main`-Builds, z. B. `0.2.0-nightly.1180.1` (Plugin-Version, dann `-nightly.<Lauf>.<Versuch>`).  |
| `alpha`  | Niemand (veraltet)        | Eingefrorene Builds aus der Zeit vor den Release-Kanälen.                                                                                    |

### Welchen Kanal ein Host verwendet

Jeder Attraccess-Host hat einen Plugin-Kanal, gesetzt über die Umgebungsvariable `ATTRACCESS_PLUGIN_CHANNEL` (siehe [Umgebungsvariablen](installation/environment-variables.md#plugins)):

- **Release-Images** verwenden `latest`. Der Marktplatz zeigt und installiert die `latest`-Version, Vorabversionen werden nie automatisch installiert.
- **Nightly-Images** (`nightly-<sha>`, `nightly-latest`) verwenden `next`. Ihr Marktplatz zeigt, und eine Installation ohne gewählte Version installiert, die höhere der Versionen `next` und `latest` eines Plugins, die der Host ausführen kann. Ein Plugin ohne `next`-Build oder mit einem `next`-Build, der einen neueren Host braucht, bleibt auf `latest`. `next` zeigt auf den neuesten Nightly-Build eines Plugins, der neuer sein kann als dein Image.

Eine ausdrücklich gewählte Version (**Version verwalten** oder die API) hat immer Vorrang.

### Nightly-Hosts folgen `next`

Ein Plugin, das auf einem Nightly-Host über den Marktplatz oder über die API ohne Versionsangabe installiert wird, merkt sich `next` als gewünschte Version. Mit der Standard-Update-Regel bringen die [automatischen Updates](#automatische-updates) es dann auf den neuesten kompatiblen Build von `next` (oder von `latest`, falls höher): von Nightly zu Nightly und von einem Nightly zum Release. Nur Plugins, die `next` wünschen, werden auf Nightly-Builds gebracht. Diese Regel gilt nur, solange die globale Update-Regel nie gespeichert wurde; eine gespeicherte Regel gilt unverändert.

Auf einem Release-Host installiert die Standard-Update-Regel nie eine Vorabversion.

### Ein Plugin auf `next` umstellen

Ein Plugin, das als `latest` installiert wurde, bleibt auf `latest`, auch auf einem Nightly-Host. Zum Umstellen öffne **Einstellungen → Plugins**, öffne das Aktionsmenü (**⋯**) des installierten Plugins, wähle **Version verwalten**, trage `next` (oder eine bestimmte Nightly-Version) in das Textfeld oben ein (**Gewünschte Version oder Kanal**) und klicke auf **Versionsregel speichern**. Wähle dann die Version in der Liste darunter und klicke auf **Aktualisieren**. **Aktualisieren** allein speichert deine Eingabe nicht. Alternativ entfernst du das Plugin und installierst es erneut über den Marktplatz; seine Daten bleiben erhalten.

Sobald ein Plugin einmal released wurde, bietet der Marktplatz eines Release-Hosts nur noch released Versionen an. npm setzt `latest` bei der ersten Veröffentlichung eines Pakets automatisch; ein Plugin, das zuerst von einem Nightly veröffentlicht wird, hat deshalb bis zu seinem ersten Release ein Nightly als `latest`. Das Release behandelt ein Nightly-`latest` als „noch nie released" und veröffentlicht das Plugin.

## Automatische Updates

Attraccess hält über npm installierte Plugins aktuell. Das gilt für jeden Host, ob Release oder Nightly. Als ZIP-Datei hochgeladene Plugins werden nicht aktualisiert.

- **Prüfungen:** Der Host fragt die Registry des Plugins etwa stündlich nach neuen Versionen, und erneut, wenn das Wartungsfenster beginnt. **Einstellungen → Plugins** zeigt an, wenn ein Update verfügbar ist, das der Host selbst installieren darf; neuere Versionen, die er nie automatisch installiert (siehe unten), stehen nur unter **Version verwalten**. Mit **Alle jetzt prüfen** auf dieser Seite prüfst du sofort.
- **Wartungsfenster:** Updates werden nur in diesem Fenster installiert, standardmäßig von 03:00 bis 05:00 Uhr. Es gilt die Ortszeit des Servers; in den offiziellen Docker-Images ist das UTC, sofern du `TZ` nicht setzt.
- **Was installiert wird:** Mit der Standard-Update-Regel das neueste kompatible Patch- oder Minor-Release. Nightly-Hosts bringen außerdem Plugins, die `next` wünschen, auf Nightly-Builds, wie oben beschrieben.
- **Nie automatisch installiert:** eine neue Hauptversion, eine Version mit zusätzlichen Berechtigungen, eine als veraltet markierte Version, eine mit dem Host nicht kompatible Version, ein Update, für das weitere Plugins installiert oder geändert werden müssten, eine Version, die ein anderer npm-Benutzer veröffentlicht hat als die installierte, und jede Version aus einer Registry auf einem anderen Rechner ohne HTTPS. Solche installierst du selbst über **Version verwalten**.
- **Neustart:** Nach der Installation der fälligen Updates startet Attraccess einmal neu, um sie zu aktivieren. Lege das Fenster in eine Zeit, in der eine kurze Unterbrechung vertretbar ist.
- **Fehler:** Kann ein Update nicht installiert werden, bleibt die installierte Version bestehen, das Server-Log nennt den Grund, und Attraccess versucht diese Version frühestens nach 24 Stunden erneut. Eine neuere Version wird ohne diese Pause versucht. Wird eine neue Version installiert, lädt aber nach dem Neustart nicht, kehrt Attraccess nicht zur vorherigen Version zurück: **Einstellungen → Plugins** zeigt den Fehler, und du kannst über **Version verwalten** eine andere Version wählen. Ein späteres Update wird weiterhin automatisch installiert.
- **Audit-Log:** Jede automatische Installation, erfolgreich oder nicht, und ihre Aktivierung nach dem Neustart werden ohne Benutzer im Audit-Log festgehalten (angezeigt als **System oder anonym**).

### Automatische Updates ausschalten

Für ein einzelnes Plugin öffne **⋯ → Version verwalten**, stelle **Automatische Update-Regel des Plugins** auf **Aus** und speichere die Versionsregel. **Nur Patches** beschränkt das Plugin auf Patch-Releases.

Für die globale Update-Regel gibt es noch keine Seite in der Weboberfläche. Ein Administrator, der Plugins verwalten darf, ändert sie mit `POST /api/plugins/update-policy`:

- `{"checksEnabled": false}`: keine Update-Prüfungen und keine automatische Installation.
- `{"mode": "off"}`: Updates werden nicht automatisch installiert.
- `{"maintenanceWindow": {"startMinute": 60, "durationMinutes": 120}}`: Das Fenster läuft von 01:00 bis 03:00 Uhr.

Auf einem Nightly-Host ersetzt das Speichern eines beliebigen Teils der globalen Update-Regel, auch nur des Wartungsfensters, den unter [Nightly-Hosts folgen `next`](#nightly-hosts-folgen-next) beschriebenen Nightly-Standard. Die gespeicherte Regel installiert keine Vorabversionen, solange du nicht `"prerelease": true` sendest. Um mit einer gespeicherten Regel weiter Nightly-Builds zu folgen, sende zusätzlich `{"mode": "follow", "prerelease": true}`. Jedes Plugin folgt dann seiner gewünschten Version oder seinem Kanal.

Ein Plugin, dessen eigene Regel nicht **Globale Regel übernehmen** ist, verwendet diese anstelle des globalen Modus. Ausgeschaltete Update-Prüfungen (`checksEnabled: false`) gelten für alle Plugins.

> [!WARNING]
> Eine gewünschte Version hält ein Plugin mit **Nur Patches** oder **Patches und Minor** nicht auf dieser Version: Installierst du eine ältere Version, kann das nächste Wartungsfenster sie wieder aktualisieren. Soll ein Plugin auf seiner aktuellen Version bleiben, stelle seine automatische Update-Regel auf **Aus**. Die gewünschte Version oder der Versionsbereich beschränkt automatische Updates nur mit **Paketregel folgen**.

## Plugin hochladen

1. Oeffnen Sie **Einstellungen** in der Seitenleiste und waehlen Sie den Bereich **Plugins**
2. Klicken Sie auf die Schaltflaeche **Plugin hochladen**
3. Waehlen Sie die Plugin-Datei von Ihrem Computer aus
4. Das Plugin wird hochgeladen und erscheint in der Plugin-Liste

<!-- TODO: Screenshot des Plugin-Upload-Dialogs -->

> [!NOTE]
> Nach dem Hochladen muss das Plugin moeglicherweise erst aktiviert werden, bevor es aktiv wird. Siehe naechsten Abschnitt.

## Plugins aktivieren und deaktivieren

Plugins koennen ein- oder ausgeschaltet werden, ohne sie zu entfernen:

1. Oeffnen Sie **Einstellungen** in der Seitenleiste und waehlen Sie den Bereich **Plugins**
2. Finden Sie das Plugin in der Liste
3. Schalten Sie den **Aktivieren/Deaktivieren**-Schalter um
4. Das Plugin wird sofort aktiv oder inaktiv

<!-- TODO: Screenshot des Plugin-Aktivieren/Deaktivieren-Schalters -->

> [!WARNING]
> Das Deaktivieren eines Plugins entfernt dessen Seiten aus dem Frontend und dessen API-Endpunkte aus dem Backend. Benutzer koennen auf die vom Plugin bereitgestellten Funktionen nicht mehr zugreifen, bis es wieder aktiviert wird.

## Lizenz fehlt

Einige Plugins brauchen ein bezahltes Lizenzmodul: Das Plugin **WAGO** braucht das Modul `wago`, das Plugin
**Reservierungen** das Modul `reservations`. Die kostenlose Community-Lizenz für Privatpersonen und gemeinnützige
Organisationen (der Schlüssel für gemeinnützige Nutzung) enthält keines der beiden Module.

Deckt die Lizenz ein Plugin nicht ab, zeigt **Einstellungen → Plugins** es mit dem Status **Lizenz fehlt** und nennt,
was es braucht, zum Beispiel "Benötigt das Lizenzmodul: wago". Das Plugin wird nicht geladen: Es hat keine
Menüeinträge, Seiten, Flow-Knoten oder Hintergrundaktivität, und Attraccess zeigt dafür keine Fehlermeldung. Ein
Plugin, das es als Abhängigkeit braucht, wird ebenfalls nicht geladen und zeigt den üblichen Abhängigkeitsfehler.

Speichern Sie unter **Einstellungen → Allgemein** einen gültigen Lizenzschlüssel, der ändert, welche Plugins geladen
werden dürfen, startet Attraccess automatisch neu und das Plugin wird geladen (oder nicht mehr geladen). Das Entfernen
des Schlüssels wirkt genauso. Betrifft die Änderung kein Plugin, gibt es keinen Neustart. Ein ungültiger, abgelaufener
oder nicht prüfbarer Schlüssel löst nie einen Neustart aus, weil Attraccess damit nicht starten würde: Korrigieren Sie
zuerst den Schlüssel. Eine Lizenz, die während des Betriebs abläuft, wirkt ab dem nächsten Start. Zeigt ein Plugin
trotz gültiger Lizenz **Lizenz fehlt**, konnte die Lizenz beim Start nicht geprüft werden: Starten Sie Attraccess neu.

## Plugin entfernen

1. Öffnen Sie **Einstellungen** in der Seitenleiste und wählen Sie den Bereich **Plugins**
2. Finden Sie das Plugin in der Liste
3. Öffnen Sie das Aktionsmenü des Plugins (**⋯**) und wählen Sie **Plugin entfernen**
4. Bestätigen Sie die Entfernung

Was mit den Daten des Plugins geschieht, hängt davon ab, wie es installiert wurde. Der Bestätigungsdialog nennt den
zutreffenden Fall.

| Installiert                                   | Dateien und Registrierungen        | Tabellen und Daten                                                                                                   |
| --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Aus einer Registry (Marktplatz, npm)          | Entfernt                           | **Bleiben erhalten**, zusammen mit den Geheimnissen des Plugins. Eine erneute Installation setzt mit den Daten fort. |
| Als ZIP hochgeladen oder in den Ordner gelegt | Entfernt                           | **Werden dauerhaft gelöscht.**                                                                                       |
| Abgelehnt (etwa ein 1.x-Plugin unter 2.0)     | Entfernt, Code wird nie ausgeführt | **Bleiben erhalten.** Ein 2.0-Build des Plugins übernimmt sie später, oder Sie löschen die Tabellen von Hand.        |

> [!WARNING]
> Das Entfernen eines hochgeladenen Plugins löscht seine Daten dauerhaft. Erstellen Sie vorher ein
> [Backup](installation/backup-restore.md), wenn Sie sie noch brauchen könnten, und laden Sie die Plugin-Datei erneut
> hoch, um das Plugin wieder zu verwenden.

## Upgrade auf Attraccess 2.0

Attraccess 2.0 hat das Plugin-SDK geändert: Plugins haben keinen Datenbankzugriff mehr und halten ihre eigenen Daten in
Tabellen, die der Host verwaltet (siehe [Plugin-Speicher](plugins/plugin-storage.md)). Für 1.x gebaute Plugins werden
nicht geladen: Sie bleiben mit einem Fehler in der Plugin-Liste, der das Plugin nennt, den Grund angibt und auf die
[Umstellungsanleitung](plugins/migrating-to-2.md) verweist. Typische Gründe:

- das Plugin zielt auf das SDK 1.x (es deklariert keine Mindest-Host-Version ab `2.0.0-0`);
- es fordert die entfernte Berechtigung `DATABASE_ACCESS` an (2.0-Plugins fordern `PLUGIN_STORAGE`);
- es deklariert noch `persistence.backends` oder einen TypeORM-Migrationseintrag, oder sein Bundle importiert TypeORM
  oder einen Datenbanktreiber.

Jede 1.x-Installation hält ihre Daten in SQLite und überträgt sie beim ersten Start von 2.0 nach PostgreSQL. Dabei
werden nur die Kerndaten übernommen: Plugin-Daten werden nicht übernommen, jedes Plugin startet also mit leerem Speicher
und muss neu eingerichtet werden (siehe
[Plugin-Daten werden nicht übernommen](installation/updating.md#plugin-daten-werden-nicht-übernommen)). Installieren
Sie die 2.0-Builds nach dem Upgrade und löschen Sie die abgelehnten 1.x-Builds aus der Liste. Das Löschen eines
abgelehnten Plugins entfernt seine Dateien, ohne seinen Code auszuführen.

## Fehlerbehebung

Wenn ein Plugin nicht wie erwartet funktioniert:

- Pruefen Sie, ob das Plugin in der Plugin-Liste **aktiviert** ist
- Prüfen Sie, dass der Status nicht **Lizenz fehlt** lautet (siehe [Lizenz fehlt](#lizenz-fehlt))
- Stellen Sie sicher, dass die Umgebungsvariable `DISABLE_PLUGINS` nicht auf `true` gesetzt ist
- Pruefen Sie die Server-Logs auf Fehlermeldungen im Zusammenhang mit dem Plugin
- Kontaktieren Sie den Plugin-Entwickler fuer Unterstuetzung

## Siehe auch

- [Plugins Ueberblick](plugins/overview.md) -- Was sind Plugins?
- [Plugins entwickeln](plugins/developing-plugins.md) -- Eigene Plugins erstellen
- [Umgebungsvariablen](installation/environment-variables.md) -- Plugin-bezogene Einstellungen
