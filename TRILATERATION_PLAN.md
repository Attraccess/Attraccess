## Human Readable Summary

### Goal
Enable beacon trilateration using multiple gateways by converting RSSI measurements into distance estimates and solving for beacon position based on known gateway coordinates.

### What We Have
- Gateway-reported advertisements with `mac`, `rssi`, `ad`, and `ts`.
- HolyIOT beacon battery parsing from the `0x5242` service data block (battery percent stored).
- Beacon identifiers based on normalized MAC.

### What We Need Next
1. Store gateway coordinates (x/y or x/y/z) in a consistent coordinate system.
2. Collect calibration parameters to convert RSSI to distance:
   - Reference RSSI at 1m (per gateway or per beacon model).
   - Path-loss exponent (per environment/gateway).
3. Compute and store per-gateway distance estimates with timestamps.
4. Run trilateration (least squares) using distances from 3+ gateways (2D) or 4+ (3D).

### Why Calibration Is Required
RSSI varies significantly with environment, obstacles, antenna orientation, and placement. Without calibration, distance estimates and trilateration will be unstable.

### Proposed First Milestones
1. Add gateway coordinates to the data model.
2. Add calibration constants (per gateway, per beacon model) and store raw RSSI.
3. Implement RSSI filtering (median/EMA) and distance estimation.
4. Implement 2D trilateration with least squares and validate with known positions.


## AI Optimized Summary (Actionable Checklist)

### Objective
Compute beacon positions via trilateration using gateway RSSI measurements.

### Inputs Required
- Gateway coordinates: `x`, `y`, optional `z`.
- Beacon identifiers: normalized MAC.
- RSSI samples with timestamps.
- Calibration params: `txPowerAt1m`, `pathLossExponent (n)` per gateway or per model.

### Processing Pipeline
1. Ingest advertisement (per gateway):
   - Record `mac`, `rssi`, `ts`, `gatewayId`.
   - Parse HolyIOT battery percent from `0x5242` service data (already implemented).
2. Filter RSSI:
   - Use rolling median or EMA per `(gatewayId, mac)`.
3. Distance estimation:
   - `distance = 10 ** ((txPowerAt1m - rssi) / (10 * n))`.
4. Trilateration:
   - Use least-squares solver with 3+ gateways (2D) or 4+ (3D).
   - Reject outliers with large residuals.
5. Store result:
   - `beaconId`, `x`, `y`, optional `z`, `timestamp`, and confidence/residual.

### Data Model Additions
- Gateway: `x`, `y`, optional `z`, `calibration` (txPowerAt1m, n).
- BeaconReading: `gatewayId`, `mac`, `rssi`, `filteredRssi`, `distance`, `ts`.
- BeaconPosition: `mac`, `x`, `y`, `z`, `ts`, `residual`.

### Validation
- Use fixed test beacon positions.
- Compare computed position to ground truth.
- Tune calibration values per gateway/environment.
