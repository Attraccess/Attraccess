# Positioning Optimization Plan

This plan targets the positioning accuracy issues discussed: calibration quality, coordinate consistency, noisy RSSI-to-distance conversion, timing/windowing, and general robustness/perf. It is written to be human-friendly and also machine-readable for execution tracking.

---

## Human-Friendly Overview

### Goals
- Improve position accuracy by tightening assumptions around calibration, coordinates, and timing.
- Reduce noise and outliers before trilateration.
- Make the system easier to debug and verify in the field.

### High-Impact Actions (in order)
3. **Validate timestamp units**  
   Confirm whether `advertisement.ts` is in ms or seconds and adjust handling.
4. **Improve distance stability**  
   Add outlier filtering and basic weighting (by RSSI variance or calibration age).
5. **Tighten the recency window**  
   Reduce the time window for mixing readings if beacons move.
6. **Add health monitoring**  
   Emit diagnostics on inputs (distance errors, residuals, stale data).

---

## AI-Readable Execution Plan (Structured)

### PLAN_METADATA
- plan_id: "positional-tracking-accuracy-optimization"
- owner: "positional-tracking"
- scope: "apps/api/src/resources/positional-tracking/positional-tracking.service.ts"
- status: "draft"

### TASKS

#### TASK 3: Admin Calibration UI + API
- id: PT-008
- priority: high
- type: product+api
- goal: "Provide admin-friendly calibration flow with saved results"
- steps:
  - Add API endpoints to create/read/update calibration data per gateway.
  - Expose calibration history (timestamped samples or last updated).
  - Add a calibration workflow in the debug UI (reuse debug page for now).
  - Include guided steps: pick gateway, set distance(s), start sampling, compute txPower/n, save.
  - Display validation feedback (sample count, variance, residual estimates).
- success_criteria:
  - Admins can calibrate a gateway end-to-end without touching the DB.
  - Saved calibration values are immediately used in positioning.

#### TASK 4: Timestamp Unit Verification
- id: PT-003
- priority: high
- type: validation
- goal: "Ensure observed timestamps are correct"
- steps:
  - Inspect gateway payload docs or sample data to confirm `advertisement.ts` unit.
  - If unit is seconds, convert to ms before creating Date.
  - Add a sanity check to flag timestamps older than 24h from now.
- success_criteria:
  - No negative or multi-day deltas in observedAt vs current time.

#### TASK 5: Distance Stabilization
- id: PT-004
- priority: high
- type: algorithm
- goal: "Reduce outliers and noisy distances"
- steps:
  - Track RSSI variance per gateway + beacon.
  - Apply simple outlier rejection (e.g., discard distances beyond 2-3x median).
  - Weight trilateration equations by inverse variance or calibration age.
- success_criteria:
  - Residuals drop by >20% in static tests.

#### TASK 6: Recency Window Tuning
- id: PT-005
- priority: medium
- type: parameter
- goal: "Avoid mixing stale readings"
- steps:
  - Measure typical inter-arrival times from gateways.
  - Reduce `recentReadingWindowMs` to the 90th percentile of arrival gaps.
  - Ensure minimum of 3 gateways still typically contribute.
- success_criteria:
  - Static positions stabilize; moving beacons show less lag/error.

#### TASK 7: Diagnostics & Debugging Improvements
- id: PT-006
- priority: medium
- type: observability
- goal: "Make accuracy failures visible"
- steps:
  - Log per-sample residuals or distance errors.
  - Expose gateway calibration age and RSSI variance in debug stream.
  - Add warnings when solver returns null or residual above threshold.
- success_criteria:
  - Operators can identify bad gateways or stale calibration within minutes.

#### TASK 8: Performance & Memory Hygiene
- id: PT-007
- priority: low
- type: maintenance
- goal: "Prevent long-term memory drift"
- steps:
  - Add periodic pruning of `rssiWindowByKey` and `lastPositionAtByBeacon`.
  - Cache gateway/topic lookups to reduce DB hits per message.
- success_criteria:
  - Memory usage remains flat over prolonged runs; DB hits reduced.

---

## Notes / Assumptions
- Positioning remains 2D; adding Z-axis would require schema changes and UI updates.
- Calibrations are gateway-specific; beacon tx power variance is assumed constant per model.
- RSSI-based ranging limits cannot be fully eliminated; goal is to reduce error, not remove it.

