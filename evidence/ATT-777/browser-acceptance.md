# ATT-777 browser acceptance

Date: 2026-09-26  
Worktree: assigned `ATT-777-5` workspace  
Frontend/API: `http://localhost:4201` / `http://localhost:3001`

## Fixture account and policy

Created the required-gate fixture in the run database at `storage/attraccess.sqlite` with the repository's supported `pnpm seed:dev` script. The command used a unique username and email (`att777-review-20260926` and `att777-review-20260926@example.test`) and a locally generated random password. The password was held in a mode-0600 temporary file only for seeding and browser login, then deleted; it is not recorded here. The seed script created the local-password account, marked its email verified, and assigned the administrator role.

Set the local `setting` row `(parent='auth', key='two_factor_policy')` to `required_for_all` in this run database. In a fresh agent-browser session, authenticated as the fixture account and confirmed the app rendered the required 2FA setup gate. The authenticated `GET /api/auth/two-factor` response was `enabled: false`, `required: true`, `policy: required_for_all` before setup.

For the optional-prompt check, seeded a second account with distinct username and email using the same supported script and another locally generated password. Set the run database policy to `optional`, set the same setup-intent session key used by the registration flow, authenticated as this unenrolled account, and confirmed the prompt rendered. Clicking “Spaeter” dismissed it, cleared the setup intent, and returned to `/resources`. Restored the run database policy to `required_for_all` after the check and verified its final value. Reused this account to capture the setup-controls screenshot with the manual key visually masked, then completed its required enrollment too; its gate cleared successfully.

## Six screenshot-backed checks

1. **Required gate, desktop collapsed** — [01-required-desktop-collapsed.png](screenshots/01-required-desktop-collapsed.png), 1440×900. Gate bounds were `(x=464, y=301.5, width=512, height=297)`, centered at the viewport midpoint `(720, 450)`.
2. **Required gate, desktop expanded** — [02-required-desktop-expanded.png](screenshots/02-required-desktop-expanded.png), 1440×900. The expanded content remained inside the viewport and retained horizontal centering.
3. **Expanded gate, short viewport** — [03-required-short-expanded.png](screenshots/03-required-short-expanded.png), 1024×600. The gate's vertical scroll container had client height 600 and scroll height 837. After scrolling to `scrollTop=237`, the confirmation control was fully visible at y=532–568.
4. **Expanded gate, mobile** — [04-required-mobile-expanded.png](screenshots/04-required-mobile-expanded.png), 390×667. The gate's vertical scroll container had client height 667 and scroll height 889. After scrolling to `scrollTop=222`, the confirmation control was visible at y=595–635. Document width was 390px, equal to the viewport; there was no horizontal overflow.
5. **Required setup controls and enrollment flow** — [05-required-setup-controls.png](screenshots/05-required-setup-controls.png), 1440×900. The setup exposed the manual-key field (its value is visually masked in the screenshot), confirmation input, and confirmation button. Generated a current TOTP from the field's value, submitted it, and verified the authenticated status changed to `enabled: true` while `required: true` and `policy: required_for_all`; the gate then cleared.
6. **Optional prompt and skip** — [06-optional-prompt.png](screenshots/06-optional-prompt.png), 1440×900. The unenrolled account saw the optional setup prompt and its “Spaeter” action. Skip dismissed the prompt and cleared the setup intent.

The earlier [viewport-layout.md](viewport-layout.md) remains historical DOM-measurement evidence. This document records the fresh-account browser run and the requested screenshots.
