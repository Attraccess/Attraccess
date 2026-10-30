# WAGO safety boundary and wording checklist

The WAGO integration controls outputs for **operational** purposes. It is not a safety function, and no part of it
has been qualified on physical hardware. This page is the single reference for that boundary. Reviewers use the
checklist below to confirm that every place that states the boundary says the same thing, in English and German.

## The boundary

1. **Not safety rated.** The CC100 runtime, the plugin, the guards, the feedback checks and the disconnect policies
   are not emergency stops, personnel protection, or a replacement for certified safety circuits.
2. **Safety circuits stay independent.** Official emergency-stop and safety circuits must remain wired and working
   without Attraccess.
3. **Operational controls only.** Guards, enable requests, feedback timeouts and disconnect policies (`hold`,
   `immediate`, `watchdog`) reduce operational mistakes. They do not make an output safe.
4. **Physical use is unqualified until ATT-984.** The supported-hardware claim covers a CC100 `751-9301` with firmware 31
   only as far as software fixtures and the documented lab exercises show. Hardware acceptance is
   [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).
5. **A simulator is not hardware.** Simulator, fixture and reliability-harness results are labelled as such and are
   never evidence about a physical controller.
6. **Ready is not qualified.** Container start, a fresh heartbeat and a matching configuration prove software state.
   Physical qualification is a separate, human step.
7. **Modbus profiles are unqualified.** The built-in profiles are references until isolated hardware evidence exists.
8. **Installation is destructive.** Commissioning replaces the controller software and permanently disables CODESYS.
   Attraccess does not back up, preserve or restore anything that was on the controller before.
9. **No production-ready claim.** Penetration testing and an external safety review have not been performed.
   See [threat model and pen-test brief](wago-threat-model.md).
10. **Deferred capabilities are not advertised.** Qualification of all four package assemblies, billing, telemetry
    history and arbitration are deferred and must not be described as available.

## Reviewer checklist

For each statement, confirm the wording at every location still matches the boundary above, and that the German text
carries the same meaning (not a softer one). `EN` and `DE` entries live in `apps/plugins/wago/frontend/src/`.

| # | Statement | Where it appears |
| --- | --- | --- |
| 1 | Not safety rated, not an emergency stop or personnel protection | [commissioning](wago-cc100-commissioning.md#safety-boundary), [runtime](wago-cc100-runtime.md#safety-boundary), `HARDWARE.md`, `cc100-runtime/manifest.json` (`safetyRated: false`), `package.json` description, `channels.en.json` / `channels.de.json` (`safetyHint`) |
| 2 | Safety circuits stay independent | [acceptance evidence](wago-acceptance-evidence.md), [runtime](wago-cc100-runtime.md#physical-verification-checklist) |
| 3 | Guards, enable requests, disconnect policies are operational only | [runtime](wago-cc100-runtime.md#broker-loss), `channels.*.json` (`guardHint`, `safetyHint`), `presets.*.json` (`guarded-enable-request`) |
| 4 | Physical use unqualified until ATT-984 | [commissioning](wago-cc100-commissioning.md), [runtime](wago-cc100-runtime.md), [production support](wago-production-support.md), `HARDWARE.md`, `manifest.json` (`releaseRequirement`), `commissioning.*.json` (`physicalQualification`), `managed-runtime.*.json` (`physical`) |
| 5 | A simulator is not hardware | `README.simulator.md`, [threat model](wago-threat-model.md), [production support](wago-production-support.md) |
| 6 | Ready is not qualified | [commissioning](wago-cc100-commissioning.md), [FW31 support](wago-fw31-support.md), [credential rotation](wago-credential-rotation.md), [audit integration](wago-audit-integration.md) |
| 7 | Modbus profiles are unqualified | `HARDWARE.md`, [measurement contract](wago-measurement-contract.md), `modbus.*.json` (`readonly`) |
| 8 | Installation is destructive; no backup or restore | [commissioning](wago-cc100-commissioning.md), `commissioning.*.json` (`destructiveDescription`, `approveInstall`), `security.*.json` (`codesysActive`) |
| 9 | No pen test or external review yet | [threat model](wago-threat-model.md), [production support](wago-production-support.md) |
| 10 | Deferred capabilities are not advertised | [acceptance evidence](wago-acceptance-evidence.md), [production support](wago-production-support.md) |

### Audit record

The ATT-988 audit covered `docs/en/devices/wago-*.md`, `HARDWARE.md`, `README.simulator.md`, the frontend EN and DE
strings, `package.json`, `plugin.json` and `manifest.json`. It changed:

- **Backup wording (EN and DE).** `destructiveDescription` told operators to "back up existing applications", which
  reads as if Attraccess supports that. It now says Attraccess does not back up or restore them and that the operator
  must save what they need. The German text previously used "sichere", which means both "back up" and "secure"; it now
  says it explicitly.
- **Privileged mode.** The runtime page described `privileged: true`. The manifest declares `privileged: false`; the
  page now says the manual `--privileged` commands are the historical baseline, not the supported path.
- **Hardware profile name.** `HARDWARE.md` and the commissioning platform page named `...-digital-v1`; the manifest
  names `...-digital-rtu-v1`. Both now match.
- **Package description.** `package.json` called the plugin "Official ... integration" with no boundary; it now
  states operational control only and not yet qualified for physical use.

`plugin.json` carries no descriptive claims and needed no change. `manifest.json` already states
`safetyRated: false` and the ATT-984 release requirement.
