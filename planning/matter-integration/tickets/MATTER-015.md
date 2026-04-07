# MATTER-015: QR Scanner Component

**Priority:** P1 — Frontend
**Dependencies:** None (standalone UI component)
**Parallel with:** All other tickets
**Estimated scope:** ~150 lines across 2 files

---

## Goal

Create a reusable QR code scanner component that uses the device camera to scan Matter QR codes, with a manual entry fallback for environments without camera access.

---

## Context for the Agent

### Library choice
**`html5-qrcode`** (Apache-2.0, ~200k weekly downloads)
- Supports camera viewfinder + file upload
- Works on mobile and desktop
- Install: add `"html5-qrcode": "^2.3.8"` to package.json

### Matter QR code format
- Prefix: `MT:` (e.g., `MT:-24J042C00KA0648G00`)
- Manual code: 11 or 21 digits (e.g., `34970112332`)
- The component should accept either format

### Component library
- HeroUI: `Tabs`, `Tab`, `Input`, `Button`, `Card`
- lucide-react: `Camera`, `KeyboardIcon`, `ScanLine`

---

## Specification

### Create QrScanner component

**File:** `apps/frontend/src/app/matter/commission/QrScanner.tsx`

```typescript
interface QrScannerProps {
  onCodeScanned: (code: string) => void;
  isDisabled?: boolean;
}
```

**Behavior:**

#### Tab 1: Camera Scan
1. Initialize `Html5Qrcode` scanner on mount
2. Show camera viewfinder with scan region overlay
3. On QR detection:
   - Validate: starts with `MT:` → accept
   - Validate: 11 or 21 digits → accept
   - Other → ignore (keep scanning)
4. Call `onCodeScanned(decodedText)` on valid detection
5. Stop camera on unmount or after successful scan
6. Handle camera permission denial:
   - Show message: "Camera access denied. Use the manual entry tab instead."
   - Auto-switch to manual entry tab
7. Handle no camera available:
   - Show message: "No camera detected."
   - Auto-switch to manual entry tab

#### Tab 2: Manual Entry
1. Text input field with placeholder "Enter QR code (MT:...) or 11-digit pairing code"
2. Validate on submit:
   - Starts with `MT:` → accept
   - Matches `/^\d{11}$/` or `/^\d{21}$/` → accept
   - Other → show validation error: "Invalid code format"
3. Submit button
4. Allow paste (users may copy the code from device documentation)

**UI Layout:**
```
┌─────────────────────────────┐
│  [📷 Scan QR]  [⌨️ Manual]  │  ← Tabs
├─────────────────────────────┤
│                             │
│    ┌─────────────────┐      │
│    │                 │      │  ← Camera viewfinder (Tab 1)
│    │   Scan region   │      │
│    │                 │      │
│    └─────────────────┘      │
│                             │
│  OR                         │
│                             │
│  ┌───────────────────────┐  │
│  │ MT:-24J042C00KA...    │  │  ← Text input (Tab 2)
│  └───────────────────────┘  │
│  [Submit]                   │
│                             │
└─────────────────────────────┘
```

**Test IDs:**
- `data-testid="matter-qr-scanner"` — container
- `data-testid="matter-qr-camera"` — camera viewfinder
- `data-testid="matter-manual-code-input"` — text input
- `data-testid="matter-manual-code-submit"` — submit button

**Cleanup:** Critical — the camera MUST be stopped on unmount. Use `useEffect` cleanup:
```typescript
useEffect(() => {
  return () => {
    scanner.current?.stop().catch(() => {});
  };
}, []);
```

---

## Test Plan

**Manual testing:**

1. Open commissioning modal → camera requests permission
2. Grant permission → viewfinder shows camera feed
3. Point at Matter QR code → detected and returned via callback
4. Non-Matter QR codes → ignored (keeps scanning)
5. Deny camera permission → shows message, switches to manual tab
6. Manual tab → enter `MT:-24J042C00KA0648G00` → validates and submits
7. Manual tab → enter `34970112332` → validates and submits
8. Manual tab → enter `hello` → shows validation error
9. Close modal → camera stops (no lingering camera access)
10. Mobile browser → camera works
11. Desktop browser → camera works (if webcam available)

**Edge cases:**
- Component unmounts while camera is starting → no errors
- User switches tabs rapidly → no errors
- Paste long string → only valid codes accepted

---

## Security Checklist

- [ ] Camera permission requested only when scan tab is active
- [ ] Camera stopped on unmount (no lingering access)
- [ ] Scanned code validated before callback (only Matter codes accepted)
- [ ] No scanned code stored in component state after callback
- [ ] No camera feed sent to any external service

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/frontend/src/app/matter/commission/QrScanner.tsx` |
| **Modify** | `package.json` (add `html5-qrcode`) |

---

## Definition of Done

- [ ] Camera scanning detects Matter QR codes
- [ ] Manual entry accepts QR strings and manual pairing codes
- [ ] Invalid codes rejected with clear message
- [ ] Camera properly cleaned up on unmount
- [ ] Works on mobile and desktop
- [ ] Graceful fallback when camera unavailable
- [ ] All test IDs present
