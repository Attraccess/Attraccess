# Logging In

This page explains the different ways to log in to Attraccess.

## Login with Username and Password

1. Open Attraccess in your browser
2. Enter your **username or email address**
3. Enter your **password**
4. Click **Log In**

<!-- TODO: Screenshot of login page -->

## Login with SSO

If your workshop has configured a Single Sign-On (SSO) provider, you will see additional buttons on the login page (e.g., "Log in with Google" or "Log in with Keycloak").

1. Click the **SSO button** for your provider
2. You will be redirected to your provider's login page
3. Log in with your provider credentials
4. You will be redirected back to Attraccess

<!-- TODO: Screenshot of SSO buttons on login page -->

## Two-Factor Authentication (2FA)

If two-factor authentication is enabled on your account, you will be asked for an additional code after entering your password.

1. Enter your username and password as usual
2. Open your **authenticator app** (e.g., Google Authenticator, Microsoft Authenticator, Authy)
3. Enter the **six-digit code** displayed in the app
4. Click **Verify**

> [!NOTE]
> The code changes every 30 seconds. Make sure to enter the current code. If the code is rejected, wait for the next one and try again.

## Register a New Account

If self-registration is enabled, you can create a new account:

1. Click **Register** on the login page
2. Fill in your details (name, email, password)
3. Click **Create Account**
4. You may need to verify your email address before you can log in

> [!NOTE]
> Some workshops disable self-registration. In that case, ask your administrator to create an account for you.

## Forgot Password

If you have forgotten your password:

1. Click **Forgot Password** on the login page
2. Enter your **email address**
3. Click **Send Reset Link**
4. Check your email for a password reset link
5. Click the link and set a new password

> [!WARNING]
> If you do not receive the email, check your spam folder. If the problem persists, contact your workshop administrator.

## See Also

- [My Account](end-user/account.md) – Manage your account settings
- [Using Resources](end-user/using-resources.md) – Start using machines and tools
- [Two-Factor Authentication](user-management/two-factor-auth.md) – Set up 2FA
