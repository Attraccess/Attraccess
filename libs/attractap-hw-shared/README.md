# @attraccess/attractap-hw-shared

Frozen interconnect contract, JLC parts wrappers, and mechanical envelope
specification for every Attractap V2 hardware board (Core, NFC, Beeper,
PoE, DC-in, Touchscreen).

This library is the single source of truth for every board-to-board
connector pinout. Each board (Phase 2 tickets) imports the appropriate
`J_*` constant and uses `assertWiresAllSignals` to ensure every required
signal is wired — a board that omits a required net fails to compile.

## Why this exists (Phase 1)

Connector pinouts are the contract every board must obey. Freezing them
before any board pinout work prevents an N-board respin when a pin moves.
Once this library is merged, any pin reassignment requires a
**semver-major** bump on `@attraccess/attractap-hw-shared` and must be
called out in the PR description.

## Layout

```
libs/attractap-hw-shared/
  README.md              # this file
  mech-envelope.md       # per-board mechanical envelope + antenna keep-out
  CONNECTORS.md          # auto-generated pinout tables — DO NOT EDIT
  src/
    index.ts             # barrel
    connectors/          # typed pinout constants + type guard
      types.ts
      j-poe.ts
      j-pwr-dc.ts
      j-nfc.ts
      j-beep.ts
      j-disp.ts
      connectors.spec.ts # vitest unit tests
    parts/               # typed tscircuit JSX wrappers around JLC parts
      passives.tsx       # R/C/L 0402+0603
      power.tsx          # AMS1117-3.3, LM74700, MP2315
      connectors.tsx     # B2B 1.27mm, JST PH 1.25mm, FFC 0.5mm
      mcu.tsx            # ESP32-P4-MINI-1, ESP32-C6-MINI-1
      nfc.tsx            # PN532 bare-IC QFN-40 wrapper
      touch.tsx          # GT911
      leds.tsx           # WS2812 LED wrappers
      silk.tsx           # AttraccessLogo, BoardLabel, Pin1Marker
    doc-gen/
      generate.ts        # emits CONNECTORS.md from the TS source
```

## nx targets

| Target | Command |
|--------|---------|
| `test` | `pnpm nx run attractap-hw-shared:test` — vitest unit tests |
| `typecheck` | `pnpm nx run attractap-hw-shared:typecheck` — `tsc --noEmit` |
| `doc-gen` | `pnpm nx run attractap-hw-shared:doc-gen` — regenerate `CONNECTORS.md` |
| `doc-check` | `pnpm nx run attractap-hw-shared:doc-check` — fail if `CONNECTORS.md` drifts |

`doc-check` runs in CI (`hardware.yml`); a PR that edits a connector
without regenerating `CONNECTORS.md` fails the check.

## Using from a board

```tsx
import { J_NFC, assertWiresAllSignals, Pn532Ic } from '@attraccess/attractap-hw-shared';

const wires = assertWiresAllSignals(J_NFC, {
  '+3V3': 'net.v3v3',
  '+5V': 'net.v5v',
  'GND': 'net.gnd',
  'I2C_SDA': 'net.sda',
  'I2C_SCL': 'net.scl',
  'IRQ': 'net.nfc_irq',
  'RSTPDN': 'net.nfc_rstpdn',
  'LED_DATA': 'net.ring_din',
});
```

Omit a required signal and the project fails to compile.

## Bumping connector or part definitions

1. Edit the TS source under `src/connectors/` or `src/parts/`.
2. Update or add a vitest case under `src/connectors/connectors.spec.ts`.
3. Run `pnpm nx run attractap-hw-shared:doc-gen` to regenerate
   `CONNECTORS.md` and commit the diff.
4. Bump the package version in `package.json`:
   - pin reassignment, removal, or signal rename → **major**
   - additive pin/signal that previous boards can ignore → **minor**
   - notes/voltage/footprint string edits → **patch**
5. Call out the bump rationale in the PR description so downstream board
   tickets know whether they need to respin.

## Silkscreen policy

Every Attractap board must follow these silk rules so the rendered PCB
looks identifiable and uncluttered:

1. **No descriptive blurbs.** Do not use `<fabricationnotetext>` to
   restate what a part is or how it is wired. tscircuit overlays that
   text onto the board view, and 24 copies of the same blurb destroy
   readability.
2. **One board label, top-edge or bottom-edge.** Use `<BoardLabel>` with
   the project name (e.g. `ATT-350 NFC`) and revision (e.g. `v0`).
3. **Attraccess logo on every board.** Use one or two `<AttraccessLogo>`
   glyphs in free silk areas. Default scale 1.0 gives roughly a 4 mm
   tall keyhole, scale to fit the available zone.
4. **Pin-1 markers on every multi-pin connector.** Use `<Pin1Marker>`
   placed at the pin-1 pad coordinate. Refdes alone is not enough — a
   tech rotating the connector in a hurry needs a polarity dot.
5. **Hide refdes on high-density part arrays.** WS2812 ring, breakout
   pad arrays, etc. set `silkscreenTextVisibility="hidden"`. Refdes
   stays on assembly drawing where it belongs.
6. **Per-part silk outlines belong on the part wrapper**, not the
   board. WS2812 outlines, antenna body box, buzzer circle all live in
   the shared lib so every board gets the same silk for the same part.
