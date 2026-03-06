# Two-Factor Authentication

Attraccess supports two-factor authentication (2FA) via TOTP (Time-based One-Time Password). This requires an additional security code when logging in.

## How Does TOTP Work?

TOTP generates a new six-digit code every 30 seconds. You need an authenticator app on your smartphone:

- **Google Authenticator** (Android, iOS)
- **Microsoft Authenticator** (Android, iOS)
- **Authy** (Android, iOS, Desktop)
- Other TOTP-compatible apps

## Enabling 2FA

1. Log in to Attraccess
2. Navigate to **My Account**
3. In the **Security** section, find the **Two-Factor Authentication** option
4. Scan the displayed QR code with your authenticator app
5. Enter the current code from the app for confirmation
6. 2FA is now active

## Logging In with 2FA

After entering your username and password, you will be asked for the TOTP code. Enter the current six-digit code from your authenticator app.

## Disabling 2FA

1. Navigate to **My Account**
2. In the **Security** section, disable **Two-Factor Authentication**
3. Confirm with your current TOTP code

> [!WARNING]
> If you lose access to your authenticator app, you will need help from an administrator to reset 2FA.

## See Also

- [Logging In](end-user/login.md)
- [My Account](end-user/account.md)
- [Permissions](user-management/permissions.md)
