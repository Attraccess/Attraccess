# MATTER-021: OTBR Docker Container Management

**Priority:** P1 — Thread Infrastructure
**Dependencies:** MATTER-019 (TBR entity, OTBR client)
**Parallel with:** MATTER-020, all non-Thread tickets
**Estimated scope:** ~250 lines across 4 files

---

## Goal

Provide a managed OTBR (OpenThread Border Router) Docker container configuration that integrates with the Attraccess deployment. Include docker-compose service definition, automatic startup, health checks, and the ability for Attraccess to verify and configure the OTBR instance.

---

## Context for the Agent

### OTBR Docker container
The official OTBR Docker image is `openthread/otbr`. It requires:
- **IPv6 enabled** in the container
- **IP forwarding** enabled for border routing
- **Network access** to the RCP device (SLZB-06 via TCP, or USB device passthrough)
- **Privileged mode** or specific capabilities for network configuration
- **Port 8081** exposed for REST API

### OTBR Docker run command (reference)
```bash
docker run -d --name otbr \
  --sysctl "net.ipv6.conf.all.disable_ipv6=0 net.ipv4.conf.all.forwarding=1 net.ipv6.conf.all.forwarding=1" \
  --privileged \
  -p 8081:8081 \
  --dns=127.0.0.1 \
  --volume otbr-data:/var/lib/thread \
  openthread/otbr \
  --radio-url "spinel+hdlc+tcp://192.168.1.100:6638"
```

For network-attached RCP (SLZB-06 over Ethernet):
- Radio URL: `spinel+hdlc+tcp://<SLZB-IP>:<port>`
- No USB device passthrough needed
- Container needs network access to the SLZB-06 IP

### Existing docker-compose.yml
**File:** `docker-compose.yml` (project root)

The project uses Docker Compose v2.4 with 9 services. Services use named volumes for persistence. Some services (dns-server, hetzner-dns-updater) use `network_mode: host`.

The OTBR container will be added as an optional service that can be enabled when Thread support is needed.

### Balena deployment
The project supports Balena for embedded deployment. OTBR would need to be a separate Balena service container. For now, focus on docker-compose; Balena support can follow.

---

## Specification

### 1. Add OTBR service to docker-compose.yml

**File:** `docker-compose.yml`

Add the OTBR service definition. It should be **commented out by default** (or in a separate `docker-compose.thread.yml` override file) since not all deployments need Thread support.

**Option A: Separate override file (recommended)**

**File:** `docker-compose.thread.yml`

```yaml
version: '2.4'

services:
  otbr:
    image: openthread/otbr:latest
    container_name: attraccess-otbr
    restart: unless-stopped
    privileged: true
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=0
      - net.ipv4.conf.all.forwarding=1
      - net.ipv6.conf.all.forwarding=1
    dns:
      - 127.0.0.1
    ports:
      - "8081:8081"    # OTBR REST API
    volumes:
      - otbr-data:/var/lib/thread
    environment:
      - OTBR_RADIO_URL=${OTBR_RADIO_URL:-spinel+hdlc+tcp://192.168.1.100:6638}
    command: ["--radio-url", "${OTBR_RADIO_URL:-spinel+hdlc+tcp://192.168.1.100:6638}"]
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8081/node"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

volumes:
  otbr-data:
```

**Usage:**
```bash
# Start with Thread support
OTBR_RADIO_URL="spinel+hdlc+tcp://192.168.1.100:6638" \
  docker compose -f docker-compose.yml -f docker-compose.thread.yml up -d

# Start without Thread (default)
docker compose up -d
```

### 2. Add environment variables documentation

**File:** `apps/api/src/matter/thread/README.md` (or add to existing docs)

Document:

| Variable | Default | Description |
|----------|---------|-------------|
| `OTBR_RADIO_URL` | `spinel+hdlc+tcp://192.168.1.100:6638` | RCP connection string. For SLZB-06: `spinel+hdlc+tcp://<SLZB-IP>:6638`. For USB: `spinel+hdlc+uart:///dev/ttyUSB0` |
| `OTBR_REST_HOST` | `otbr` | Hostname of OTBR container (Docker service name) |
| `OTBR_REST_PORT` | `8081` | OTBR REST API port |

### 3. Create OTBR lifecycle management service

**File:** `apps/api/src/matter/thread/otbr-lifecycle.service.ts`

This service manages the OTBR container lifecycle from Attraccess:

```typescript
@Injectable()
export class OtbrLifecycleService implements OnModuleInit {
  // On startup, check if OTBR is reachable
  async onModuleInit(): Promise<void>

  // Verify OTBR is configured and healthy
  async verifyOtbrSetup(): Promise<OtbrSetupStatus>

  // Get the radio URL needed for OTBR configuration
  getRadioUrl(rcpHost: string, rcpPort: number): string

  // Generate docker-compose command for the user
  generateDockerCommand(rcpHost: string, rcpPort: number): string
}
```

**`OtbrSetupStatus`:**
```typescript
interface OtbrSetupStatus {
  otbrReachable: boolean;
  otbrVersion: string | null;
  rcpConnected: boolean;
  rcpVersion: string | null;
  threadNetworkActive: boolean;
  threadNetworkName: string | null;
  threadState: string | null;
  radioUrl: string | null;
  setupComplete: boolean;  // all checks pass
  issues: string[];        // list of problems found
}
```

**Startup behavior:**
- If no `ThreadBorderRouter` records exist → skip (Thread not configured)
- If records exist but OTBR unreachable → log warning: "OTBR at {host}:{port} is not reachable. Thread devices will not work."
- If OTBR reachable but no Thread network → log info: "OTBR connected but no Thread network configured."
- If everything is OK → log info: "Thread Border Router operational. Network: {name}, Channel: {channel}, Routers: {count}"

### 4. Add health check to Matter health endpoint

**Modify:** The health endpoint from MATTER-005 (`GET /api/matter/health`)

Extend the response to include Thread status:

```typescript
{
  controllerReady: boolean;
  fabricId: string | null;
  fabricLabel: string | null;
  deviceCount: number;
  devicesOnline: number;
  thread: {
    borderRouterCount: number;
    borderRoutersOnline: number;
    activeNetworks: string[];  // network names
    otbrReachable: boolean;
  }
}
```

### 5. Document setup flow for users

The complete Thread setup flow is:

1. **Hardware:** Connect SLZB-06 to Ethernet (PoE or USB-C power)
2. **Firmware:** Switch SLZB-06 to Thread RCP mode via its web UI at `http://slzb-06.local`
3. **OTBR:** Start the OTBR Docker container:
   ```bash
   OTBR_RADIO_URL="spinel+hdlc+tcp://<SLZB-IP>:6638" \
     docker compose -f docker-compose.yml -f docker-compose.thread.yml up -d otbr
   ```
4. **Register:** In Attraccess UI → Matter → Thread Border Routers → Add → enter SLZB-06 IP
5. **Create Network:** Click "Create Thread Network" → enter network name
6. **Commission:** Thread devices can now be commissioned

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/thread/otbr-lifecycle.service.spec.ts --no-cache
```

**Unit tests:**

1. `verifyOtbrSetup()` — OTBR reachable + Thread network active → setupComplete: true
2. `verifyOtbrSetup()` — OTBR unreachable → setupComplete: false, issues: ["OTBR not reachable"]
3. `verifyOtbrSetup()` — OTBR reachable but no network → issues: ["No Thread network"]
4. `getRadioUrl()` — formats correct spinel URL
5. `generateDockerCommand()` — produces valid docker compose command
6. `onModuleInit()` — no TBR records → logs skip message
7. `onModuleInit()` — TBR exists, OTBR reachable → logs operational
8. `onModuleInit()` — TBR exists, OTBR unreachable → logs warning

**Docker-compose validation (manual):**

9. `docker compose -f docker-compose.yml -f docker-compose.thread.yml config` → valid YAML
10. Start OTBR container → health check passes
11. OTBR REST API responds at port 8081
12. Stop OTBR container → Attraccess logs warning but continues running

---

## Security Checklist

- [ ] OTBR container runs with `privileged: true` — documented risk (required for network config). Mitigated by: trusted Docker host, isolated container, no user input to container.
- [ ] OTBR REST API on port 8081 — should only be accessible from Attraccess. Document firewall recommendation: block 8081 from external access.
- [ ] `OTBR_RADIO_URL` may contain the SLZB-06 IP — not a secret, but document that it's a local network address.
- [ ] Thread dataset volume (`otbr-data`) contains network keys — volume should not be accessible to other containers.
- [ ] OTBR container health check uses `curl` to localhost only — no external calls.
- [ ] Docker override file approach ensures Thread support doesn't affect deployments that don't need it.

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `docker-compose.thread.yml` |
| **Create** | `apps/api/src/matter/thread/otbr-lifecycle.service.ts` |
| **Create** | `apps/api/src/matter/thread/otbr-lifecycle.service.spec.ts` |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add lifecycle service) |
| **Modify** | `apps/api/src/matter/matter-device.controller.ts` (extend health endpoint) |
| **Modify** | `.env.docker-compose.example` or equivalent (add OTBR env vars) |

---

## Definition of Done

- [ ] `docker-compose.thread.yml` starts OTBR container with correct config
- [ ] OTBR health check works in docker-compose
- [ ] Lifecycle service detects OTBR state on startup
- [ ] Health endpoint includes Thread status
- [ ] Setup flow documented step-by-step
- [ ] Non-Thread deployments completely unaffected
- [ ] All unit tests pass
