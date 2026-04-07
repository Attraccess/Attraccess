# MATTER-003: Setup Code Parsing Service

**Priority:** P0 — Foundation
**Dependencies:** None
**Parallel with:** MATTER-001, MATTER-002
**Estimated scope:** ~100 lines + tests

---

## Goal

Create a service that parses Matter QR codes (`MT:` prefix, base-38 encoded) and manual pairing codes (11/21-digit numeric) into structured setup data. This is consumed by the commissioning service (MATTER-006).

---

## Context for the Agent

### What is a Matter setup code?
Every Matter device ships with a QR code and/or manual pairing code. These encode:
- **Passcode** (27 bits): The SPAKE2+ setup PIN (range 1–99999998)
- **Discriminator** (12 bits): Distinguishes multiple devices advertising simultaneously
- **Vendor ID** (16 bits, QR only): Device manufacturer
- **Product ID** (16 bits, QR only): Device model

QR code format: `MT:-24J042C00KA0648G00` (base-38 encoded TLV)
Manual code format: `34970112332` (11 digits) or 21 digits (includes vendor/product)

### matter.js provides parsers
The `@matter/main` package includes `QrPairingCodeCodec` and `ManualPairingCodeCodec` for parsing. You don't need to implement the codec yourself — just wrap the library.

### Project patterns
- NestJS services: `@Injectable()` class with constructor injection
- Services live in feature directories: `apps/api/src/matter/`
- Testing: Jest via `pnpm nx test api --testFile=<path> --no-cache`

---

## Specification

### 1. Install Matter dependencies

Add to `apps/api/package.json` (or root `package.json` — check where dependencies are managed):
```json
"@matter/main": "^0.12.0",
"@matter/node": "^0.12.0",
"@matter/types": "^0.12.0"
```

Run `pnpm install`.

> **Note:** If the exact version `0.12.x` is not available, use the latest stable version. The `@matter/*` namespace is the current one (formerly `@project-chip/matter*`). Verify the package exists on npm before installing.

### 2. Create the parsing service

**File:** `apps/api/src/matter/matter-pairing.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';

export interface ParsedSetupCode {
  passcode: number;
  discriminator: number;
  vendorId?: number;
  productId?: number;
  source: 'qr' | 'manual';
}

@Injectable()
export class MatterPairingService {
  parseSetupCode(code: string): ParsedSetupCode {
    const trimmed = code.trim();

    if (trimmed.startsWith('MT:')) {
      return this.parseQrCode(trimmed);
    }

    if (/^\d{11}$/.test(trimmed) || /^\d{21}$/.test(trimmed)) {
      return this.parseManualCode(trimmed);
    }

    throw new BadRequestException(
      'Invalid setup code. Enter a Matter QR code (starts with MT:) or an 11-digit manual pairing code.'
    );
  }

  private parseQrCode(qrString: string): ParsedSetupCode {
    // Use @matter/main QrPairingCodeCodec
    // Import: import { QrPairingCodeCodec } from "@matter/main";
    // const data = QrPairingCodeCodec.decode(qrString);
    // return { passcode: data.passcode, discriminator: data.discriminator, vendorId: data.vendorId, productId: data.productId, source: 'qr' };
    // Wrap in try/catch → BadRequestException on parse failure
  }

  private parseManualCode(code: string): ParsedSetupCode {
    // Use @matter/main ManualPairingCodeCodec
    // Import: import { ManualPairingCodeCodec } from "@matter/main";
    // const data = ManualPairingCodeCodec.decode(code);
    // return { passcode: data.passcode, discriminator: data.discriminator, source: 'manual' };
    // Wrap in try/catch → BadRequestException on parse failure
  }
}
```

**Important implementation notes:**
- The exact import paths may differ depending on the matter.js version. Check the package's exports. Common alternatives:
  - `import { QrPairingCodeCodec } from "@matter/main";`
  - `import { QrPairingCodeCodec } from "@matter/main/codec";`
  - `import { QrCode } from "@matter/types";`
- Wrap all `decode()` calls in try/catch and throw `BadRequestException` with a user-friendly message
- Validate passcode range after parsing: must be 1–99999998, excluding 0, 11111111, 22222222, ..., 99999999
- **NEVER log the parsed passcode** — it's a shared secret

### 3. Create DTO for the commissioning endpoint

**File:** `apps/api/src/matter/dto/commission-device.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CommissionDeviceDto {
  @ApiProperty({
    description: 'Matter setup code — QR code string (MT:...) or 11-digit manual pairing code',
    example: 'MT:-24J042C00KA0648G00',
  })
  @IsString()
  @IsNotEmpty()
  setupCode!: string;

  @ApiProperty({
    description: 'Friendly name for the device',
    example: 'Front Door Lock',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;
}
```

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/matter-pairing.service.spec.ts --no-cache
```

**Create test file:** `apps/api/src/matter/matter-pairing.service.spec.ts`

Tests to write:

1. **QR code parsing:**
   - Valid QR code string → returns passcode, discriminator, vendorId, productId, source: 'qr'
   - Use matter.js test vectors or generate a test code using `QrPairingCodeCodec.encode()`

2. **Manual code parsing:**
   - Valid 11-digit code → returns passcode, discriminator, source: 'manual'
   - Valid 21-digit code → returns passcode, discriminator, vendorId, productId, source: 'manual'

3. **Error cases:**
   - Empty string → BadRequestException
   - Random string "hello" → BadRequestException
   - 10-digit number → BadRequestException (wrong length)
   - "MT:INVALID" → BadRequestException (malformed QR)
   - String with leading/trailing whitespace → should trim and parse correctly

4. **Security:**
   - Verify passcode is not logged (inspect service — no `console.log` or `Logger` calls that include passcode)

---

## Security Checklist

- [ ] Passcode is NEVER logged at any level (not even debug)
- [ ] Passcode is NEVER persisted to database — this service is parse-only
- [ ] API response from commission endpoint does NOT echo back the setup code
- [ ] `BadRequestException` messages do not leak internal Matter protocol details
- [ ] Setup code is memory-only during the HTTP request lifecycle — no caching

---

## Files to Create

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/matter-pairing.service.ts` |
| **Create** | `apps/api/src/matter/dto/commission-device.dto.ts` |
| **Create** | `apps/api/src/matter/matter-pairing.service.spec.ts` |
| **Modify** | `package.json` (add `@matter/main`, `@matter/node`, `@matter/types`) |

---

## Definition of Done

- [ ] `@matter/main` installed and importable
- [ ] `parseSetupCode()` handles QR codes, 11-digit codes, and 21-digit codes
- [ ] Invalid codes throw `BadRequestException` with user-friendly messages
- [ ] Passcode never logged or persisted
- [ ] `CommissionDeviceDto` validates input
- [ ] All unit tests pass
- [ ] No console.log/Logger calls that include the passcode
