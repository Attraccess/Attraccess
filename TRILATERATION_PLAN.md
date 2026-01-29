## Human Readable Summary

### Goal
Enable beacon trilateration using multiple gateways by converting RSSI measurements into distance estimates and solving for beacon position based on known gateway coordinates.

### What We Have
- Gateway-reported advertisements with `mac`, `rssi`, `ad`, and `ts`.
- HolyIOT beacon battery parsing from the `0x5242` service data block (battery percent stored).
- Beacon identifiers based on normalized MAC.
- Gateway coordinates and calibration fields added to `BleGateway` (x/y, txPowerAt1m, pathLossExponent).
- BeaconReading and BeaconPosition tables added for short-term readings and long-term position history.
- RSSI filtering (rolling median) and distance estimation stored on BeaconReading, with defaults when calibration is missing.

### What We Need Next
1. Populate gateway coordinates (x/y) in a consistent coordinate system.
2. Populate calibration parameters to convert RSSI to distance:
   - Reference RSSI at 1m (per gateway or per beacon model).
   - Path-loss exponent (per environment/gateway).
3. Run trilateration (least squares) using distances from 3+ gateways (2D) or 4+ (3D).
4. Store computed positions in BeaconPosition with residual/confidence.

### Why Calibration Is Required
RSSI varies significantly with environment, obstacles, antenna orientation, and placement. Without calibration, distance estimates and trilateration will be unstable.

### Proposed First Milestones
1. Add gateway coordinates and calibration constants to the data model. (done)
2. Store raw RSSI in BeaconReading and retain 30 days of BeaconPosition data. (done)
3. Implement RSSI filtering (median/EMA) and distance estimation. (done)
4. Implement 2D trilateration with least squares and validate with known positions.


## AI Optimized Summary (Actionable Checklist)

### Objective
Compute beacon positions via trilateration using gateway RSSI measurements.

### Inputs Required
- Gateway coordinates: `x`, `y`.
- Beacon identifiers: normalized MAC.
- RSSI samples with timestamps (stored in BeaconReading).
- Calibration params: `txPowerAt1m`, `pathLossExponent (n)` per gateway or per model.

### Processing Pipeline
1. Ingest advertisement (per gateway):
   - Record `mac`, `rssi`, `ts`, `gatewayId`.
   - Parse HolyIOT battery percent from `0x5242` service data (already implemented).
   - Persist to BeaconReading with `filteredRssi` and `distance` (short retention).
2. Filter RSSI:
   - Use rolling median or EMA per `(gatewayId, mac)`.
3. Distance estimation:
   - `distance = 10 ** ((txPowerAt1m - rssi) / (10 * n))`.
   - Use defaults when calibration is missing (e.g., `txPowerAt1m = -59`, `n = 2.0`).
4. Trilateration:
   - Use least-squares solver with 3+ gateways (2D) or 4+ (3D).
   - Reject outliers with large residuals.
5. Store result:
   - `beaconId`, `x`, `y`, optional `z`, `timestamp`, and confidence/residual.

### Data Model Additions
- Gateway: `x`, `y`, `calibration` (txPowerAt1m, n). (done)
- BeaconReading: `gatewayId`, `mac`, `rssi`, `filteredRssi`, `distance`, `ts`. (done)
- BeaconPosition: `mac`, `x`, `y`, `ts`, `residual`. (done)

### Validation
- Use fixed test beacon positions.
- Compare computed position to ground truth.
- Tune calibration values per gateway/environment.
