# MATTER-016: Commissioning Wizard Modal

**Priority:** P1 — Frontend
**Dependencies:** MATTER-006 (commissioning API), MATTER-015 (QR scanner)
**Parallel with:** MATTER-013, MATTER-014
**Estimated scope:** ~200 lines across 2 files

---

## Goal

Create a multi-step modal wizard that guides users through commissioning (pairing) a new Matter device — from scanning the QR code to naming the device and optionally linking it to a resource.

---

## Context for the Agent

### Existing wizard pattern — Attractap Hardware Setup
**File:** `apps/frontend/src/app/attractap/HardwareSetup/index.tsx`

Multi-step modal with state machine:
```typescript
const [step, setStep] = useState<'init' | 'select' | 'flash' | 'configure'>('init');
```

### Modal pattern
```typescript
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/react';

const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
```

### SumUp pairing (simpler example)
**File:** `apps/frontend/src/app/billing/administration/sumup/readers/pairing/index.tsx`

Simple form modal: input code → submit → success.

### API endpoints
- `POST /api/matter/devices/commission` — body: `{ setupCode, name? }` — returns `MatterDevice`
- Generated hook: `useMatterDevicesCommission()` (mutation)

---

## Specification

### Create CommissionModal component

**File:** `apps/frontend/src/app/matter/commission/CommissionModal.tsx`

```typescript
interface CommissionModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSuccess: (device: MatterDevice) => void;
}
```

### Steps

#### Step 1: Scan / Enter Code
- Render `QrScanner` component (MATTER-015)
- On code scanned → store code in state, advance to step 2
- "Cancel" button closes modal

#### Step 2: Commissioning...
- Show spinner / progress animation
- Text: "Discovering and pairing your device... This may take up to 60 seconds."
- Call `POST /api/matter/devices/commission` with the setup code
- On success → advance to step 3
- On error → show error message with "Try Again" button (returns to step 1)
- Error messages from backend are already user-friendly (MATTER-006)

#### Step 3: Name Your Device
- Pre-fill name from API response (`device.vendorName + " " + device.productName` or `device.name`)
- Text input for custom name
- Device info display: type, vendor, product
- "Next" button → save name via `PUT /api/matter/devices/:id` if changed → advance to step 4
- "Skip" button → advance to step 4 without renaming

#### Step 4: Success
- Checkmark animation
- Device name and type displayed
- "Go to Device" button → navigate to device list (or device detail)
- "Add Another" button → reset to step 1
- "Close" button → close modal, call `onSuccess(device)`

### Integration with device list page

Add "Add Device" button on the Matter Devices page (MATTER-014) that opens this modal:
```typescript
<Button onPress={onOpen} color="primary" startContent={<PlusIcon />}>
  Add Device
</Button>
<CommissionModal isOpen={isOpen} onOpenChange={onOpenChange} onSuccess={handleSuccess} />
```

On success, invalidate the devices query to refresh the list.

### Test IDs
- `data-testid="matter-commission-modal"` — modal container
- `data-testid="matter-commission-step-scan"` — step 1
- `data-testid="matter-commission-step-progress"` — step 2
- `data-testid="matter-commission-step-name"` — step 3
- `data-testid="matter-commission-step-success"` — step 4
- `data-testid="matter-device-name-input"` — name input
- `data-testid="matter-commission-next-btn"` — next/submit button

---

## Test Plan

**Manual testing:**

1. Click "Add Device" → modal opens at step 1
2. Scan QR code → advances to step 2 (commissioning progress)
3. Commissioning succeeds → advances to step 3 (name)
4. Enter name → click Next → advances to step 4 (link)
5. Select resource → click Link → advances to step 5 (success)
6. Click "Close" → modal closes, device list refreshes

**Error testing:**
7. Enter invalid code → error shown, can retry
8. Commissioning fails (device not found) → error with "Try Again"
9. Commissioning fails (network error) → error with "Try Again"
10. Close modal during commissioning → confirm dialog ("Commissioning in progress. Cancel?")

**Edge cases:**
11. Skip naming → device keeps auto-generated name
12. Skip linking → device appears in list without resource
13. "Add Another" → resets to step 1

---

## Security Checklist

- [ ] Setup code only sent over HTTPS to backend (standard API call)
- [ ] Setup code not stored in browser state after commissioning completes
- [ ] Modal closes and clears state on unmount
- [ ] Error messages don't expose internal details beyond what backend returns
- [ ] Resource selector respects user permissions (shows only accessible resources)

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/frontend/src/app/matter/commission/CommissionModal.tsx` |
| **Modify** | `apps/frontend/src/app/matter/index.tsx` (add "Add Device" button + modal integration) |

---

## Definition of Done

- [ ] Complete 5-step wizard flow works end-to-end
- [ ] QR scan → commission → name → link → success
- [ ] Error handling at each step with retry
- [ ] Cancel/close properly cleans up state
- [ ] Device list refreshes after successful commission
- [ ] Skip options work for naming and linking
- [ ] All test IDs present
- [ ] Responsive on mobile and desktop
