# ATT-349 Core board — Design Rule Check

The Core board uses the **JLC 4-layer** ruleset (not the Phase-1 default
2-layer set used by Beeper / NFC / DC-in). All numbers below come from the
[JLCPCB capability sheet](https://jlcpcb.com/capabilities/pcb-capabilities)
for the 4-layer FR-4 process.

## 1. Trace / clearance

| Rule | Min | Note |
|------|-----|------|
| Trace width                       | 0.09 mm | 3.5 mil |
| Trace-to-trace clearance          | 0.09 mm | 3.5 mil |
| Trace-to-pad clearance            | 0.09 mm | 3.5 mil |
| Trace-to-board-edge clearance     | 0.30 mm | non-plated |
| Trace-to-board-edge clearance     | 0.50 mm | plated |
| Copper-to-copper clearance        | 0.09 mm | inner-layer pours |

## 2. Vias

| Rule | Min |
|------|-----|
| Via drill diameter                | 0.30 mm |
| Via outer diameter (annular ring) | 0.15 mm per side (0.60 mm total) |
| Via-in-pad                        | Allowed only for QFN-104 thermal EP, fill+plate optional |
| Microvia                          | Not used — keep cost in the standard 4-layer band |

## 3. Hole, pad, ring

| Rule | Min |
|------|-----|
| Plated hole (component lead)      | 0.30 mm |
| NPTH (mounting hole)              | 1.0 mm  |
| Pad to NPTH clearance             | 0.20 mm |
| Annular ring (PTH)                | 0.20 mm |
| Solder mask clearance             | 0.10 mm |
| Solder mask sliver                | 0.10 mm |

## 4. Silkscreen

| Rule | Min |
|------|-----|
| Silk line width                   | 0.13 mm |
| Silk text height                  | 0.80 mm |

## 5. Outline

| Rule | Value |
|------|-------|
| Outline tolerance                 | ±0.15 mm |
| Inner cutout                      | 0.80 mm radius minimum |
| V-cut / mouse bite panels         | Not requested for prototype run |

## 6. tscircuit DRC overrides

`tscircuit-cli build` defaults to JLC 2-layer. The Core board sets
4-layer rules in the `<board>` props (`layerCount={4}`) — the override
is in `index.tsx` and uses the values in §1 directly. ERC + DRC must
pass on this ruleset before the PR is mergeable; the CI check runs
`pnpm nx run attractap-hw-core:lint` which exits non-zero on any
violation.

## 7. Known violations to allow (`--ignore-warnings`)

| Warning | Reason |
|---------|--------|
| `non-tented vias on EP` | Required for QFN-104 thermal stitching |
| `slot in solder mask`   | NFC keep-out passthrough — `J_NFC` LED_DATA exits via mask slot |
