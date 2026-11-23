# Benutzer anlegen

<!-- llms-description: Die Wege zu einem Benutzerkonto (Selbstregistrierung, SSO-Registrierung, Projekteinladungen, Anlegen durch einen Administrator) und was ein Konto vor der E-Mail-Bestätigung erreicht. -->

Es gibt mehrere Wege, neue Benutzer in Attraccess anzulegen.

## Selbstregistrierung

Benutzer können sich auf der Anmeldeseite selbst registrieren:

1. Öffnen Sie die Attraccess-Anmeldeseite
2. Klicken Sie auf **Registrieren**
3. Geben Sie Benutzername, E-Mail und Passwort ein, optional auch Vor- und Nachname
4. Bestätigen Sie die E-Mail-Adresse über den zugesendeten Link

Die Selbstregistrierung ist standardmäßig offen: Die Whitelist der Registrierungsdomains (**Einstellungen** > **Sicherheit** > **Erlaubte Registrierungs-Domains**) lautet `*`. Entfernen Sie `*` und tragen Sie Ihre Domains ein, um sie einzuschränken, oder lassen Sie die Liste leer, um die Selbstregistrierung abzuschalten. Siehe [Standardrichtlinie für Registrierung und Sichtbarkeit](setup/first-time-setup.md#standardrichtlinie-für-registrierung-und-sichtbarkeit).

Nach der Registrierung erhält der Benutzer die Standardrolle `user`. Sie enthält nur **Ressourcen lesen**, und was das zeigt, hängt von der [Sichtbarkeit der Maschinenliste](settings/overview.md#sichtbarkeit-der-maschinenliste) ab: Bei neuen Installationen sieht ein neues Konto nur die Maschinen, die beaufsichtigte Nutzung erlauben oder erfordern, bis es eingewiesen wird. Ein Administrator muss [Berechtigungen](user-management/permissions.md) vergeben, damit der Benutzer auf erweiterte Funktionen zugreifen kann.

### Was ein Konto vor der Bestätigung der E-Mail-Adresse erreicht

- **Anmeldung mit Passwort und mit Passkey verweigern ein Konto, dessen E-Mail-Adresse nicht bestätigt ist.** Ein selbst registriertes Konto, das seinen Link noch nicht angeklickt hat, erhält keine Sitzung und sieht daher weder Maschinen noch Daten. Es kann nur die Abläufe der Anmeldeseite nutzen, die kein Konto brauchen: E-Mail bestätigen, Bestätigungs-E-Mail erneut senden, die unbestätigte E-Mail-Adresse ändern (mit dem Passwort, nicht bei aktivierter Zwei-Faktor-Authentifizierung) und das Passwort zurücksetzen.
- **SSO-Konten können unbestätigt sein.** Meldet der Identity Provider `email_verified=false` und ist die E-Mail-Adresse noch nicht vergeben, legt die erste Anmeldung das Konto trotzdem mit unbestätigter E-Mail an und meldet es an. Es hat wie jedes andere Konto die Standardrolle `user`, dazu alle Rollen, die Ihre [Berechtigungszuordnung](user-management/sso-overview.md#berechtigungszuordnung) vergibt: Bei **Alle mit „Ressourcen lesen“** sieht es alle Maschinen, bei **Nur in eine Maschine eingewiesene Personen** nur die Maschinen, die beaufsichtigte Nutzung erlauben oder erfordern, bis es eingewiesen wird.
- **Eine geänderte E-Mail-Adresse hebt die Bestätigung auf, bestehende Sitzungen, API-Tokens und MCP-Tokens funktionieren aber weiter.** Das gilt für eine Änderung durch den Benutzer ebenso wie durch einen Administrator. Anmeldung mit Passwort und mit Passkey wird bei der nächsten Anmeldung verweigert, bis die neue Adresse bestätigt ist; die SSO-Anmeldung ist nicht betroffen.

Das beschreibt das heutige Verhalten; die Einstellung zur Sichtbarkeit der Maschinenliste ändert es nicht.

## SSO-Registrierung

Wenn ein [SSO-Anbieter](user-management/sso-overview.md) konfiguriert ist, können sich Benutzer über den SSO-Anbieter anmelden. Beim ersten Login wird automatisch ein Konto erstellt. Vor- und Nachname stammen vom Identity Provider (siehe [SSO OIDC](user-management/sso-oidc.md#namen)) und werden bei jeder Anmeldung aktualisiert.

## Projekteinladungen

Benutzer können über [Projekteinladungen](projects/team-management.md) zu Attraccess eingeladen werden. Sie erhalten eine E-Mail mit einem Einladungslink.

## Namen

Vor- und Nachname sind überall optional, wo ein Konto entsteht: Selbstregistrierung, Ersteinrichtung, einzelne Einladungen, CSV-Einladungen und Anlegen durch einen Administrator. Ist ein Name gesetzt, zeigt Attraccess „Vorname Nachname“ statt des Benutzernamens (z. B. in Listen, Suche, E-Mails, Benachrichtigungen und am Leser); der Benutzername erscheint dort, wo Platz ist, als Zusatztext. Ohne Namen wird wie bisher der Benutzername angezeigt. Jeder Name hat höchstens 100 Zeichen; leere Werte werden als nicht gesetzt gespeichert. Benutzer ändern ihren Namen unter **Mein Konto**, Administratoren unter **Benutzer** > Benutzer > **Profil**.

## CSV-Einladungen

Beim Einladen aus einer CSV-Datei ordnen Sie in der Feldzuordnung die Spalten für Benutzername, E-Mail und optional **Vorname** und **Nachname** zu. Die Vorschau zeigt die zugeordneten Namen. Zeilen ohne Namenswert legen Benutzer ohne Namen an.

## Benutzer als Administrator anlegen

Als Administrator mit der Berechtigung **Benutzer verwalten** können Sie Benutzer in der [Benutzerverwaltung](user-management/overview.md) verwalten.

## Siehe auch

- [Berechtigungen](user-management/permissions.md)
- [SSO Überblick](user-management/sso-overview.md)
- [Ersteinrichtung](setup/first-time-setup.md)
