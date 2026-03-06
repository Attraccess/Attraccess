# Häufige Probleme

Diese Seite listet häufig auftretende Probleme und deren Lösungen auf.

## SSO-Anmeldung schlägt fehl

**Symptom:** Nach Klick auf die SSO-Schaltfläche werden Sie zum Anbieter weitergeleitet, aber nach der Anmeldung sind Sie nicht bei Attraccess eingeloggt, oder es erscheint eine Fehlermeldung.

**Mögliche Ursachen und Lösungen:**

| Ursache | Lösung |
|---------|--------|
| HTTPS nicht konfiguriert | SSO erfordert HTTPS. Richten Sie SSL/TLS für Ihre Attraccess-Instanz ein. Siehe [SSL einrichten](installation/ssl-setup.md). |
| Falsche Callback-URL | Die im SSO-Anbieter konfigurierte Callback-URL muss exakt mit Ihrer Attraccess-URL übereinstimmen. Prüfen Sie die Anbieter-Einstellungen. |
| Uhr nicht synchron | OIDC- und SAML-Tokens sind zeitempfindlich. Stellen Sie sicher, dass die Serveruhr synchronisiert ist (NTP verwenden). |
| Cookie-SameSite-Einstellung | Bei der Einstellung "strict" können SSO-Weiterleitungen fehlschlagen. Ändern Sie die Cookie-SameSite-Einstellung in den Systemeinstellungen auf "lax". |

## E-Mails werden nicht gesendet

**Symptom:** Benutzer erhalten keine Passwort-Zurücksetzen-E-Mails, Bestätigungs-E-Mails oder andere Benachrichtigungen.

**Mögliche Ursachen und Lösungen:**

| Ursache | Lösung |
|---------|--------|
| SMTP nicht konfiguriert | Konfigurieren Sie Ihre SMTP-Einstellungen im Admin-Panel. Siehe [E-Mail / SMTP](setup/smtp-email.md). |
| Falsche SMTP-Zugangsdaten | Überprüfen Sie, ob SMTP-Host, Port, Benutzername und Passwort korrekt sind. |
| Firewall blockiert | Stellen Sie sicher, dass Ihr Server den SMTP-Server auf dem konfigurierten Port erreichen kann (typischerweise 587 oder 465). |
| E-Mails im Spam | Prüfen Sie den Spam-/Junk-Ordner des Empfängers. |

> [!TIP]
> Zum Testen können Sie [Mailpit](https://mailpit.axllent.org/) als lokales E-Mail-Test-Tool verwenden, um zu überprüfen, ob Attraccess E-Mails korrekt versendet.

## Zugriff auf Ressource nicht möglich

**Symptom:** Sie sehen eine Ressource, können aber keine Nutzungssitzung starten.

**Mögliche Ursachen und Lösungen:**

| Ursache | Lösung |
|---------|--------|
| Keine Einweisung | Sie benötigen eine Sicherheitseinweisung, bevor Sie die Ressource nutzen können. Fragen Sie einen autorisierten Einweiser in Ihrer Werkstatt. |
| Ressource in Wartung | Die Ressource ist möglicherweise vorübergehend für Wartungsarbeiten nicht verfügbar. Prüfen Sie den Ressourcenstatus auf der Detailseite. |
| Ressource in Benutzung | Eine andere Person nutzt möglicherweise die Ressource. Warten Sie, bis deren Sitzung beendet ist. |

## Passwort vergessen

**Symptom:** Sie können sich nicht anmelden, weil Sie Ihr Passwort vergessen haben.

**Lösung:**

1. Klicken Sie auf der Anmeldeseite auf **Passwort vergessen**
2. Geben Sie Ihre E-Mail-Adresse ein
3. Prüfen Sie Ihre E-Mails auf einen Link zum Zurücksetzen
4. Legen Sie ein neues Passwort fest

Wenn Sie die E-Mail zum Zurücksetzen nicht erhalten, wenden Sie sich an Ihren Werkstattadministrator. Dieser kann Ihr Passwort für Sie zurücksetzen.

## NFC-Karte wird nicht erkannt

**Symptom:** Das Halten Ihrer NFC-Karte an den Attractap-Leser funktioniert nicht.

**Mögliche Ursachen und Lösungen:**

| Ursache | Lösung |
|---------|--------|
| Karte nicht registriert | Stellen Sie sicher, dass Ihre NFC-Karte in Attraccess registriert ist. Prüfen Sie unter **Mein Konto > NFC-Karten** oder fragen Sie Ihren Administrator. |
| Leser offline | Der Attractap-Leser ist möglicherweise getrennt oder offline. Prüfen Sie, ob die Status-LED eine Verbindung anzeigt. |
| Falscher Kartentyp | Nur kompatible NFC-Karten funktionieren mit dem Attractap-Leser. Wenden Sie sich an Ihren Administrator für eine kompatible Karte. |
| Karte beschädigt | Der NFC-Chip in der Karte könnte beschädigt sein. Versuchen Sie eine andere Karte oder bitten Sie um Ersatz. |

## Datenbankprobleme

**Symptom:** Attraccess startet nicht oder zeigt Datenbankfehler an.

**Mögliche Ursachen und Lösungen:**

| Ursache | Lösung |
|---------|--------|
| Speicherberechtigungen | Stellen Sie sicher, dass das Verzeichnis `storage/` (oder das Docker-Volume) die korrekten Lese-/Schreibberechtigungen hat. |
| Festplatte voll | Prüfen Sie, ob der Server genügend freien Speicherplatz für die SQLite-Datenbankdatei hat. |
| Beschädigte Datenbank | Stellen Sie ein Backup wieder her. Siehe [Backup & Wiederherstellung](installation/backup-restore.md). |

## Siehe auch

- [Glossar](faq/glossary.md) – In Attraccess verwendete Begriffe
- [E-Mail / SMTP](setup/smtp-email.md) – E-Mail-Konfiguration
- [SSL einrichten](installation/ssl-setup.md) – HTTPS-Konfiguration
- [SSO-Überblick](user-management/sso-overview.md) – Single-Sign-On-Einrichtung
