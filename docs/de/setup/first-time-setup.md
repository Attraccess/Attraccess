# Einrichtungsassistent
<!-- llms-description: Führt durch den Einrichtungsassistenten beim ersten Start: Anwendungs- und E-Mail-Einstellungen, Administrator-Konto, E-Mail-Bestätigung sowie Standardrichtlinie für Registrierung und Sichtbarkeit. -->

Wenn Sie Attraccess zum ersten Mal starten und noch kein Benutzerkonto existiert, werden Sie automatisch zum Einrichtungsassistenten weitergeleitet. Dieser führt Sie durch die Grundkonfiguration in vier Schritten.

## Schritt 1: Anwendungseinstellungen

<!-- TODO: Screenshot des Schritts 1 einfügen -->

| Feld | Beschreibung |
|------|-------------|
| **URL** | Die Adresse, unter der Benutzer auf Attraccess zugreifen (z.B. `https://attraccess.meine-domain.de`). Wird automatisch mit der aktuellen Browser-Adresse vorausgefüllt. |
| **Öffentliche Internet-URL** | Optional. Nur nötig, wenn externe Dienste (z.B. Zahlungsanbieter) Attraccess über eine andere URL erreichen als Ihre Benutzer. |
| **Lizenzschlüssel** | Ihr Attraccess-Lizenzschlüssel, einschließlich des speziellen Schlüssels für zulässige nicht-kommerzielle Nutzung. Siehe [Aktivierung](getting-started/overview.md#aktivierung). |

> [!NOTE]
> Die URL ist wichtig für Weiterleitungen nach der SSO-Anmeldung und für Links in E-Mails. Stellen Sie sicher, dass sie korrekt ist.

## Schritt 2: E-Mail-Einstellungen

<!-- TODO: Screenshot des Schritts 2 einfügen -->

Attraccess benötigt einen E-Mail-Server, um Registrierungs-E-Mails, Passwort-Zurücksetzungen und Einladungen zu versenden.

| Feld | Beschreibung |
|------|-------------|
| **Dienst** | `SMTP` (beliebiger E-Mail-Server) oder `Outlook365` |
| **Server** | Hostname Ihres SMTP-Servers (z.B. `smtp.gmail.com`) |
| **Port** | SMTP-Port (typisch: `587` für STARTTLS, `465` für SSL) |
| **Verschlüsselung** | TLS-Verschlüsselung aktivieren |
| **Benutzer** | SMTP-Anmeldename |
| **Passwort** | SMTP-Passwort |
| **Absender-Adresse** | Die E-Mail-Adresse, die als Absender erscheint |

> [!TIP]
> Bei der Auswahl von `Outlook365` werden Server, Port und Verschlüsselung automatisch eingestellt. Sie müssen nur Benutzer, Passwort und Absender angeben.

## Schritt 3: Administrator-Konto erstellen

<!-- TODO: Screenshot des Schritts 3 einfügen -->

Erstellen Sie Ihr erstes Benutzerkonto. Dieses wird Ihr Administrator-Konto.

| Feld | Anforderung |
|------|-------------|
| **Benutzername** | 3–32 Zeichen, Buchstaben, Zahlen, Unterstriche, Bindestriche und Punkte |
| **E-Mail** | Gültige E-Mail-Adresse |
| **Passwort** | Mindestens 8 Zeichen |
| **Passwort bestätigen** | Muss mit dem Passwort übereinstimmen |

## Schritt 4: E-Mail-Bestätigung

Nach der Registrierung erhalten Sie eine Bestätigungs-E-Mail. Klicken Sie auf den Link in der E-Mail, um Ihr Konto zu verifizieren.

Danach können Sie sich anmelden und mit der Konfiguration von Attraccess beginnen.

## Standardrichtlinie für Registrierung und Sichtbarkeit

Entscheiden Sie das, bevor Sie die Instanz für Personen öffnen. Die Standardwerte und was daraus für den Datenschutz folgt:

| Richtlinie                          | Standard                                                                                                                                                                                                                                                       | Wo ändern                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Selbstregistrierung**             | Offen. Die Whitelist der Registrierungsdomains ist `*`, jede Person kann also mit beliebiger E-Mail-Adresse ein Konto anlegen. Entfernen Sie `*` und tragen Sie Ihre Domains ein, um das einzuschränken; eine leere Liste schaltet die Selbstregistrierung ab. | **Einstellungen** > **Sicherheit** > **Erlaubte Registrierungs-Domains**  |
| **Sichtbarkeit der Maschinenliste** | **Nur in eine Maschine eingewiesene Personen** bei neuen Installationen. Von einer früheren Version aktualisierte Instanzen behalten **Alle mit „Ressourcen lesen“**, bis ein Administrator es ändert.                                                         | **Einstellungen** > **Allgemein** > **Wer die Maschinenliste sehen darf** |

Jedes neue Konto erhält die Standardrolle `user`, die nur **Ressourcen lesen** enthält. Was dieses Konto sieht, hängt von der Sichtbarkeit der Maschinenliste ab:

- Bei **Nur in eine Maschine eingewiesene Personen** sieht ein neues Konto keine Maschinen, bis jemand es einweist. Ihre Ausstattung bleibt Außenstehenden unbekannt.
- Bei **Alle mit „Ressourcen lesen“** und offener Selbstregistrierung kann jede Person ein Konto anlegen und Ihre gesamte Geräteliste lesen. Das verrät Außenstehenden, welche Maschinen Ihre Werkstatt hat und welche nicht. Behandeln Sie das als personenbezogene und betriebliche Daten, für die Sie verantwortlich sind: Schränken Sie die Registrierungsdomains ein oder wechseln Sie zu **Nur in eine Maschine eingewiesene Personen**.

Die genauen Regeln stehen unter [Sichtbarkeit der Maschinenliste](settings/overview.md#sichtbarkeit-der-maschinenliste); was ein Konto vor der Bestätigung seiner E-Mail-Adresse kann, steht unter [Benutzer anlegen](user-management/creating-users.md#was-ein-konto-vor-der-bestätigung-der-e-mail-adresse-erreicht).

## Nach der Ersteinrichtung

Der Einrichtungsassistent ist nur verfügbar, solange kein Benutzerkonto existiert. Nach Abschluss können Sie die Einstellungen jederzeit unter **Einstellungen** in der Seitenleiste ändern.

Empfohlene nächste Schritte:

1. [E-Mail-Vorlagen anpassen](setup/email-templates.md)
2. [Weitere Benutzer anlegen](user-management/creating-users.md)
3. [Erste Ressource erstellen](resources/creating-resources.md)
4. [SSO einrichten](user-management/sso-overview.md) (optional)
