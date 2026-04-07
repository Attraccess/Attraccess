# MATTER-018: Virtual Device Integration Test Suite

**Priority:** P1 — Testing
**Dependencies:** All backend tickets (MATTER-001 through MATTER-009, MATTER-011, MATTER-012)
**Parallel with:** MATTER-013 through MATTER-016 (frontend tickets)
**Estimated scope:** ~300 lines in 1 test file

---

## Goal

Create an integration test suite using matter.js virtual devices that tests the entire Matter lifecycle without physical hardware. This enables CI/CD testing of commissioning, commands, subscriptions, and flow execution.

---

## Context for the Agent

### matter.js virtual devices
matter.js can create virtual Matter devices that behave like real devices — they advertise on the network, accept commissioning, respond to commands, and emit events. This is a first-class feature of the library.

```typescript
// Approximate API for creating a virtual door lock
import { ServerNode, Endpoint, DoorLockServer } from "@matter/main";

const virtualLock = await ServerNode.create({
  id: "test-lock",
  network: { port: 5541 },
});

const lockEndpoint = new Endpoint(DoorLockServer, {
  id: "lock",
  doorLock: {
    lockState: DoorLock.LockState.Locked,
    lockType: DoorLock.LockType.DeadBolt,
    actuatorEnabled: true,
  },
});

await virtualLock.add(lockEndpoint);
await virtualLock.start();

// The virtual device now advertises on mDNS and accepts commissioning
// Setup code can be generated for commissioning
```

### Test infrastructure
- **Test runner:** Jest via `pnpm nx test api --testFile=<path> --no-cache`
- **Database:** Each test can use an in-memory SQLite database or the regular file-based one
- **Timeout:** Integration tests may need longer timeouts (Matter operations take seconds)

### What to test end-to-end
1. Create virtual lock → Commission via API → Verify stored in DB
2. Send lock command → Verify virtual lock state changed
3. Change virtual lock state → Verify subscription event emitted → Verify flow triggers
4. Decommission → Verify device removed
5. Flow integration: Matter event node triggers flow on state change → Matter command node sends command

---

## Specification

### Create test file

**File:** `apps/api/src/matter/integration/matter-virtual-device.integration.spec.ts`

### Test setup

```typescript
describe('Matter Integration (Virtual Device)', () => {
  let app: INestApplication;
  let virtualLock: ServerNode;
  let virtualLockSetupCode: string;

  beforeAll(async () => {
    // 1. Create NestJS test app with MatterModule
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule], // or minimal module set
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // 2. Create virtual Matter door lock
    virtualLock = await createVirtualDoorLock();
    virtualLockSetupCode = virtualLock.getSetupCode(); // or however the API works

    // 3. Wait for mDNS advertisement to propagate
    await sleep(2000);
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    await virtualLock?.close();
    await app?.close();
  });
});
```

### Test cases

#### Test 1: Commission virtual device
```typescript
it('should commission a virtual door lock', async () => {
  const response = await request(app.getHttpServer())
    .post('/api/matter/devices/commission')
    .send({ setupCode: virtualLockSetupCode, name: 'Test Lock' })
    .expect(201);

  expect(response.body.name).toBe('Test Lock');
  expect(response.body.deviceTypeName).toBe('Door Lock');
  expect(response.body.isOnline).toBe(true);
  expect(response.body.commissioningData).toBeUndefined(); // @Exclude works

  deviceId = response.body.id;
}, 90000); // 90s timeout — commissioning is slow
```

#### Test 2: List devices shows commissioned device
```typescript
it('should list the commissioned device', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/matter/devices')
    .expect(200);

  expect(response.body).toHaveLength(1);
  expect(response.body[0].name).toBe('Test Lock');
});
```

#### Test 3: Read lock state
```typescript
it('should read current lock state', async () => {
  const response = await request(app.getHttpServer())
    .get(`/api/matter/devices/${deviceId}/state/doorLock.lockState`)
    .expect(200);

  expect(response.body.humanValue).toBe('Locked');
});
```

#### Test 4: Send unlock command
```typescript
it('should unlock the virtual lock', async () => {
  const response = await request(app.getHttpServer())
    .post(`/api/matter/devices/${deviceId}/command`)
    .send({ commandKey: 'doorLock.unlock' })
    .expect(200);

  expect(response.body.success).toBe(true);

  // Verify virtual lock state changed
  // Read the virtual lock's internal state
  // OR read back via the API:
  const stateResponse = await request(app.getHttpServer())
    .get(`/api/matter/devices/${deviceId}/state/doorLock.lockState`)
    .expect(200);

  expect(stateResponse.body.humanValue).toBe('Unlocked');
}, 30000);
```

#### Test 5: Send lock command
```typescript
it('should lock the virtual lock', async () => {
  const response = await request(app.getHttpServer())
    .post(`/api/matter/devices/${deviceId}/command`)
    .send({ commandKey: 'doorLock.lock' })
    .expect(200);

  expect(response.body.success).toBe(true);
}, 30000);
```

#### Test 6: Subscription emits state change event
```typescript
it('should emit event when virtual lock state changes externally', async () => {
  // Listen for the event
  const eventPromise = new Promise<MatterDeviceStateChangeEvent>((resolve) => {
    const emitter = app.get(EventEmitter2);
    emitter.once('matter.device.stateChange', resolve);
  });

  // Change virtual lock state externally
  await virtualLock.setLockState(DoorLock.LockState.Unlocked);

  // Wait for subscription to detect and emit
  const event = await withTimeout(eventPromise, 15000);

  expect(event.deviceId).toBe(deviceId);
  expect(event.eventKey).toBe('doorLock.lockState');
  expect(event.humanValue).toBe('Unlocked');
}, 30000);
```

#### Test 7: Flow integration — event triggers command
```typescript
it('should trigger a flow when virtual lock state changes', async () => {
  // Create a Door resource with a flow:
  //   INPUT_MATTER_EVENT (deviceId, doorLock.lockState, "unlocked")
  //     → OUTPUT_MATTER_COMMAND (deviceId, doorLock.lock)
  const resource = await createDoorResource(app);
  await createMatterFlow(app, resource.id, deviceId);

  // Change virtual lock state externally to "Unlocked"
  await virtualLock.setLockState(DoorLock.LockState.Unlocked);

  // Wait for subscription → event → flow → command
  await sleep(5000);

  // Verify the flow reacted and sent lock command back
  const stateResponse = await request(app.getHttpServer())
    .get(`/api/matter/devices/${deviceId}/state/doorLock.lockState`)
    .expect(200);

  expect(stateResponse.body.humanValue).toBe('Locked');
}, 30000);
```

#### Test 8: Decommission
```typescript
it('should decommission the virtual lock', async () => {
  await request(app.getHttpServer())
    .delete(`/api/matter/devices/${deviceId}/decommission`)
    .expect(200);

  // Device should be gone from list
  const response = await request(app.getHttpServer())
    .get('/api/matter/devices')
    .expect(200);

  expect(response.body).toHaveLength(0);
}, 30000);
```

#### Test 9: Error case — commission with wrong code
```typescript
it('should return error for wrong setup code', async () => {
  const response = await request(app.getHttpServer())
    .post('/api/matter/devices/commission')
    .send({ setupCode: '00000000000' }) // wrong code
    .expect(400); // or 500 depending on error type

  expect(response.body.message).toContain('rejected');
}, 60000);
```

### Helper functions

Create `apps/api/src/matter/integration/helpers.ts`:
- `createVirtualDoorLock()`: Creates and starts a virtual door lock device
- `createDoorResource(app)`: Creates a Door resource via the API
- `createMatterFlow(app, resourceId, deviceId)`: Creates a flow with Matter event → command nodes
- `withTimeout(promise, ms)`: Wraps promise with timeout
- `sleep(ms)`: Simple delay

---

## Test Plan

```bash
# Run the integration test suite
pnpm nx test api --testFile=apps/api/src/matter/integration/matter-virtual-device.integration.spec.ts --no-cache --testTimeout=120000

# Note: these tests need network access for mDNS (loopback should work)
# In CI: may need to run with --forceExit if matter.js leaves lingering connections
```

**CI configuration:**
- Timeout: 120 seconds per test
- Environment: needs UDP port access (5540, 5541) — loopback only
- No external dependencies (no physical devices, no cloud services)
- Add to CI pipeline with a dedicated test job

---

## Security Checklist

- [ ] Virtual device setup codes not committed (generated at test time)
- [ ] Tests use ephemeral database (clean after each run)
- [ ] No real device credentials in test fixtures
- [ ] Tests don't leave open ports/connections after completion

---

## Files to Create

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/integration/matter-virtual-device.integration.spec.ts` |
| **Create** | `apps/api/src/matter/integration/helpers.ts` |

---

## Definition of Done

- [ ] Full lifecycle tested: commission → control → subscribe → flow integration → decommission
- [ ] Tests run without physical hardware
- [ ] Tests complete in under 120 seconds total
- [ ] Error cases tested (wrong code, offline device)
- [ ] Tests clean up after themselves (no leaked state)
- [ ] Can run in CI pipeline
- [ ] All 9+ test cases pass
