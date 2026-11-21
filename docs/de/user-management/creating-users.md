# Benutzer anlegen
<!-- llms-description: Die Wege zu einem Benutzerkonto: Selbstregistrierung, SSO-Registrierung, Projekteinladungen und Anlegen durch einen Administrator. -->

Es gibt mehrere Wege, neue Benutzer in Attraccess anzulegen.

## Selbstregistrierung

Benutzer können sich auf der Anmeldeseite selbst registrieren:

1. Öffnen Sie die Attraccess-Anmeldeseite
2. Klicken Sie auf **Registrieren**
3. Geben Sie Benutzername, E-Mail und Passwort ein, optional auch Vor- und Nachname
4. Bestätigen Sie die E-Mail-Adresse über den zugesendeten Link

Nach der Registrierung hat der Benutzer zunächst keine Systemberechtigungen. Ein Administrator muss [Berechtigungen](user-management/permissions.md) vergeben, damit der Benutzer auf erweiterte Funktionen zugreifen kann.

## SSO-Registrierung

Wenn ein [SSO-Anbieter](user-management/sso-overview.md) konfiguriert ist, können sich Benutzer über den SSO-Anbieter anmelden. Beim ersten Login wird automatisch ein Konto erstellt. Vor- und Nachname stammen vom Identity Provider (siehe [SSO OIDC](user-management/sso-oidc.md#namen)) und werden bei jeder Anmeldung aktualisiert.

## Projekteinladungen

Benutzer können über [Projekteinladungen](projects/team-management.md) zu Attraccess eingeladen werden. Sie erhalten eine E-Mail mit einem Einladungslink.

## Namen

Vor- und Nachname sind überall optional, wo ein Konto entsteht: Selbstregistrierung, Ersteinrichtung, einzelne Einladungen, CSV-Einladungen und Anlegen durch einen Administrator. Ist ein Name gesetzt, zeigt Attraccess „Vorname Nachname" statt des Benutzernamens (z. B. in Listen, Suche, E-Mails, Benachrichtigungen und am Leser); der Benutzername erscheint dort, wo Platz ist, als Zusatztext. Ohne Namen wird wie bisher der Benutzername angezeigt. Jeder Name hat höchstens 100 Zeichen; leere Werte werden als nicht gesetzt gespeichert. Benutzer ändern ihren Namen unter **Mein Konto**, Administratoren unter **Benutzer** > Benutzer > **Profil**.

## CSV-Einladungen

Beim Einladen aus einer CSV-Datei ordnen Sie in der Feldzuordnung die Spalten für Benutzername, E-Mail und optional **Vorname** und **Nachname** zu. Die Vorschau zeigt die zugeordneten Namen. Zeilen ohne Namenswert legen Benutzer ohne Namen an.

## Benutzer als Administrator anlegen

Als Administrator mit der Berechtigung **Benutzer verwalten** können Sie Benutzer in der [Benutzerverwaltung](user-management/overview.md) verwalten.

## Siehe auch

- [Berechtigungen](user-management/permissions.md)
- [SSO Überblick](user-management/sso-overview.md)
- [Ersteinrichtung](setup/first-time-setup.md)
