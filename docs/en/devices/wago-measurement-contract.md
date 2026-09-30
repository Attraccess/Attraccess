# WAGO measurement wire contract

This contract covers payload encoding and parsing. It does not implement or qualify Modbus acquisition, register maps, polling, device profiles, or a working physical meter. ATT-1059 owns that work; ATT-978 owns flow filtering and cached-state freshness.

## Measurements

Publish non-retained JSON on `<prefix>/v1/controllers/<hardwareId>/measurements`:

```json
{
  "channelId": "current",
  "unit": "milliampere",
  "value": 500,
  "kind": "live",
  "timestamp": "2026-09-05T12:00:00.000Z",
  "streamId": "0feb0339-a34b-4a18-bdbe-a684a20e5396",
  "sequence": 1
}
```

`value` is a signed JavaScript safe integer, not a floating physical value. The configured transform is evaluated as `physicalValue = raw * scale + offset`, followed by `value = physicalValue * 1000`. The encoder evaluates the finite input numbers' canonical decimal strings exactly with integer arithmetic, including scientific notation. Thus `65536.001` produces exactly `65536001` milli-units, and scale/offset operations cannot introduce binary floating-point noise. There is no rounding tolerance: a genuine fractional milli-unit faults. Noise already present in a source number's canonical decimal string is not assumed to be acquisition error and is not rounded away.

| Configuration unit | Wire unit        | Example             |
| ------------------ | ---------------- | ------------------- |
| `ampere`           | `milliampere`    | 0.5 A → 500         |
| `volt`             | `millivolt`      | 230.5 V → 230500    |
| `watt`             | `milliwatt`      | -12.25 W → -12250   |
| `watt-hour`        | `milliwatt-hour` | 1234.5 Wh → 1234500 |
| `percent`          | `millipercent`   | 12.345% → 12345     |

The preferred physical resolution is 0.001 of the configured unit. The wire magnitude cannot exceed 9007199254740991. If milli conversion exceeds that limit, an exact whole physical value within the safe-integer range is emitted in its original unit (`ampere`, `volt`, `watt`, `watt-hour`, or `percent`). For example, 10000000000000 Wh emits `{ "unit": "watt-hour", "value": 10000000000000 }`. This preserves the entire previously supported safe whole-unit range, including negative values. Fractional physical values never round or truncate into this fallback: 10000000000000.25 Wh faults. Consumers must use the explicit unit for every measurement; the unit can change as the magnitude crosses the milli-unit limit.

`kind` is `live` or `cumulative`; omitted configuration kinds default to `live`. This slice does not infer cumulative rollover/reset behavior.

## Existing configurations and consumers

Persisted v1 configurations keep their existing physical unit, scale, offset, revision, and content hash. Runtime startup uses the same conversion as newly published configurations, including whole-unit overflow fallback; no database or snapshot rewrite is needed. Missing measurement transforms retain the existing percent/1/0 default. Invalid persisted units/transforms/readings fault when sampled, without publishing a measurement. Values that fit neither exact integer milli-units nor safe whole-unit fallback fail explicitly.

Wire consumers must deploy with this contract: explicit ampere/volt/watt/watt-hour/percent values are whole physical units, never milli-units. The parser allows all ten explicit units with safe-integer values; missing kinds and missing stream IDs remain invalid. The canonical timestamp field is `timestamp`, matching ATT-978 / PR1790; `sourceTimestamp` alone is rejected. It is captured immediately after each adapter read resolves, before transform and publication work (UTC ISO 8601 with milliseconds, `YYYY-MM-DDTHH:mm:ss.sssZ`). This is runtime acquisition-completion time, not read-start time, backend receipt time, or a device-internal timestamp. Backend freshness handling remains ATT-978's responsibility.

State messages retain their required `outputs` boolean map and optionally include an `inputs` boolean map for ATT-1056. Omitted `inputs` stays absent; supplied maps (including an empty map) are preserved. Null, arrays, scalars, and nonboolean entries are rejected.

## Identity and sequencing

State, measurement, fault, and acknowledgement messages all carry `timestamp`, `streamId`, and `sequence`. A runtime instance creates one random UUID shared by its categories. A restart creates a different UUID, even when restoring the same persisted configuration; reconnecting an existing instance keeps its UUID and counters.

Each topic category has an independent positive safe-integer counter starting at 1. Measurements share one counter across all channels. The consumer ordering key is `(controller, category, streamId)`, never controller alone or channel alone. Interleaved categories cannot create artificial gaps. A failed publication may consume a sequence number; a real delivery gap remains observable. State is retained; measurements, faults and acknowledgements are not. Discovery, heartbeat and configuration reporting retain their separate existing contracts.

When the stream changes, consumers must invalidate old-stream cached state and track the new stream separately. Timestamp ordering is not a replacement for stream identity. ATT-978 integrates this parser and owns duplicate/gap/freshness policy.

## Faults and validation

Measurement faults use the ordinary fault topic and envelope, with `channelId`, `code`, and `message`:

- `unknown_measurement_unit`: unsupported configured unit.
- `invalid_measurement_transform`: invalid scale/offset/kind or unrepresentable output.
- `invalid_measurement_value`: nonnumeric or nonfinite source reading.
- `measurement_read_failed`: adapter read failure.

Malformed wire measurements throw `MeasurementContractError` with code `invalid_measurement_message`; the parser does not coerce strings, booleans, missing kinds, unknown units, fractional values, or unsafe integers. Envelope validation rejects missing/invalid timestamps, empty stream IDs and nonpositive/noninteger sequences.

`backend/measurement-contract.spec.ts` exercises real runtime publication through JSON serialization into the consumer parser, persisted snapshots, restart/interleaving behavior, and simulator-format initial-value/wire fixtures for live and cumulative readings. Broker/device qualification and the runnable simulator's infrastructure remain separate integration checks.
