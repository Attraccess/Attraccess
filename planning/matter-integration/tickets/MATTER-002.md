# MATTER-002: Device Profile Registry & Door Lock Profile

**Priority:** P0 — Foundation
**Dependencies:** None
**Parallel with:** MATTER-001, MATTER-003
**Estimated scope:** ~300 lines across 3 files

---

## Goal

Create a static registry that maps raw Matter cluster/attribute/command IDs to human-readable labels. Users should never see `clusterId: 0x0101, attributeId: 0x0000, value: 1` — they should see "Lock State: Locked". Implement the Door Lock profile as the first (and primary) profile.

---

## Context for the Agent

### Why this exists
Matter devices communicate using numeric cluster IDs, attribute IDs, and command IDs. The flow editor needs to show users friendly labels in dropdown selects like:
- **Events:** "Lock State Changed", "Door Opened/Closed", "Alarm Triggered"
- **Commands:** "Lock", "Unlock", "Unlock with Auto-Relock"
- **Filter values:** "Locked", "Unlocked", "Unlatched"

### Where this fits
This module has NO dependencies on database entities or the Matter controller. It's pure TypeScript data definitions + lookup functions. It will be consumed by:
- The commissioning service (to label discovered devices)
- The flow node schema API (to populate dropdowns)
- The command execution service (to resolve command keys → cluster/command IDs)
- The subscription manager (to resolve event keys → cluster/attribute IDs)

### Project structure
- Backend: NestJS app in `apps/api/`
- This code goes in: `apps/api/src/matter/profiles/`

---

## Specification

### 1. Define profile type interfaces

**File:** `apps/api/src/matter/profiles/types.ts`

```typescript
export interface MatterDeviceProfile {
  deviceTypeId: number;
  deviceTypeName: string;
  icon: string; // lucide-react icon name
  events: MatterEventProfile[];
  commands: MatterCommandProfile[];
  attributes: MatterAttributeProfile[];
}

export interface MatterEventProfile {
  key: string;                    // e.g., "doorLock.lockState"
  label: string;                  // e.g., "Lock State Changed"
  description: string;            // e.g., "Fires when the lock state changes"
  clusterId: number;              // e.g., 0x0101
  type: 'attribute' | 'event';    // Matter subscription type
  attributeId?: number;           // for attribute-based events
  eventId?: number;               // for Matter event-based events
  filters: MatterEventFilter[];
}

export interface MatterEventFilter {
  key: string;                    // e.g., "lockState"
  label: string;                  // e.g., "Lock State"
  values: MatterEventFilterValue[];
}

export interface MatterEventFilterValue {
  value: string;                  // e.g., "locked" (stored in flow node data)
  label: string;                  // e.g., "Locked" (shown in UI)
  rawValue: number | boolean;     // actual Matter value for comparison
}

export interface MatterCommandProfile {
  key: string;                    // e.g., "doorLock.lock"
  label: string;                  // e.g., "Lock"
  description: string;
  clusterId: number;
  commandId: number;
  parameters: MatterCommandParameter[];
}

export interface MatterCommandParameter {
  name: string;                   // e.g., "pinCode"
  label: string;                  // e.g., "PIN Code"
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  default?: string | number | boolean;
  description?: string;
}

export interface MatterAttributeProfile {
  key: string;                    // e.g., "doorLock.lockState"
  label: string;                  // e.g., "Lock State"
  clusterId: number;
  attributeId: number;
  type: 'enum' | 'boolean' | 'number' | 'string';
  valueMap?: Record<number, string>; // enum value → label
  unit?: string;                  // e.g., "°C", "%"
}
```

### 2. Create the profile registry

**File:** `apps/api/src/matter/profiles/registry.ts`

```typescript
import { MatterDeviceProfile, MatterEventProfile, MatterCommandProfile, MatterAttributeProfile } from './types';

// Registry: deviceTypeId → profile
const profiles = new Map<number, MatterDeviceProfile>();

export function registerProfile(profile: MatterDeviceProfile): void {
  profiles.set(profile.deviceTypeId, profile);
}

export function getProfileByDeviceType(deviceTypeId: number): MatterDeviceProfile | undefined {
  return profiles.get(deviceTypeId);
}

export function getEventByKey(deviceTypeId: number, eventKey: string): MatterEventProfile | undefined {
  return getProfileByDeviceType(deviceTypeId)?.events.find(e => e.key === eventKey);
}

export function getCommandByKey(deviceTypeId: number, commandKey: string): MatterCommandProfile | undefined {
  return getProfileByDeviceType(deviceTypeId)?.commands.find(c => c.key === commandKey);
}

export function getAttributeByKey(deviceTypeId: number, attributeKey: string): MatterAttributeProfile | undefined {
  return getProfileByDeviceType(deviceTypeId)?.attributes.find(a => a.key === attributeKey);
}

export function resolveHumanValue(deviceTypeId: number, attributeKey: string, rawValue: number | boolean): string {
  const attr = getAttributeByKey(deviceTypeId, attributeKey);
  if (!attr) return String(rawValue);
  if (attr.type === 'boolean') return rawValue ? 'Yes' : 'No';
  if (attr.type === 'enum' && attr.valueMap) return attr.valueMap[rawValue as number] ?? String(rawValue);
  return String(rawValue);
}

export function getAllProfiles(): MatterDeviceProfile[] {
  return Array.from(profiles.values());
}
```

### 3. Create Door Lock profile

**File:** `apps/api/src/matter/profiles/door-lock.profile.ts`

This is the primary profile. Define it based on Matter spec cluster `0x0101` (Door Lock).

**Events to define:**

| Key | Label | Source | Type | Filters |
|-----|-------|--------|------|---------|
| `doorLock.lockState` | Lock State Changed | Cluster 0x0101, Attr 0x0000 | attribute | Locked (1), Unlocked (2), Not Fully Locked (0), Unlatched (3) |
| `doorLock.doorState` | Door Opened/Closed | Cluster 0x0101, Attr 0x0003 | attribute | Open (0), Closed (1), Jammed (2), Forced Open (3) |
| `doorLock.lockOperation` | Lock Operation Completed | Cluster 0x0101, Event 0x02 | event | (no value filter — fires on every operation) |
| `doorLock.lockOperationError` | Lock Operation Failed | Cluster 0x0101, Event 0x03 | event | (no value filter) |
| `doorLock.alarm` | Alarm Triggered | Cluster 0x0101, Event 0x00 | event | (no value filter) |

**Commands to define:**

| Key | Label | Cluster | Command ID | Parameters |
|-----|-------|---------|------------|------------|
| `doorLock.lock` | Lock | 0x0101 | 0x00 | pinCode (string, optional) |
| `doorLock.unlock` | Unlock | 0x0101 | 0x01 | pinCode (string, optional) |
| `doorLock.unlockWithTimeout` | Unlock with Auto-Relock | 0x0101 | 0x03 | timeout (number, required, default 30, description "Seconds until auto-relock"), pinCode (string, optional) |

**Attributes to define (for display / value resolution):**

| Key | Label | Cluster | Attr ID | Type | Value Map |
|-----|-------|---------|---------|------|-----------|
| `doorLock.lockState` | Lock State | 0x0101 | 0x0000 | enum | {0: "Not Fully Locked", 1: "Locked", 2: "Unlocked", 3: "Unlatched"} |
| `doorLock.doorState` | Door State | 0x0101 | 0x0003 | enum | {0: "Open", 1: "Closed", 2: "Jammed", 3: "Forced Open", 4: "Unknown"} |
| `doorLock.actuatorEnabled` | Motor Enabled | 0x0101 | 0x0002 | boolean | |
| `doorLock.operatingMode` | Operating Mode | 0x0101 | 0x0025 | enum | {0: "Normal", 1: "Vacation", 2: "Privacy", 3: "No Remote Lock", 4: "Passage"} |

**Register:** Call `registerProfile(doorLockProfile)` at the end of the file.

### 4. Create index that loads all profiles

**File:** `apps/api/src/matter/profiles/index.ts`

```typescript
// Import profile files to trigger registration
import './door-lock.profile';

// Re-export registry functions and types
export * from './types';
export * from './registry';
```

---

## Test Plan

```bash
# Run unit tests
pnpm nx test api --testFile=apps/api/src/matter/profiles/registry.spec.ts --no-cache
```

**Create test file:** `apps/api/src/matter/profiles/registry.spec.ts`

Tests to write:
1. `getProfileByDeviceType(0x000A)` returns the door lock profile
2. `getProfileByDeviceType(0x9999)` returns undefined (unknown type)
3. `getEventByKey(0x000A, 'doorLock.lockState')` returns the lock state event with correct filters
4. `getEventByKey(0x000A, 'nonexistent')` returns undefined
5. `getCommandByKey(0x000A, 'doorLock.lock')` returns correct cluster/command IDs
6. `getCommandByKey(0x000A, 'doorLock.unlock')` has optional pinCode parameter
7. `getCommandByKey(0x000A, 'doorLock.unlockWithTimeout')` has required timeout parameter with default 30
8. `resolveHumanValue(0x000A, 'doorLock.lockState', 1)` returns "Locked"
9. `resolveHumanValue(0x000A, 'doorLock.lockState', 2)` returns "Unlocked"
10. `resolveHumanValue(0x000A, 'doorLock.lockState', 99)` returns "99" (fallback for unknown value)
11. `resolveHumanValue(0x000A, 'doorLock.actuatorEnabled', true)` returns "Yes"
12. Door lock profile has `icon: 'lock'`
13. All event filter values have both `value` (string) and `rawValue` (number) defined
14. All command parameters have `type`, `required`, and `label` defined

---

## Security Checklist

- [ ] No sensitive data in profiles (these are static definitions, not device-specific)
- [ ] `rawValue` in filter values is used only for server-side comparison — never exposed to frontend as "the value to send"
- [ ] Command keys are safe static strings (no user input, no template interpolation)

---

## Files to Create

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/profiles/types.ts` |
| **Create** | `apps/api/src/matter/profiles/registry.ts` |
| **Create** | `apps/api/src/matter/profiles/door-lock.profile.ts` |
| **Create** | `apps/api/src/matter/profiles/index.ts` |
| **Create** | `apps/api/src/matter/profiles/registry.spec.ts` |

---

## Definition of Done

- [ ] Profile types are defined with clear TypeScript interfaces
- [ ] Door lock profile covers all 5 events, 3 commands, 4 attributes listed above
- [ ] Registry lookup functions work correctly (by device type, event key, command key)
- [ ] `resolveHumanValue` maps all enum values correctly with fallback
- [ ] All unit tests pass
- [ ] No runtime dependencies on Matter library or database — pure TypeScript data
