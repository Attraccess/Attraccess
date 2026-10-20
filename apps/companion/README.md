# Attraccess Companion

Desktop companion app for Attraccess. Runs on Windows, macOS, and Linux.

Built with [Electron](https://www.electronjs.org/).

## Dev setup

```bash
# Install dependencies (from repo root)
pnpm install

# Typecheck
pnpm nx run companion:typecheck

# Lint
pnpm nx run companion:lint

# Build (produces packaged binary in apps/companion/dist/)
pnpm nx run companion:build
```

## Architecture

- `src/main.ts` — Electron main process (Node.js)
- `src/preload.ts` — Preload script (context bridge)
- `src/index.html` — Renderer entry point

## Platform lock mechanisms

| Platform | OS lock | Overlay |
|----------|---------|---------|
| Windows | `LockWorkStation()` via rundll32 | Electron kiosk fullscreen |
| macOS | `CGSession -suspend` | Electron kiosk fullscreen |
| Linux | `loginctl lock-session` → `xdg-screensaver lock` (fallback) | Electron kiosk fullscreen |

### Linux — known limitations

**Wayland:**
`loginctl lock-session` requires the compositor to implement `ext-session-lock-v1`.
This works on GNOME (mutter ≥ 43), KDE Plasma 5.27+, and sway with swaylock installed.
Compositors that do not implement the protocol (older GNOME, some tiling WMs) will not
respond to `loginctl lock-session`. In that case the Electron kiosk overlay is still
shown as the authoritative lock, but the desktop remains accessible until the user
switches back to the overlay.

**X11 VT switch blocking:**
The companion attempts to block virtual-terminal switching (`Ctrl+Alt+Fx`) by calling
`VT_LOCKSWITCH` (Linux kernel ioctl) via a short-lived `python3` helper that holds
the lock for the duration of the session and calls `VT_UNLOCKSWITCH` on exit.
This requires `CAP_SYS_TTY_CONFIG` on the process; without it the attempt fails
gracefully and the Electron kiosk overlay remains the authoritative lock.
On Wayland with `ext-session-lock-v1` (GNOME ≥ 43, KDE Plasma 5.27+, sway)
`loginctl lock-session` delegates to the compositor, which blocks VT switching at the
Wayland protocol level — no extra capability needed.
`Ctrl+Alt+F1`–`F12` are additionally registered as global shortcuts; this is effective
on Wayland compositors that surface them to the application layer.

**Autostart:**
Two entries are installed on first registration:
- `~/.config/autostart/attraccess-companion.desktop` (XDG autostart — GNOME, KDE, XFCE, …)
- `~/.config/systemd/user/attraccess-companion.service` (systemd user session — requires `loginctl --user enable` or `systemctl --user enable attraccess-companion` on the first run)

## Approving a new companion

The main process generates a cryptographically random `XXX-XXX` code and rotates it every 30 seconds using a monotonic clock. The setup window shows the code and a type-specific `attraccess-enroll:v1:companion:ABC-123` QR code. In Attraccess, sign in with `resources.update`, open Devices → Companion App, choose Add companion, enter or scan the current code, then explicitly approve. Scanning never navigates or approves by itself.

The server holds only bounded pending connection state before approval, without creating a device or issuing credentials. Only a version-1 response echoing the current code on the active connection is persisted in the OS credential store. Disconnect, expired code or collision requires the current code; server restart requires reconnect. Already registered companions reconnect with saved credentials. Upgrade older unregistered clients to version 1.9.0 or later; automatic registration is no longer supported.

Approval must reach the server process owning the device socket. Pending state is not shared across replicas. The connection and approval limits, recovery after uncertain delivery and exact browser-origin configuration are documented in `docs/en/attractap/setup.md` and `docs/en/settings/security.md`. Local enrollment, password sign-in and reconnect require only the local server. External SSO and online license services retain their own network requirements.
