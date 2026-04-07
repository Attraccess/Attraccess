# MATTER-013: Matter Flow Node Frontend Components

**Priority:** P0 — Flow Integration
**Dependencies:** MATTER-011 (event node backend), MATTER-012 (command node backend)
**Parallel with:** MATTER-014, MATTER-015, MATTER-016
**Estimated scope:** ~300 lines across 4 files

---

## Goal

Create the frontend components that render Matter device/event/command selects in the flow node editor. When a user adds a "Matter Event" or "Matter Command" node, they get dropdown selects populated with real device data and human-readable labels.

---

## Context for the Agent

### How the node editor renders form fields
**File:** `apps/frontend/src/app/resources/details/flows/node/editor/property-input/index.tsx`

The `PropertyInput` component checks the JSON Schema property's `selectFromEntity` metadata and renders a specialized component:

```typescript
if (schema.selectFromEntity === 'mqttServer') {
  return (
    <MqttServerSelect
      selectedId={value as number}
      onSelectionChange={(newValue) => onChange(newValue as TValue)}
      label={...}
      isRequired={isRequired}
    />
  );
}
```

We need to add cases for:
- `selectFromEntity: 'matterDevice'` → `MatterDeviceSelect`
- `selectFromEntity: 'matterDeviceEvent'` → `MatterEventSelect`
- `selectFromEntity: 'matterDeviceEventFilterValue'` → `MatterEventFilterSelect`
- `selectFromEntity: 'matterDeviceCommand'` → `MatterCommandSelect`

### How the MqttServerSelect works (pattern to follow)
It's a component that:
1. Fetches entities via React Query hook
2. Renders a HeroUI `Autocomplete` or `Select` with options
3. Calls `onSelectionChange(id)` when user picks one
4. Shows a "create" button (optional — not needed for Matter devices since creation is commissioning)

### API endpoints for data
From MATTER-008, these endpoints exist:
- `GET /api/matter/devices` → list devices (for device select)
- `GET /api/matter/devices/:id/available-events` → events for a device
- `GET /api/matter/devices/:id/available-commands` → commands for a device

Event filters come from the event profile data returned by available-events.

### Frontend component library
- **HeroUI** (`@heroui/react`): `Select`, `SelectItem`, `Autocomplete`, `AutocompleteItem`
- **React Query**: generated hooks in `@attraccess/react-query-client`
- **i18n**: `useTranslation()` from `react-i18next`

### Generated React Query hooks
After MATTER-005 and MATTER-008 are implemented and the API client is regenerated:
- `useMatterDevicesGetAll()` → list devices
- `useMatterDevicesGetAvailableEvents({ id })` → events for device
- `useMatterDevicesGetAvailableCommands({ id })` → commands for device

**If hooks don't exist yet**, use manual fetch with `useQuery` from `@tanstack/react-query`.

---

## Specification

### 1. MatterDeviceSelect component

**File:** `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterDeviceSelect.tsx`

```typescript
interface MatterDeviceSelectProps {
  selectedId: number | undefined;
  onSelectionChange: (id: number | undefined) => void;
  label?: string;
  ariaLabel: string;
  isRequired?: boolean;
  description?: string;
  className?: string;
}
```

- Fetch all Matter devices via React Query
- Render HeroUI `Select` (or `Autocomplete` for search)
- Each option shows: device name + device type + online/offline badge
- Empty state: "No Matter devices found. Commission a device first."
- `data-testid="matter-device-select"`

### 2. MatterEventSelect component

**File:** `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterEventSelect.tsx`

```typescript
interface MatterEventSelectProps {
  deviceId: number | undefined;
  selectedKey: string | undefined;
  onSelectionChange: (key: string | undefined) => void;
  label?: string;
  // ...
}
```

- Fetch available events for the selected device: `GET /api/matter/devices/:id/available-events`
- Render `Select` with event labels + descriptions
- Disabled when no device selected
- On device change (parent clears `selectedKey`) → clear selection
- `data-testid="matter-event-select"`

### 3. MatterEventFilterSelect component

**File:** `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterEventFilterSelect.tsx`

- Depends on selected event — shows filter values from the event's `filters` array
- Render `Select` with value labels
- Optional field — first option is "Any change (no filter)"
- Disabled when no event selected
- `data-testid="matter-event-filter-select"`

### 4. MatterCommandSelect component

**File:** `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterCommandSelect.tsx`

- Fetch available commands for the selected device: `GET /api/matter/devices/:id/available-commands`
- Render `Select` with command labels + descriptions
- When command changes, show parameter fields dynamically:
  - For each parameter in the selected command's `parameters` array
  - Render an `Input` field with the parameter's label and type
  - Support Handlebars template hints (show "Supports {{templates}}" text)
- Disabled when no device selected
- `data-testid="matter-command-select"`

### 5. Register in PropertyInput

**File:** `apps/frontend/src/app/resources/details/flows/node/editor/property-input/index.tsx`

Add before the existing `switch (schema.type)`:

```typescript
if (schema.selectFromEntity === 'matterDevice') {
  return (
    <MatterDeviceSelect
      selectedId={value as number}
      onSelectionChange={(newValue) => onChange(newValue as TValue)}
      label={!hideLabel ? t('nodes.' + nodeType + '.config.' + name + '.label') : undefined}
      ariaLabel={t('nodes.' + nodeType + '.config.' + name + '.label')}
      isRequired={isRequired}
      description={description}
    />
  );
}

if (schema.selectFromEntity === 'matterDeviceEvent') {
  // Need access to the current node data to get deviceId
  // Check how the parent component passes sibling values
  return (
    <MatterEventSelect
      deviceId={/* get from sibling field 'deviceId' */}
      selectedKey={value as string}
      onSelectionChange={(newValue) => onChange(newValue as TValue)}
      label={...}
      isRequired={isRequired}
    />
  );
}

// Similar for matterDeviceEventFilterValue and matterDeviceCommand
```

**Dependent field challenge:**
The event select depends on the device select's value. Check how the node editor passes the full node data to each property input, or if a `dependsOn` mechanism exists. If not, you may need to:
- Pass the entire `nodeData` object to `PropertyInput`
- Let dependent selects read sibling values from `nodeData`

### 6. Add i18n translations

Add translation keys for the new node types in the frontend translation files. Check the existing pattern for flow node translations (likely in `apps/frontend/src/assets/locales/`).

---

## Test Plan

**Manual testing (via preview or browser):**

1. Open flow editor for any resource
2. Open node picker → verify "Matter Event" and "Matter Command" appear
3. Add "Matter Event" node → open editor:
   - Device select shows commissioned devices with online status
   - Select a device → event select populates with events
   - Select an event → filter select shows filter values
   - Save → node data persists correctly
4. Add "Matter Command" node → open editor:
   - Device select shows devices
   - Select device → command select shows commands
   - Select command → parameter fields appear
   - Enter parameter values → save → data persists
5. Reopen saved nodes → all selections restored correctly
6. Change device → dependent selects clear and repopulate

**Automated tests (if E2E test infrastructure exists):**
- Use `data-testid` selectors to verify component rendering
- Mock API responses for device/event/command lists

---

## Security Checklist

- [ ] Device select only shows devices the user has permission to see (API handles auth)
- [ ] No sensitive device data (commissioningData) rendered in UI
- [ ] Template hints don't suggest injecting unsafe values
- [ ] `data-testid` attributes don't leak sensitive info

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterDeviceSelect.tsx` |
| **Create** | `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterEventSelect.tsx` |
| **Create** | `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterEventFilterSelect.tsx` |
| **Create** | `apps/frontend/src/app/resources/details/flows/node/editor/property-input/MatterCommandSelect.tsx` |
| **Modify** | `apps/frontend/src/app/resources/details/flows/node/editor/property-input/index.tsx` (add selectFromEntity cases) |
| **Modify** | Translation files (add node type labels) |

---

## Definition of Done

- [ ] MatterDeviceSelect shows devices with name, type, online status
- [ ] MatterEventSelect shows events based on selected device
- [ ] MatterEventFilterSelect shows filter values based on selected event
- [ ] MatterCommandSelect shows commands with parameter fields
- [ ] Dependent selects clear when parent value changes
- [ ] All selects handle loading, empty, and error states
- [ ] Node data saves and restores correctly
- [ ] Translations added for all new node types
- [ ] `data-testid` attributes on all interactive elements
