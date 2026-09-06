# Branding

Attraccess can be customized to match your organization's appearance.

## Application URL

Your Attraccess installation URL is used in emails and redirects. You can change it under **Settings** → **Application**.

## Logo and Name

The Attraccess logo and name are displayed in the sidebar and on the login page. In the current version, the default logo and the name "Attraccess" are used.

![Attraccess login with the white and teal brand theme](../_media/brand-login-desktop.png)

## Color Mode

Attraccess uses white main backgrounds with RAL 5021 water blue (`#256D7B`) accents. Flat surfaces, clear borders and restrained 4–6 px corners keep the interface focused on the task. Success, warning and error colors retain their meaning.

The default appearance is light, independent of your operating system's color mode. Attraccess Companion also uses the light theme. This documentation offers an optional dark-mode toggle and remembers your explicit choice.

![Resource overview with demonstration data](../_media/brand-resources-desktop.png)

The same theme adapts to smaller screens.

Brand assets are generated from the original mascot and vector wordmark using `node scripts/generate-brand-assets.mjs`. Run it with `--check` to verify logos, icon sizes, transparency, and maskable safe areas without changing files.

## Email Layout

The default email layout uses a white background and teal links and buttons. Updating Attraccess automatically upgrades the original, unmodified stock layout to the new branding. Customized layouts are retained.

To optionally replace a customized layout with the new default, open the global email layout editor under **Settings** → **Email** → **Layout** and choose **Reset to Default**. This replaces the stored global layout, so keep a copy of any customizations you want to retain before resetting. Individual email template content is not changed by the automatic layout upgrade or the layout reset.

## See Also

- [First-Time Setup](setup/first-time-setup.md)
- [System Settings](settings/overview.md)
- [Email Templates](setup/email-templates.md)
