## MPR121 Keypad Calibration Wizard (Spec for Web UI)

Goal: Guide users to calibrate the capacitive keypad (MPR121) without knowing CLI. The wizard communicates over the existing serial CLI.

### Transport

- Use Web Serial (preferred) or any serial bridge at 115200 baud.
- Each command is a single line ending with `\n`.
- Responses are single-line, prefixed with `RESP`.

### Commands used

- Detect keypad: `CMND GET keypad.status`
- Dump channels: `CMND GET keypad.mpr121.dump`
- Apply thresholds (persist + live): `CMND SET keypad.mpr121.thresholds <touch> <release>`

### Response formats (examples)

- Status (MPR121):
  - `RESP get keypad.status {"configured":true,"detail":{"type":"MPR121","needsConfig":false,"thresholds":[20,10],"channels":[[1020,16],...]}}`
- Dump:
  - `RESP get keypad.mpr121.dump {"0":[1020,16],"1":[0,14],...,"11":[1020,11]}`
    - For each channel i: `[baseline,filtered]` values.
- Thresholds set:
  - `RESP set keypad.mpr121.thresholds ok 20 10`

### Key concepts

- For a channel i, the instantaneous delta is `delta_i = baseline_i − filtered_i`.
- Touch is detected when `delta_i >= touchThreshold`.
- Release when `delta_i <= releaseThreshold`.

### Wizard flow

1. Connect & detect

   - Send `keypad.status`.
   - If type != `MPR121`, show "Unsupported keypad". If `needsConfig` true, continue (still fully operable via CLI).

2. Baseline (hands-off) sampling

   - Prompt user: "Don’t touch the keypad." Countdown 3→0.
   - For ~1–2 seconds (e.g., 20 samples at 50–100 ms), call `keypad.mpr121.dump` and compute per-channel noise deltas:
     - `noise_i_sample = max(0, baseline_i − filtered_i)`
     - Track `noise95_i` as the 95th percentile or simply max if few samples.
   - Detect wired/valid channels as those with `baseline_i > 0` on most samples.

3. Per-pad pressed sampling (optional but recommended)

   - Show a 3×4 keypad layout. For each detected (wired) pad:
     - Prompt: "Press and hold pad X, then click Continue." Sample 5–10 dumps, compute `touchMin_i = min(baseline_i − filtered_i)` while pressed.
   - If the user prefers a quick setup, allow a global pressed sampling: "Press any pad" and use the smallest delta across all channels as `touchMin_global`.

4. Compute thresholds

   - Let `noiseMax = max_i(noise95_i)` over wired channels.
   - Let `pressedMin = min_i(touchMin_i)` (or `touchMin_global` if using quick setup).
   - Safety margins:
     - Ensure `pressedMin > noiseMax + margin`. Use `margin = 3` if unknown.
   - Recommend:
     - `touch = clamp(floor(max(noiseMax + margin, pressedMin * 0.25)), 8, 60)`
     - `release = clamp(floor(touch / 2), 4, touch - 1)`
   - Display computed values and allow manual tweak.

5. Apply & validate
   - Send `CMND SET keypad.mpr121.thresholds <touch> <release>`.
   - Immediately sample a few dumps while the user taps a couple of pads; show a live indicator if any channel’s `delta_i >= touch`.
   - If unstable (ghost touches), increase both thresholds slightly; if misses, decrease slightly.

### UI notes

- Channel mapping: labels 0..11 can be laid out as 3×4. Current firmware maps indices to characters as:
  - `0..11 → ['3','6','9','#','2','5','8','0','1','4','7','D']`
- Grey-out channels with persistent `baseline = 0`.
- Show mini bars per channel: current delta versus `touch`.

### Error handling

- If dump is `inactive`, still show persisted thresholds (from `keypad.mpr121.dump`) and allow applying new thresholds; no reboot is needed.
- If serial errors occur, retry the last command up to 3 times with 100 ms backoff.

### Pseudocode snippets

Collect noise (hands-off):

```
noise = [ ] // array of 12 arrays
repeat N times:
  resp = dump()
  for i in 0..11:
    base, filt = resp[i]
    if base > 0: // valid channel
      noise[i].append(max(0, base - filt))
noise95_i = percentile(noise[i], 0.95) or max(noise[i])
```

Collect pressed deltas for one pad:

```
pressedSamples = []
repeat M times while user holds pad:
  resp = dump()
  base, filt = resp[padIndex]
  pressedSamples.append(max(0, base - filt))
touchMin_i = min(pressedSamples)
```

Compute thresholds:

```
noiseMax = max(noise95_i for wired i)
pressedMin = min(touchMin_i for wired i)
margin = 3
touch = clamp(floor(max(noiseMax + margin, pressedMin * 0.25)), 8, 60)
release = clamp(floor(touch / 2), 4, touch - 1)
```

Apply:

```
send("CMND SET keypad.mpr121.thresholds %d %d\n" % (touch, release))
```

### QA checklist

- Hands-off: no false "touch" indicators.
- Single press and release are detected across all wired pads.
- Dump shows deltas comfortably above `touch` when pressed, below `release` when idle.
