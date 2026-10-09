# ATT-777 browser acceptance — Run ATT-777-7

Date: 2026-09-27

Repository: assigned `attraccess` worktree, branch `att-777`

The retained run-7 browser report and screenshots were found in the assigned workspace at `../../../../.rocky-evidence/ATT-777-current-browser-acceptance.md` and `../../../../.rocky-evidence/ATT-777-current-*.png`. The report records a local app at `http://localhost:4202` with API `http://localhost:3002`, an isolated account seeded in this worktree's `storage/attraccess.sqlite`, and a local `required_for_all` policy. It records successful login to the required gate, TOTP enrollment, and optional-prompt skip. The run database contains only local fixtures. Temporary required and optional fixture credential files were removed from the workspace after browser validation; no passwords or authenticator secrets are retained in this report or its screenshots.

The six screenshots below are copies of those run-7 captures. I inspected their rendered contents and image dimensions. Expanded captures displayed the setup secret, so the manual-key field is covered by a solid redaction block in the retained copies; the QR image was already blurred. These images preserve the actual layout and control positions while removing the credential.

## Results

1. **Required desktop, collapsed** — [01-required-desktop-collapsed.png](screenshots/01-required-desktop-collapsed.png), 1440×900. The recorded card bounds are `(464, 301.5, 512, 297)`, centered at `(720, 450)`, the viewport midpoint.
2. **Required desktop, expanded** — [02-required-desktop-expanded.png](screenshots/02-required-desktop-expanded.png), 1440×900. The recorded expanded card bounds are `(464, 63.5, 512, 773)`; the final setup button remained in the viewport.
3. **Expanded short viewport** — [03-required-short-expanded.png](screenshots/03-required-short-expanded.png), 1024×600. The recorded scroll container is 600px client height and 837px scroll height. After scrolling to 237px, the final button is fully visible at y=532–568.
4. **Expanded mobile viewport** — [04-required-mobile-expanded.png](screenshots/04-required-mobile-expanded.png), 390×667. The recorded scroll container is 667px client height and 889px scroll height. After scrolling to 222px, the final button is fully visible at y=595–635. The document width equals the viewport width, with no horizontal overflow.
5. **Required setup controls and flow** — [05-required-setup-controls.png](screenshots/05-required-setup-controls.png), 1440×900. The confirmation input and activation control are present. The retained browser report records successful valid-TOTP enrollment and that the required gate cleared.
6. **Optional prompt and skip** — [06-optional-prompt.png](screenshots/06-optional-prompt.png), 1440×900. The optional prompt and **Spaeter** action are visible. The retained browser report records that skip returned to `/resources` and cleared the setup intent.

These are current assigned-workspace results, not the screenshots from ATT-777-5 or ATT-777-6. The headless browser does not verify an OS mobile keyboard. Unauthenticated page loads recorded 401s before login and after logout; the retained report says authenticated gate and enrollment checks completed successfully.
