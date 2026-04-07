# MATTER-022: Thread Border Router Frontend

**Priority:** P1 — Thread Frontend
**Dependencies:** MATTER-019 (TBR API), MATTER-020 (SLZB-06 API)
**Parallel with:** MATTER-021, MATTER-023, all non-Thread frontend tickets
**Estimated scope:** ~400 lines across 5 files

---

## Goal

Create the frontend UI for managing Thread Border Routers — listing registered TBRs, adding new ones (with SLZB-06 discovery), creating Thread networks, and monitoring health. This is a sub-section of the Matter Devices page.

---

## Context for the Agent

### Page location
Thread Border Router management lives under the Matter section:
- Route: `/matter/thread` — TBR list and management
- Navigation: Sub-item under "Matter Devices" in sidebar, or a tab on the Matter page

### API endpoints (from MATTER-019, MATTER-020)

**TBR CRUD:**
- `GET /api/matter/thread/border-routers` → list all TBRs
- `POST /api/matter/thread/border-routers` → register TBR
- `DELETE /api/matter/thread/border-routers/:id` → remove TBR
- `POST /api/matter/thread/border-routers/:id/create-network` → create Thread network
- `GET /api/matter/thread/border-routers/:id/status` → live health check
- `POST /api/matter/thread/border-routers/:id/sync` → sync state

**SLZB-06:**
- `GET /api/matter/thread/slzb06/discover` → discover SLZB-06 on network
- `GET /api/matter/thread/slzb06/info?host=<ip>` → get device info
- `POST /api/matter/thread/slzb06/register` → register SLZB-06 as TBR

### UI library
- HeroUI: Modal, Card, Button, Chip, Input, Select, Tabs, Tab
- lucide-react icons: `Radio`, `Wifi`, `Activity`, `Server`, `AlertTriangle`
- React Query for data fetching

### Existing list page pattern
Follow the Matter Devices page pattern from MATTER-014: card-based list with status badges and action buttons.

---

## Specification

### 1. Thread Border Router list page

**File:** `apps/frontend/src/app/matter/thread/index.tsx`

**Layout:**
- Page header: "Thread Border Routers" with status summary
- "Add Border Router" button → opens setup wizard modal
- TBR cards in a grid, each showing:
  - Name and type badge ("OTBR" / "SLZB-06")
  - Status: Online (green), Offline (red), Degraded (yellow)
  - Thread network info (if active): network name, channel, router count
  - OTBR state: leader, router, child, detached, disabled
  - RCP info: SLZB-06 model, firmware version, IP
  - Last seen timestamp
  - Actions: View status, Create network, Sync, Remove
- Empty state: "No Thread Border Routers configured. Add one to enable Matter-over-Thread."

**Status determination:**
- Green "Online": OTBR reachable + Thread network active + state is leader/router
- Yellow "Degraded": OTBR reachable but no Thread network or state is detached
- Red "Offline": OTBR not reachable

### 2. Add Border Router wizard modal

**File:** `apps/frontend/src/app/matter/thread/AddTbrModal.tsx`

Multi-step wizard:

#### Step 1: Choose type
- "SLZB-06 (Recommended)" — auto-discovery support
- "Other OTBR" — manual configuration

#### Step 2a: SLZB-06 setup
- "Scan Network" button → calls discover endpoint, shows found devices
- Each discovered device shows: IP, model, firmware version, mode (Thread/Zigbee)
- OR manual IP entry: "Enter SLZB-06 IP address"
- Select device → show device info from `/ha_info`
- **If NOT in Thread RCP mode:** Show warning card:
  > "This SLZB-06 is currently in Zigbee mode. To use it as a Thread Border Router:
  > 1. Open the SLZB-06 web UI at http://{ip}
  > 2. Go to Settings → Firmware
  > 3. Switch to Thread RCP firmware
  > 4. Come back here after the switch completes
  >
  > ⚠️ Switching to Thread mode will disconnect all Zigbee devices paired to this coordinator."
- **If in Thread RCP mode:** Show success card + "Continue" button
- Enter friendly name for the TBR

#### Step 2b: Manual OTBR setup
- Input: OTBR host (IP or hostname)
- Input: OTBR REST API port (default: 8081)
- "Test Connection" button → calls health check
- Enter friendly name

#### Step 3: Verify OTBR connection
- Show connection test results:
  - OTBR reachable: ✓/✗
  - RCP connected: ✓/✗ (with firmware version)
  - Thread state: current state
- If all checks pass → "Register" button
- If issues → show actionable error messages

#### Step 4: Create Thread Network (optional)
- If no Thread network exists on the TBR:
  - Input: Network name (default: "Attraccess-Thread")
  - Input: Channel (optional, default: auto-select)
  - "Create Network" button
- If network already exists → show existing network info, skip creation
- "Done" button

### 3. TBR detail / status modal

**File:** `apps/frontend/src/app/matter/thread/TbrStatusModal.tsx`

Shows live status when user clicks "View Status" on a TBR card:

- **OTBR Status:**
  - State (leader/router/child/detached/disabled) with explanation
  - Border Agent ID
  - RCP firmware version
  - Router count

- **Thread Network:**
  - Network name
  - Channel
  - PAN ID
  - Extended PAN ID
  - Mesh-local prefix

- **SLZB-06 Info** (if type is slzb06):
  - Model and hardware version
  - Core firmware version
  - Chip firmware version
  - Connectivity type (Ethernet/WiFi)
  - Uptime
  - Temperature (if available)

- **Actions:**
  - "Sync State" button (refreshes from OTBR)
  - "Create Network" button (if no network)

### 4. Add routing

**File:** `apps/frontend/src/app/routes/index.tsx`

```typescript
{
  path: '/matter/thread',
  element: <ThreadBorderRouterPage />,
  authRequired: 'canManageResources',
},
```

Add navigation: either as a sub-item under Matter Devices, or as a tab on the Matter page.

### 5. Test IDs

- `data-testid="tbr-list"` — TBR list container
- `data-testid="tbr-card"` — individual TBR card
- `data-testid="tbr-add-btn"` — add TBR button
- `data-testid="tbr-add-modal"` — add wizard modal
- `data-testid="tbr-slzb06-discover-btn"` — SLZB-06 discovery button
- `data-testid="tbr-slzb06-ip-input"` — manual IP input
- `data-testid="tbr-network-name-input"` — network name input
- `data-testid="tbr-create-network-btn"` — create network button
- `data-testid="tbr-status-modal"` — status modal

---

## Test Plan

**Manual testing:**

1. Navigate to `/matter/thread` → page loads with empty state
2. Click "Add Border Router" → wizard opens
3. Choose "SLZB-06" → step 2a shows
4. Click "Scan Network" → discovered devices shown (or timeout message)
5. Enter SLZB-06 IP manually → device info loads
6. SLZB-06 in Zigbee mode → warning shown with instructions
7. SLZB-06 in Thread mode → success, continue to step 3
8. Step 3: connection verified → register TBR
9. Step 4: create Thread network → network created
10. TBR card appears in list with correct status
11. Click "View Status" → status modal shows live data
12. Click "Sync" → state refreshes
13. Click "Remove" → confirmation → TBR removed

**Choose "Other OTBR" path:**
14. Enter OTBR host and port → test connection
15. Connection fails → clear error message
16. Connection succeeds → register and continue

**Edge cases:**
17. No SLZB-06 devices found during scan → "No devices found" message
18. OTBR unreachable after registration → card shows "Offline" status
19. Thread network already exists on OTBR → skip creation step

---

## Security Checklist

- [ ] Route guarded with `canManageResources`
- [ ] No Thread network keys displayed in the UI
- [ ] SLZB-06 IP addresses are local network only — document this
- [ ] Remove action has confirmation dialog
- [ ] Firmware mode switch warning is prominent (prevents accidental Zigbee disconnection)

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/frontend/src/app/matter/thread/index.tsx` |
| **Create** | `apps/frontend/src/app/matter/thread/TbrCard.tsx` |
| **Create** | `apps/frontend/src/app/matter/thread/AddTbrModal.tsx` |
| **Create** | `apps/frontend/src/app/matter/thread/TbrStatusModal.tsx` |
| **Modify** | `apps/frontend/src/app/routes/index.tsx` (add route) |
| **Modify** | Sidebar navigation (add Thread sub-item or tab) |

---

## Definition of Done

- [ ] TBR list page shows all registered border routers with status
- [ ] Add wizard supports both SLZB-06 (with discovery) and manual OTBR
- [ ] SLZB-06 firmware mode detection works with clear warnings
- [ ] Thread network creation works from the UI
- [ ] Status modal shows live OTBR and SLZB-06 info
- [ ] Empty, loading, and error states handled
- [ ] All test IDs present
- [ ] Responsive and dark mode compatible
