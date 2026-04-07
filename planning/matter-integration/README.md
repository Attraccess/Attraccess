# Matter Device Integration — Ticket Plan

**Created:** 2026-04-06
**Goal:** Add Matter smart home protocol support to Attraccess — commission devices, control them via flows, react to sensor/state data.
**Reference devices:** Nuki Smart Lock 4.0 Pro (Matter-over-Thread), SMLIGHT SLZB-06M (Thread Border Router)

## User Flow

1. Admin opens Attraccess → navigates to **Matter Devices**
2. Clicks "Add Device" → scans Matter QR code or enters 11-digit manual code
3. Backend commissions the device onto the Attraccess fabric → device enrolled
4. Admin opens flow editor on a Resource → adds **Matter Event** node (e.g., "Lock State Changed" on device X)
5. Admin adds **Matter Command** node (e.g., "Unlock" on device Y) — all fields are human-readable selects
6. Flows fire automatically on device events and execute commands
7. No direct device-resource linking — the flow graph **is** the relationship

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Matter library | `@matter/main` v0.12.x | Only viable pure-TS Matter stack; Apache-2.0; actively maintained by Nabu Casa |
| QR scanner | `html5-qrcode` | Apache-2.0; camera + file upload; 200k weekly downloads |
| Controller role | Attraccess API = Matter Controller | Server-side commissioning, centralized management |
| Commissioning transport | On-network (IP/mDNS) primary; BLE for Thread devices | IP for Wi-Fi/Ethernet; BLE required for Thread device initial commissioning |
| Thread Border Router | OTBR in Docker + SLZB-06M as RCP | Full API control; PoE Ethernet simplifies deployment; OTBR REST API on port 8081 |
| Auth model | Device management = admin-only; flow execution = trusted | Matches MQTT server pattern |
| Flow nodes | `input.matter.event` + `output.matter.command` | Matches existing node type pattern |

## Tickets

Each ticket is **self-contained** — includes all context needed for an AI agent to implement it independently.

### Foundation (no dependencies — start all in parallel)

| ID | Title | File |
|----|-------|------|
| MATTER-001 | [Database entities & migrations](./tickets/MATTER-001.md) | MatterFabric + MatterDevice entities |
| MATTER-002 | [Device profile registry & Door Lock profile](./tickets/MATTER-002.md) | Human-readable label mappings |
| MATTER-003 | [Setup code parsing service](./tickets/MATTER-003.md) | QR + manual code parser |

### Core Services (depend on MATTER-001)

| ID | Title | File |
|----|-------|------|
| MATTER-004 | [MatterModule & ControllerService](./tickets/MATTER-004.md) | Module skeleton, fabric lifecycle, config |
| MATTER-005 | [Matter CRUD API & device management](./tickets/MATTER-005.md) | List/get/update/delete endpoints |

### Device Interaction (depend on MATTER-004)

| ID | Title | File |
|----|-------|------|
| MATTER-006 | [Commissioning service & API](./tickets/MATTER-006.md) | Commission + introspect + decommission |
| MATTER-007 | [Connection manager service](./tickets/MATTER-007.md) | Persistent CASE sessions, reconnect |
| MATTER-008 | [Command execution service](./tickets/MATTER-008.md) | Send commands, audit logging |
| MATTER-009 | [Subscription manager & event emission](./tickets/MATTER-009.md) | Attribute/event subscriptions |

### Flow Nodes — Backend (depend on MATTER-002 + MATTER-009 / MATTER-008)

| ID | Title | File |
|----|-------|------|
| MATTER-011 | [Matter Event flow node — backend](./tickets/MATTER-011.md) | Schema, executor handler, event listener |
| MATTER-012 | [Matter Command flow node — backend](./tickets/MATTER-012.md) | Schema, executor handler, rate limiting |

### Flow Nodes — Frontend (depend on MATTER-011 / MATTER-012)

| ID | Title | File |
|----|-------|------|
| MATTER-013 | [Matter flow node frontend components](./tickets/MATTER-013.md) | Device select, event select, command select |

### Frontend Pages (depend on MATTER-005 + MATTER-006)

| ID | Title | File |
|----|-------|------|
| MATTER-014 | [Matter Devices page & routing](./tickets/MATTER-014.md) | List page, sidebar nav, route guards |
| MATTER-015 | [QR scanner component](./tickets/MATTER-015.md) | Camera scan + manual entry |
| MATTER-016 | [Commissioning wizard modal](./tickets/MATTER-016.md) | Multi-step pairing UI |

### Thread Border Router (depend on MATTER-004)

| ID | Title | File |
|----|-------|------|
| MATTER-019 | [Thread Border Router entity & OTBR client](./tickets/MATTER-019.md) | TBR entity, OTBR REST API client, dataset management |
| MATTER-020 | [SLZB-06 integration service](./tickets/MATTER-020.md) | Auto-discovery, firmware mode detection, health monitoring |
| MATTER-021 | [OTBR Docker container management](./tickets/MATTER-021.md) | docker-compose service, auto-start, RCP connection |
| MATTER-022 | [Thread Border Router frontend](./tickets/MATTER-022.md) | TBR management page, setup wizard, network status |
| MATTER-023 | [Thread-aware commissioning](./tickets/MATTER-023.md) | BLE commissioning path, Thread credential injection |

### Integration & Hardening

| ID | Title | File |
|----|-------|------|
| MATTER-018 | [Virtual device integration test suite](./tickets/MATTER-018.md) | Full cycle test with virtual lock |

## Dependency Graph

```
MATTER-001 ──┬── MATTER-004 ──┬── MATTER-006
             │                ├── MATTER-007 ── MATTER-009 ──┐
             │                └── MATTER-008 ────────────────┤
             └── MATTER-005                                  │
                                                             │
MATTER-002 ──────────────────────────────────────────────────┤
                                                             │
MATTER-003 ── MATTER-006                                     │
                                                             │
                                              MATTER-011 ◄───┘
                                              MATTER-012 ◄── MATTER-008 + MATTER-002
                                              MATTER-013 ◄── MATTER-011 + MATTER-012
                                                             │
MATTER-014 ◄── MATTER-005                                    │
MATTER-015 (no deps)                                         │
MATTER-016 ◄── MATTER-006 + MATTER-015                       │
MATTER-018 ◄── MATTER-009 + MATTER-011 + MATTER-012          │
                                                             │
MATTER-019 ◄── MATTER-001 + MATTER-004                       │
MATTER-020 ◄── MATTER-019                                    │
MATTER-021 ◄── MATTER-019                                    │
MATTER-022 ◄── MATTER-019 + MATTER-020                       │
MATTER-023 ◄── MATTER-006 + MATTER-019                       │
```

**No device-resource FK.** Devices are not linked to resources via a database relationship. All device↔resource associations are expressed through flow nodes. This keeps the architecture consistent: flows are the single source of truth for all device control and state reactions.

## Threat Analysis Summary

See each ticket's **Security Checklist** section. Key threats addressed:

| Threat | Severity | Mitigation | Ticket |
|--------|----------|------------|--------|
| Fabric key compromise | CRITICAL | Encrypt at rest via EncryptionService | MATTER-001, MATTER-004 |
| Unauthorized commissioning | CRITICAL | Admin-only API + Matter PKI (DAC verification) | MATTER-006 |
| Unauthorized commands | CRITICAL | Admin-only direct API + flow scoping + command validation | MATTER-008, MATTER-012 |
| Setup code leakage | HIGH | Memory-only, never logged/persisted | MATTER-003, MATTER-006 |
| Template injection in commands | HIGH | Static command key + parameter sanitization | MATTER-012 |
| Device flooding (DoS) | HIGH | Rate limiting + loop detection | MATTER-012 |
| Untraced physical access | HIGH | Audit trail + LockOperation event subscription | MATTER-008, MATTER-009 |
| Privilege escalation via flows | HIGH | Admin-only flow editing + rate limiting + command validation | MATTER-011, MATTER-012 |
| Thread network key compromise | CRITICAL | Encrypted at rest, admin-only API, never in logs | MATTER-019 |
| Rogue TBR on network | HIGH | TBR registry + validation, OTBR dataset pinning | MATTER-019 |
| SLZB-06 firmware tampering | MEDIUM | TLS firmware checks, admin-only management | MATTER-020 |
| OTBR container escape | MEDIUM | Minimal privileges, network isolation | MATTER-021 |

## Library Evaluation

| Package | License | Status | Purpose |
|---------|---------|--------|---------|
| `@matter/main` | Apache-2.0 | Active, maintained by Nabu Casa | Matter controller/commissioner |
| `@matter/node` | Apache-2.0 | Active | Node.js networking bindings |
| `@matter/types` | Apache-2.0 | Active | Typed cluster definitions |
| `html5-qrcode` | Apache-2.0 | Active, ~200k/week downloads | QR code camera scanning |
| `openthread/otbr` | BSD-3-Clause | Active, official Google OTBR | Thread Border Router Docker image |

All npm dependencies are pure TypeScript (no native/C++ binaries) and use permissive licenses. The OTBR Docker image is BSD-3-Clause licensed.

## Hardware Reference

| Device | Role | Connection | Notes |
|--------|------|------------|-------|
| SMLIGHT SLZB-06M/MU | Thread RCP (802.15.4 radio) | Ethernet (PoE) or USB | Must be switched to Thread RCP firmware via web UI |
| Bluetooth USB adapter | BLE commissioning for Thread devices | USB | Required only for Thread device commissioning (not for Wi-Fi/Ethernet devices) |
| OTBR container | Thread Border Router software | Docker, connects to SLZB-06 via TCP | `docker-compose.thread.yml` |
