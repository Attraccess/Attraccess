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

**X11 input grab:**
The Electron kiosk window covers the primary display and separate dark-overlay windows
cover secondary displays. `XGrabKeyboard`/`XGrabPointer` are not used — Electron's
fullscreen + always-on-top + registered global shortcuts block the common escape paths.
A determined local user with physical access could switch virtual terminals (`Ctrl+Alt+Fx`);
this is by design — companion-app locking is a software convenience, not a physical
security measure.

**Autostart:**
Two entries are installed on first registration:
- `~/.config/autostart/attraccess-companion.desktop` (XDG autostart — GNOME, KDE, XFCE, …)
- `~/.config/systemd/user/attraccess-companion.service` (systemd user session — requires `loginctl --user enable` or `systemctl --user enable attraccess-companion` on the first run)
