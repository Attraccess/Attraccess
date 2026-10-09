# ATT-777 browser acceptance — Run ATT-777-6

Date: 2026-09-26

Repository: assigned `attraccess` worktree on branch `att-777`

Frontend/API: `http://localhost:4211` / `http://localhost:3011`

## Isolated fixtures

Started the repository's `pnpm serve` launcher with `STORAGE_ROOT` set to this worktree's `storage/` directory. Created unique required, optional, and layout accounts in that local SQLite database with the supported `pnpm seed:dev` script; every fixture used a distinct username and email and a locally generated password. Credentials were held in mode-0600 files outside the repository during the run and removed after browser checks. No external account or database was used.

Set the local auth policy to `required_for_all` for the required setup and layout checks. In a fresh browser login, the required fixture reached the org-wide setup gate. A successful TOTP enrollment changed `/api/auth/two-factor` to `enabled: true`, `required: true`, `policy: required_for_all`, and the gate cleared.

For the optional prompt check, set the local policy to `optional`, signed in with a separate unenrolled fixture, and set the same `twoFactorSetupIntent` session-storage item used by the registration flow. The optional prompt rendered. Clicking **Spaeter** returned to `/resources`, removed the setup-intent item, and hid the prompt. Restored the run database policy to `required_for_all` and verified the final value.

## Rendered layout checks

1. **Required desktop, collapsed** — [01-required-desktop-collapsed.png](screenshots/01-required-desktop-collapsed.png), 1440×900. The gate measured 512×297 at `(464, 301.5)`, placing its center at `(720, 450)`, the viewport midpoint.
2. **Required desktop, expanded** — [02-required-desktop-expanded.png](screenshots/02-required-desktop-expanded.png), 1440×900. Setup controls remained inside the viewport; the final button was at y=800.5–836.5. The manual key is masked and the QR image is hidden in expanded screenshots.
3. **Expanded short viewport** — [03-required-short-expanded.png](screenshots/03-required-short-expanded.png), 1024×600. The scroll container measured 600 client height and 837 scroll height. After scrolling to 237, the final button was at y=532–568.
4. **Expanded mobile viewport** — [04-required-mobile-expanded.png](screenshots/04-required-mobile-expanded.png), 390×667. The scroll container measured 667 client height and 889 scroll height. After scrolling to 222, the final button was at y=595–635. Document width remained 390px, with no horizontal overflow.
5. **Required setup controls and flow** — [05-required-setup-controls.png](screenshots/05-required-setup-controls.png), 1440×900. The manual key is masked and QR image hidden. The confirmation input and activation control were present; valid TOTP enrollment succeeded and cleared the required gate.
6. **Optional prompt and skip** — [06-optional-prompt.png](screenshots/06-optional-prompt.png), 1440×900. The optional setup prompt and **Spaeter** action were visible; skip cleared the setup intent and returned to `/resources`.

All screenshots were captured from the current worktree's running app and use fresh local accounts. The prior run's evidence remains historical and is not used to establish these results.
