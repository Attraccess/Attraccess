# ATT-880 review prototype

Throwaway, isolated LVGL layouts and a self-contained clickable storyboard.
Not included in production firmware, desktop, or frontend builds. No API calls,
database persistence, NFC access, or physical commands.

Run from the repository root:

```sh
bash apps/attractap/firmware/prototypes/att-880/run.sh
```

Open `output/ATT-880-prototype.html` by double-clicking. It embeds all 34 native
480 x 480 PNG frames and works offline. Guided paths and the all-states gallery
use representative fixed fixtures rather than a live firmware session. The
side-panel controls simulate authentication and server responses. Some existing
details controls are shown for context; their full behavior is outside this
storyboard.

`output/02-authentication.png` through `05-session-and-setup.png` show every
state. `01-flow.png` is a compact overview; individual numbered PNGs are also
available. `main.cpp` uses production LVGL 9.3, display theme, fonts, and image
assets. Ancillary forms/details layouts are representative prototype layouts.

The final ticket comments take precedence over its original action order:
details left, Start/Stop right, equal flush halves on every authenticated row,
no selected-row highlight, no authenticated logo, and a shared logout/user/timer
row. Resource-first navigation, a direct door-open action, and keeping the list
for a one-resource reader are explicitly exposed as review choices.

Validation performed: standalone target builds and renders; all native frames
were reviewed in contact sheets; generated JavaScript passes parsing. Browser
automation could not open the local HTML because the browser URL policy rejected
the file URL. The storyboard has not been verified in a live browser or on a
physical device. Production implementation awaits the user's prototype review.
