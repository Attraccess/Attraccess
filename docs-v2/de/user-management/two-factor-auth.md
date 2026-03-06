# Zwei-Faktor-Authentifizierung

Attraccess unterstützt Zwei-Faktor-Authentifizierung (2FA) über TOTP (Time-based One-Time Password). Damit wird ein zusätzlicher Sicherheitscode beim Anmelden verlangt.

## Wie funktioniert TOTP?

TOTP generiert alle 30 Sekunden einen neuen sechsstelligen Code. Sie benötigen eine Authenticator-App auf Ihrem Smartphone:

- **Google Authenticator** (Android, iOS)
- **Microsoft Authenticator** (Android, iOS)
- **Authy** (Android, iOS, Desktop)
- Andere TOTP-kompatible Apps

## 2FA aktivieren

1. Melden Sie sich bei Attraccess an
2. Navigieren Sie zu **Mein Konto**
3. Im Bereich **Sicherheit** finden Sie die Option **Zwei-Faktor-Authentifizierung**
4. Scannen Sie den angezeigten QR-Code mit Ihrer Authenticator-App
5. Geben Sie den aktuellen Code aus der App zur Bestätigung ein
6. 2FA ist nun aktiv

## Anmeldung mit 2FA

Nach Eingabe von Benutzername und Passwort werden Sie nach dem TOTP-Code gefragt. Geben Sie den aktuellen sechsstelligen Code aus Ihrer Authenticator-App ein.

## 2FA deaktivieren

1. Navigieren Sie zu **Mein Konto**
2. Im Bereich **Sicherheit** deaktivieren Sie die **Zwei-Faktor-Authentifizierung**
3. Bestätigen Sie mit Ihrem aktuellen TOTP-Code

> [!WARNING]
> Wenn Sie den Zugang zu Ihrer Authenticator-App verlieren, benötigen Sie die Hilfe eines Administrators, um 2FA zurückzusetzen.

## Siehe auch

- [Anmeldung](end-user/login.md)
- [Mein Konto](end-user/account.md)
- [Berechtigungen](user-management/permissions.md)
