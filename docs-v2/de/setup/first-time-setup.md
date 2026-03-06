# Einrichtungsassistent

Wenn Sie Attraccess zum ersten Mal starten und noch kein Benutzerkonto existiert, werden Sie automatisch zum Einrichtungsassistenten weitergeleitet. Dieser führt Sie durch die Grundkonfiguration in vier Schritten.

## Schritt 1: Anwendungseinstellungen

<!-- TODO: Screenshot des Schritts 1 einfügen -->

| Feld | Beschreibung |
|------|-------------|
| **URL** | Die Adresse, unter der Benutzer auf Attraccess zugreifen (z.B. `https://attraccess.meine-domain.de`). Wird automatisch mit der aktuellen Browser-Adresse vorausgefüllt. |
| **Öffentliche Internet-URL** | Optional. Nur nötig, wenn externe Dienste (z.B. Zahlungsanbieter) Attraccess über eine andere URL erreichen als Ihre Benutzer. |
| **Lizenzschlüssel** | Ihr Attraccess-Lizenzschlüssel. Diesen erhalten Sie bei der Registrierung. |

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

## Nach der Ersteinrichtung

Der Einrichtungsassistent ist nur verfügbar, solange kein Benutzerkonto existiert. Nach Abschluss können Sie die Einstellungen jederzeit unter **Einstellungen** in der Seitenleiste ändern.

Empfohlene nächste Schritte:

1. [E-Mail-Vorlagen anpassen](setup/email-templates.md)
2. [Weitere Benutzer anlegen](user-management/creating-users.md)
3. [Erste Ressource erstellen](resources/creating-resources.md)
4. [SSO einrichten](user-management/sso-overview.md) (optional)
