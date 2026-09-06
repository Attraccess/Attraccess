# Branding

Attraccess can be customized to match your organization's appearance.

## Application URL

Your Attraccess installation URL is used in emails and redirects. You can change it under **Settings** → **Application**.

## Logo and Name

The Attraccess logo and name are displayed in the sidebar and on the login page. In the current version, the default logo and the name "Attraccess" are used.

![Attraccess login with the white and teal brand theme](../_media/brand-login-desktop.png)

## Color Mode

In light mode, Attraccess uses white main backgrounds with RAL 5021 water blue (`#256D7B`) accents. Dark mode uses dark surfaces and lighter teal accents for readability. Flat surfaces, clear borders and restrained 4–6 px corners keep the interface focused on the task. Success, warning and error colors retain their meaning in both modes.

The default appearance is light, independent of your operating system's color mode. You can optionally switch to dark mode using the color-mode button on the login page, in the sidebar, or in the mobile header. Your choice is remembered in this browser for this Attraccess installation when local storage is available.

Attraccess Companion also defaults to light. Its setup wizard has a color-mode button in the top-right corner on every step and remembers its own choice locally. This preference is separate from the web app and is not synced across apps or devices. Each newly created Companion kiosk window starts in light mode with a fresh session; it does not inherit the wizard's choice.

This documentation has its own optional dark-mode toggle and remembers your choice separately.

![Resource overview with demonstration data](../_media/brand-resources-desktop.png)

The same theme adapts to smaller screens.

![Resource details in dark mode](../_media/dark-resource-details.png)

Brand assets are generated from the original mascot and vector wordmark using `node scripts/generate-brand-assets.mjs`. Run it with `--check` to verify logos, icon sizes, transparency, and maskable safe areas without changing files.

## Email Layout

The default email layout uses a white background and teal links and buttons. Updating Attraccess automatically upgrades the original, unmodified stock layout to the new branding. Customized layouts are retained.

To optionally replace a customized layout with the new default, open the global email layout editor under **Settings** → **Email** → **Layout** and choose **Reset to Default**. This replaces the stored global layout, so keep a copy of any customizations you want to retain before resetting. Individual email template content is not changed by the automatic layout upgrade or the layout reset.

## See Also

- [First-Time Setup](setup/first-time-setup.md)
- [System Settings](settings/overview.md)
- [Email Templates](setup/email-templates.md)
