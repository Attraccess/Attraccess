# MATTER-014: Matter Devices Page & Routing

**Priority:** P1 — Frontend
**Dependencies:** MATTER-005 (device CRUD API exists)
**Parallel with:** MATTER-015, MATTER-016, MATTER-011, MATTER-012
**Estimated scope:** ~200 lines across 3 files

---

## Goal

Create the Matter Devices list page in the frontend — accessible from the sidebar, showing all commissioned devices with status, linked resource, and management actions.

---

## Context for the Agent

### Routing pattern
**File:** `apps/frontend/src/app/routes/index.tsx`

Routes are defined as `RouteConfig[]` objects:
```typescript
const coreRoutes: RouteConfig[] = [
  {
    path: '/resources',
    element: <ResourceOverview />,
    authRequired: true,
  },
  // ...
];
```

`authRequired` can be `true` (any logged-in user), `false`, or a permission string like `'canManageResources'`.

### Sidebar navigation
Check how existing pages like "Attractap Readers" are added to the sidebar. Look in `apps/frontend/src/app/` for a navigation/sidebar component that maps routes to menu items.

### List page pattern — Attractap
**File:** `apps/frontend/src/app/attractap/AttractapList/index.tsx`

The Attractap list page shows device cards with:
- Device name, firmware version, connection status
- Actions: edit, delete
- "Add Reader" button

Follow this pattern for the Matter device list.

### Component library
- `@heroui/react`: `Card`, `CardBody`, `CardHeader`, `Chip`, `Button`, `Tooltip`
- `lucide-react` icons: use `Lock`, `Wifi`, `WifiOff`, `Cpu`, `Unplug` as appropriate
- `@tanstack/react-query`: generated hooks for API calls

### Generated API hooks (after MATTER-005 regeneration)
- `useMatterDevicesGetAll()` → list devices
- `useMatterDevicesUpdateOne()` → update device name
- `useMatterHealthCheck()` → controller status

---

## Specification

### 1. Create device list page

**File:** `apps/frontend/src/app/matter/index.tsx`

- Page header: "Matter Devices" with subtitle showing controller status (from health endpoint)
- "Add Device" button → opens commissioning modal (MATTER-016, for now just a placeholder/disabled button)
- Device cards in a grid layout:
  - **Device name** (editable on click or via edit button)
  - **Device type** with icon (e.g., Lock icon + "Door Lock")
  - **Vendor / Product** (e.g., "Nuki Smart Lock 4.0 Pro")
  - **Status badge**: green "Online" / red "Offline" using HeroUI `Chip`
  - **Linked resource**: resource name with link to `/resources/:id`, or "Not linked" in muted text
  - **Last seen**: relative timestamp (e.g., "2 minutes ago")
  - **Actions**: Edit name, Link/Unlink resource, Refresh, Remove (with confirmation)
- Empty state: illustration + "No Matter devices yet. Add your first device to get started."
- Error state: show error message from API
- Loading state: skeleton cards

### 2. Create device card component

**File:** `apps/frontend/src/app/matter/DeviceCard.tsx`

Separate component for reuse and testing:
```typescript
interface DeviceCardProps {
  device: MatterDevice;  // from generated types
  onEdit: () => void;
  onRemove: () => void;
  onRefresh: () => void;
}
```

- `data-testid="matter-device-card"`
- Status dot: `data-testid="matter-device-status"`

### 3. Add route

**File:** `apps/frontend/src/app/routes/index.tsx`

```typescript
{
  path: '/matter/devices',
  element: <MatterDevicesPage />,
  authRequired: 'canManageResources',
},
```

### 4. Add sidebar navigation item

Find the sidebar/navigation component and add a "Matter Devices" item:
- Icon: `Cpu` from lucide-react (or another appropriate icon)
- Label: "Matter Devices"
- Path: `/matter/devices`
- Visible when user has `canManageResources` permission

---

## Test Plan

**Manual testing:**

1. Navigate to `/matter/devices` → page loads
2. No devices → empty state shown
3. With devices → cards display correctly with all fields
4. Online device → green "Online" chip
5. Offline device → red "Offline" chip
6. Click device name → edit inline or modal
7. Click "Remove" → confirmation dialog → device removed
8. Sidebar shows "Matter Devices" link (when user has permission)
9. Sidebar hidden for users without `canManageResources`

**Visual verification:**
- Cards are responsive (grid adjusts to screen size)
- Dark mode works correctly
- Loading skeletons appear during data fetch

---

## Security Checklist

- [ ] Route guarded with `'canManageResources'`
- [ ] Sidebar item hidden for unauthorized users
- [ ] No sensitive device data displayed (commissioningData is `@Exclude()`d)
- [ ] Remove action has confirmation dialog
- [ ] Delete calls the DB-only delete endpoint (MATTER-005), not decommission (MATTER-006)

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/frontend/src/app/matter/index.tsx` |
| **Create** | `apps/frontend/src/app/matter/DeviceCard.tsx` |
| **Modify** | `apps/frontend/src/app/routes/index.tsx` (add route) |
| **Modify** | Sidebar/navigation component (add menu item) |

---

## Definition of Done

- [ ] Page loads at `/matter/devices`
- [ ] All device fields displayed correctly
- [ ] Online/offline status visible
- [ ] Edit, remove, refresh actions work
- [ ] Empty state for no devices
- [ ] Route protected by permission
- [ ] Sidebar navigation item added
- [ ] Responsive layout and dark mode support
