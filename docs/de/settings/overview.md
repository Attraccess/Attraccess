# Systemeinstellungen

<!-- llms-description: Administratorübersicht der Systemeinstellungen: Anwendung, Sichtbarkeit der Maschinenliste, Sichtbarkeit der Ressourcennutzung, E-Mail und weitere Einstellungen. -->

Auf der Seite Systemeinstellungen koennen Administratoren das grundlegende Verhalten der Anwendung konfigurieren. Oeffnen Sie diese ueber **Einstellungen** in der Seitenleiste.

## Einstellungen aufrufen

1. Klicken Sie auf **Einstellungen** in der Seitenleiste
2. Die Einstellungsseite oeffnet sich mit allen Konfigurationsbereichen

> [!NOTE]
> Sie benoetigen die Berechtigung **Systemkonfiguration verwalten**, um auf die Systemeinstellungen zugreifen zu koennen. Siehe [Berechtigungen](user-management/permissions.md).

<!-- TODO: Screenshot der Einstellungsseite -->

## Anwendungseinstellungen

Allgemeine Einstellungen fuer die Attraccess-Instanz:

| Einstellung                     | Beschreibung                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anwendungs-URL**              | Die URL, unter der Benutzer auf Attraccess zugreifen. E-Mail-Links werden daraus gebildet.                                                                                                                                                                                                                              |
| **Oeffentliche Internet-URL**   | Oeffentliche URL fuer externe Callbacks, z.B. Zahlungsanbieter. Nur erforderlich, wenn sie sich von der Anwendungs-URL unterscheidet.                                                                                                                                                                                   |
| **Lizenzschluessel**            | Ihr Attraccess-Lizenzschluessel.                                                                                                                                                                                                                                                                                        |
| **Standardsprache des Systems** | Deutsch oder Englisch als Ersatzsprache für übersetzte Inhalte. Eine unterstützte Benutzer- oder Browsersprache hat Vorrang. Attractap verwendet während einer Sitzung die unterstützte Sprache des Karteninhabers, sonst die Standardsprache. Auswahl bei der Ersteinrichtung; Administratoren können sie hier ändern. |

> [!TIP]
> Die meisten Einstellungen koennen auch ueber [Umgebungsvariablen](installation/environment-variables.md) konfiguriert werden. In der Oberflaeche geaenderte Einstellungen ueberschreiben die Standardwerte der Umgebungsvariablen.

## Sichtbarkeit der Maschinenliste

Unter **Allgemein** legt **Wer die Maschinenliste sehen darf** fest, wer sieht, welche Maschinen es gibt. Zum Ändern ist die Berechtigung **Systemeinstellungen verwalten** (`system.settings.manage`) nötig; jede Änderung wird im [Audit-Log](settings/audit-log.md) protokolliert.

| Option                                         | Wer eine Maschine sieht                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Alle mit „Ressourcen lesen“**                | Alle mit der Berechtigung **Ressourcen lesen** (`resources.read`) sehen alle Maschinen.                                                                                                                                                                                                                                  |
| **Nur in eine Maschine eingewiesene Personen** | Personen sehen die Maschinen, in die sie eingewiesen sind (direkt oder über eine Gruppe), die sie einweisen oder warten (direkt oder über eine Gruppe) oder die sie gerade nutzen, sowie jede Maschine, die beaufsichtigte Nutzung erlaubt oder erfordert. Niemand sonst erfährt, dass die anderen Maschinen existieren. |

Bei **Nur in eine Maschine eingewiesene Personen** bleiben Maschinen mit dem [Beaufsichtigungsmodus](resources/introductions.md#beaufsichtigungsmodus) **Beaufsichtigung erlaubt** oder **Beaufsichtigung erforderlich** für alle angemeldeten Mitglieder sichtbar. Jede Person darf eine solche Maschine mit Aufsicht nutzen; so finden auch nicht eingewiesene Personen sie und können um eine beaufsichtigte Sitzung bitten.

Standardwerte:

- **Neue Installationen** starten mit **Nur in eine Maschine eingewiesene Personen**. Ein neu registriertes Konto sieht nur die Maschinen, die beaufsichtigte Nutzung erlauben oder erfordern, bis es in eine Maschine eingewiesen wird.
- **Aktualisierte Instanzen**, die schon Konten haben, behalten **Alle mit „Ressourcen lesen“**, bis ein Administrator es ändert. Das Update speichert diesen Wert einmalig und überschreibt nie einen Wert, den Sie gesetzt haben.

In beiden Modi gilt:

- Man muss angemeldet sein. Es gibt keinen öffentlichen Modus: Abgemeldete Anfragen erhalten `401` und keine Daten.
- Alle mit **Ressourcen bearbeiten** (`resources.update`) oder **Ressourcen-Zugriff verwalten** (`resources.access.manage`) sehen alle Maschinen.
- Eine Einweisung, die bis zur Nachschulung blockiert ist, zählt weiter, damit man die Maschine sieht, auf der man nachgeschult werden muss. Eine widerrufene Einweisung verbirgt die Maschine wieder. Solange man eine Maschine nutzt, sieht man sie.
- Konten ohne **Ressourcen lesen**, zum Beispiel mit eigenen Rollen, erhalten die Ansicht **Nur in eine Maschine eingewiesene Personen** auch im Modus **Alle mit „Ressourcen lesen“**.

**Ressourcen erstellen** (`resources.create`) und **Ressourcen löschen** (`resources.delete`) erweitern die Ansicht nicht. Eine Rolle, die sie ohne **Ressourcen bearbeiten** oder **Ressourcen-Zugriff verwalten** hat, erhält die eingeschränkte Ansicht: Nach dem Anlegen einer Maschine erhält sie für diese „nicht gefunden“, bis sie eingewiesen ist, und das Löschen einer Maschine, die sie nicht sehen darf, antwortet mit „nicht gefunden“. Geben Sie einer solchen Rolle **Ressourcen bearbeiten** oder weisen Sie ihre Mitglieder in die Maschinen ein, mit denen sie arbeiten.

Eine für jemanden verborgene Maschine antwortet mit `404` (Ressource nicht gefunden), genau wie eine Maschine, die es nicht gibt, und zwar auf jeder Adresse der Maschine: Seite, Status, Nutzung, Einweisungen, Wartung, Abläufe, Formulare und Live-Aktualisierungen. Listen, die Liste der Maschinen in Benutzung, Ressourcengruppen, das Dashboard und Live-Aktualisierungen lassen sie aus, und Seitenzahlen zählen nur die Maschinen, die man sehen darf. Ressourcengruppen erscheinen nur, wenn sie eine sichtbare Maschine enthalten oder man die Gruppe einweist oder wartet oder in sie eingewiesen ist. Dasselbe gilt für die mit Attractap-Lesern verknüpften Maschinen in der Leserliste, die Maschinenlisten von Companion-Geräten und Verweise auf Maschinen in Nachrichten. Eine Kontaktanfrage an die aktuelle Person an einer verborgenen Maschine wird beantwortet, als gäbe es die Maschine nicht.

Die Sichtbarkeit der Nutzung (unten) gilt zusätzlich: Eine Maschine, die man nicht sehen darf, erscheint nie in der Liste der Maschinen in Benutzung oder in Live-Aktualisierungen, egal wie die Einstellung zur Nutzung lautet.

Auch die offiziellen Plugins befolgen die Einstellung. Eine Maschine, die nur in verborgenen Ressourcengruppen liegt, bleibt in Plugins wie bisher zusätzlich verborgen.

- **Reservierungen:** Verfügbarkeit, neue Buchungen, die Reservierungseinstellungen einer Maschine, die Verwaltungsseiten und Kalender-Feeds lassen eine verborgene Maschine aus oder antworten mit „nicht gefunden“. Wer die Reservierungen einer Maschine verwalten darf, sieht sie dadurch nicht. **Eigene Buchungen** auf einer Maschine, die verborgen wurde, bleiben erhalten: Sie stehen weiter unter **Meine Reservierungen** mit dem Maschinennamen, lassen sich öffnen und stornieren, und Ihre Kalender-Feeds enthalten sie weiter.
- **Statuswände:** Wer eine Wand einrichtet, kann nur Maschinen und Ressourcengruppen wählen, die er sehen darf, und **alle Ressourcen** braucht eine Person, deren Maschinenliste nicht eingeschränkt ist.

> [!WARNING]
> Plugins aus anderen Quellen befolgen die Einstellung nur, wenn sie die [Sichtbarkeitsmethoden des Plugin-SDK](plugins/developing-plugins.md#sichtbarkeit-von-maschinen) verwenden. Prüfen Sie sie, bevor Sie sich darauf verlassen, dass diese Einstellung Ihre Geräteliste verbirgt. Attractap-Reader-Anzeigen, Benachrichtigungen und E-Mails von Plugins schränkt diese Einstellung nicht ein.

> [!NOTE]
> Diese Stellen zeigen Maschinen bewusst unabhängig von dieser Einstellung:
>
> - **Links zu Statuswänden:** Der öffentliche Link einer Statuswand zeigt allen, die ihn haben, was für die Wand eingerichtet wurde.
> - **Projekte:** Nutzungsverlauf und Statistiken eines Projekts zeigen dessen Mitgliedern die im Projekt genutzten Maschinen. Das sind Projektdaten, die mit den Mitgliedern des Projekts geteilt werden.
> - **Berichte:** Der Berichtsexport (`resources.reports.export`, Berichte zu Sitzungen und Betriebsdauer exportieren) umfasst alle Maschinen.

> [!NOTE]
> Kiosk-Konten und gedruckte QR-Etiketten öffnen Maschinenseiten wie ein normales Konto. Bei **Nur in eine Maschine eingewiesene Personen** braucht ein Kiosk-Konto Einweisungen oder die Berechtigung **Ressourcen bearbeiten** bzw. **Ressourcen-Zugriff verwalten**, und wer ein Etikett einer Maschine scannt, in die er nicht eingewiesen ist, sieht die Seite „nicht gefunden“, es sei denn, die Maschine erlaubt oder erfordert beaufsichtigte Nutzung.

Die Einstellung wird pro API-Instanz bis zu eine Minute zwischengespeichert; bei mehreren Instanzen kann eine Änderung dort eine Minute später greifen.

## Sichtbarkeit der Ressourcennutzung

Unter **Allgemein** legt **Wer die Ressourcennutzung sehen darf** fest, wer sieht, welche Ressourcen in Benutzung sind und von wem. Zum Ändern ist die Berechtigung **Systemeinstellungen verwalten** (`system.settings.manage`) nötig; jede Änderung wird im [Audit-Log](settings/audit-log.md) protokolliert.

| Option                                         | Wer die Nutzung einer Ressource sieht                                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alle mit „Ressourcen lesen“** (Standard)     | Alle mit der Berechtigung **Ressourcen lesen** (`resources.read`).                                                                                                                                                                            |
| **Nur in die Ressource eingewiesene Personen** | Personen, die in die Ressource eingewiesen sind (direkt oder über eine Gruppe), ihre Einweiser und Wartenden sowie alle mit **Ressourcen bearbeiten** (`resources.update`) oder **Ressourcen-Zugriff verwalten** (`resources.access.manage`). |

In beiden Modi gilt:

- Man muss angemeldet sein. Abgemeldete Anfragen erhalten `401` und keine Daten.
- Die eigene laufende Sitzung sieht man immer, und Live-Aktualisierungen bleiben währenddessen geöffnet und zeigen nur diese Sitzung.
- Die Namen der Einweiser und Wartenden einer Ressource bleiben für alle mit **Ressourcen lesen** sichtbar, damit noch nicht eingewiesene Personen wissen, wen sie fragen können. E-Mail-Adressen werden nie angezeigt.

Mit **Nur in die Ressource eingewiesene Personen** sehen alle anderen die Ressource weiterhin im Katalog, aber ohne Nutzung: Sie erscheint nicht in der Liste der Ressourcen in Benutzung, Statusabfragen antworten mit `403`, und Live-Aktualisierungen werden abgelehnt. Bei Ressourcen, die [beaufsichtigte Nutzung](resources/introductions.md#beaufsichtigungsmodus) erlauben oder erfordern, sehen sie nur **Verfügbar** oder **In Benutzung**, ohne Namen.

Die Einstellung liegt in den Systemeinstellungen. Instanzen, die sie nie gesetzt haben, verhalten sich wie **Alle mit „Ressourcen lesen“**; ein Upgrade braucht also keine Migration.

> [!NOTE]
> Skripte und Plugins, die die Liste der Ressourcen in Benutzung, Einweisungen oder Einweiser ohne Anmeldung lesen, funktionieren nicht mehr. Melden Sie sich stattdessen mit einem [API-Token](developer/api-reference.md) an. Die vollständigen Einweisungs- und Einweiser-Listen sowie die Abfrage, ob eine andere Person einweisen darf, erfordern **Ressourcen bearbeiten**, **Ressourcen-Zugriff verwalten** oder die Rolle Einweiser der Ressource bzw. ihrer Gruppe.

## E-Mail-Einstellungen

Konfigurieren Sie, wie Attraccess E-Mails versendet:

| Einstellung         | Beschreibung                                  |
| ------------------- | --------------------------------------------- |
| **SMTP-Host**       | Hostname Ihres E-Mail-Servers                 |
| **SMTP-Port**       | Portnummer fuer die SMTP-Verbindung           |
| **SMTP Sicher**     | Ob TLS-Verschluesselung verwendet werden soll |
| **SMTP-Benutzer**   | Benutzername fuer die Authentifizierung       |
| **SMTP-Passwort**   | Passwort fuer die Authentifizierung           |
| **Absenderadresse** | Die "Von"-Adresse fuer ausgehende E-Mails     |

Fuer eine detaillierte Anleitung zur E-Mail-Einrichtung siehe [E-Mail / SMTP](setup/smtp-email.md).

## Weitere Einstellungen

Abhaengig von Ihrer Attraccess-Version und installierten Plugins koennen zusaetzliche Einstellungsbereiche verfuegbar sein:

- **Erscheinungsbild** -- Anpassung des Erscheinungsbilds der Anwendung. Siehe [Erscheinungsbild](setup/branding.md).
- **E-Mail-Vorlagen** -- Benachrichtigungs-E-Mails anpassen. Siehe [E-Mail-Vorlagen](setup/email-templates.md).
- **Sicherheit** -- Cookie- und Sitzungseinstellungen. Siehe [Sicherheit](settings/security.md).

## Siehe auch

- [Umgebungsvariablen](installation/environment-variables.md) -- Alle Konfigurationsoptionen
- [Ersteinrichtung](setup/first-time-setup.md) -- Erstmalige Konfiguration
- [E-Mail / SMTP](setup/smtp-email.md) -- E-Mail-Server einrichten
- [Erscheinungsbild](setup/branding.md) -- Erscheinungsbild anpassen
- [Sicherheit](settings/security.md) -- Cookie- und Sitzungssicherheit
