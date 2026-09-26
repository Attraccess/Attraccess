# ATT-777 2FA gate viewport measurements

Revalidated on 2026-09-26 from this assigned worktree using its `pnpm serve` instance at `http://localhost:4201`, with an authenticated local admin and local `required_for_all` policy. Measurements came from the rendered DOM (`getBoundingClientRect`, scroll container dimensions, and control bounds) after loading the app at each viewport and syncing the visual viewport height. The setup details were expanded with **2FA aktivieren**. Scroll positions were set on the gate's actual `overflow-y: auto` container to confirm the final control can be brought into view.

| State | Viewport | Gate bounds (x, y, width, height) | Scroll container (client / scroll height) | Final setup button after scrolling |
| --- | ---: | ---: | ---: | ---: |
| Required, collapsed | 1440 × 900 | (464, 301.5, 512, 297) | 900 / 900 | — |
| Required, expanded | 1440 × 900 | (464, 63.5, 512, 773) | 900 / 900 | top 801, bottom 837 |
| Required, expanded | 1024 × 600 | (256, 32, 512, 773) | 600 / 837 | after scrollTop 237: top 56, bottom 92 |
| Required, expanded | 390 × 667 | (16, 32, 358, 825) | 667 / 889 | after scrollTop 222: top 595, bottom 635 |

The collapsed desktop card center is y=450, matching the 900px viewport center. At constrained sizes the content exceeds the viewport and the gate container exposes vertical scrolling; after scrolling, the final button is inside the viewport. At mobile width the document width is 390px, equal to the viewport width, with no horizontal overflow.

The setup request returned successfully and exposed the manual key, confirmation code field, and disabled-until-entered **Bestätigen & aktivieren** control. The optional setup prompt was also rendered with **Spaeter**; selecting it dismissed the prompt and returned to the resources page. The test policy was restored to `required_for_all`, and the required gate was confirmed again afterward.

The browser screenshot command stalled in this environment, so these DOM measurements are the retained rendered evidence for the requested viewport states.
