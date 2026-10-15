# WAGO recovery procedures

These runbooks use existing configuration, credential, commissioning and signed
runtime-update services. They are preparation procedures with software fixture
exercises; physical recovery and independent reviews remain outstanding. See
[assurance and evidence boundaries](wago-production-assurance.md).

Every procedure requires an authorized Attraccess/broker administrator and a
qualified local operator when hardware is involved. Put the connected equipment
in a safe isolated state first. Stop on a changed SSH fingerprint, unverified TLS,
unknown model/firmware, missing operation ownership, unexpected output writer or
inability to verify that the runtime stopped. Do not bypass those checks. Never
re-enable CODESYS as a recovery shortcut. Preexisting CODESYS/PLC data and other
workloads are not backed up or restored by Attraccess commissioning.

## Recovery assets and snapshot consistency

Retain a coordinated, access-controlled backup of the Attraccess database and
storage, plugin/runtime versions and signed artifact/trust material, the original
host encryption secret (`AUTH_SESSION_SECRET`) and its recovery material, managed SSH recovery records and their
decryption dependencies, and controller-owned runtime state and MQTT trust roots.
Broker users, topic permissions, vhost and active credential epochs must be
reconciled with the restored host/controller snapshot. A database backup alone
does not include device MQTT credentials, controller state, SSH access, trust
roots or the ability to decrypt plugin secrets.

Use the supported database backup procedure. For isolated SQLite exercises, stop
all writers and close the database before copying it; never copy a live SQLite
file without a consistent snapshot mechanism. Drain runtime saves before capturing
state. Protect backup secrets at rest and through transfer. Record snapshot time,
last acknowledged command/revision, encrypted-secret recovery key identifier and
restore time; do not record key values. Commands or configuration changes after the
snapshot are outside its data-loss boundary. Old messages must not be interpreted
as fresh state after restore.

## 1. Configuration and runtime-state restoration

**Actor/assets:** host administrator and local device operator; matching accepted
configuration revision/hash, runtime state, permanent identity/epoch and trust roots.

1. Isolate loads and stop new dependent flows. Verify the controller identity and
   obtain an owned operation before stopping its runtime through supported management.
2. Inspect the last applied host revision and matching controller report. Prefer
   publishing a validated complete configuration or supported configuration rollback
   through the service rather than editing JSON on a running controller.
3. For complete state loss, restore a coordinated runtime/host backup while stopped.
   Keep persisted command identities/expiry and sequence state with that snapshot.
   If credentials no longer match the broker, use credential recovery below.
4. Start through the existing gated runtime path. Require a fresh permanent heartbeat,
   matching revision/hash, accepted configuration and current usable state. Expired
   commands must not replay; inspect unrelated outputs before enabling flows.

**Interruption/stop:** leave flows isolated; retry only with matching identity and
ownership. Corrupt state, save failure, a mismatch or unknown physical output blocks
resumption. Never declare success from retained/offline data alone.

**Evidence/follow-up:** software recovery tests restore matching runtime state and
verify fresh command acknowledgement. Record elapsed restoration time and snapshot
boundary. Physical power loss, packed-register and Modbus observations must still be
repeated on the qualified assembly.

## 2. Credential compromise

**Actor/assets:** broker and host administrators; known identity, epoch, outstanding
rotation record, decryption material and verified controller management access.

1. Isolate affected equipment and stop dependent flows. Identify all active sessions
   and namespaces used by the compromised identity. Do not paste secrets into logs.
2. For immediate containment revoke the compromised broker identity through its
   credential provider. Verify existing sessions close and new authentication with
   the old secret fails. Revoke compromised temporary enrollment identities too.
3. For an uncompromised but overdue password, use the existing rotation service.
   Preserve its pending revision/token/epoch and retry the same handoff after
   interruption; do not manufacture a new success record. The controller persists
   before reconnecting and acknowledges only from the new authenticated connection.
4. For a compromised permanent identity or lost credentials, use supported managed
   recovery/re-enrollment with fresh consent, pinned SSH and a new epoch. Reconcile
   broker policy and host/controller records, then require fresh permanent operation.

**Interruption/stop:** a pending rotation remains uncertain until authenticated
acknowledgement. Missing decryptable management access requires supported local
recovery, not trust bypass or copying another controller's credentials.

**Evidence/follow-up:** assurance tests verify active/new-session revocation and
replacement identity; runtime/credential tests cover retry and stale epochs. Record
containment/recovery times, rejected old identity and first fresh operation. Real
SSH and customer broker compromise exercises remain unrun.

## 3. Broker outage

**Actor/assets:** broker administrator; broker data/config backup, correct private
CA/server identity, separate management account and original per-controller policies.

1. Isolate dependent flows when telemetry becomes stale or commands time out. Treat
   a timed-out command as outcome unknown; inspect fresh state before issuing a new
   command. Never replay expired commands to compensate for missing acknowledgements.
2. Restore the existing broker with the same intended vhost, policies and trust
   chain. Check listener/network/resource limits and recover storage before clients.
3. Allow runtime reconnect and existing subscription retry. Confirm stale queued
   publications are discarded, old/offline values cannot satisfy current waits,
   and new heartbeat/state use fresh sequence/source time.
4. Verify authenticated telemetry, matching configuration, fresh usable state and
   command acknowledgement for each affected identity before resuming flows.

**Interruption/stop:** continue isolation if broker storage, ACLs, TLS or active
sessions cannot be verified. Do not switch to plaintext or shared administrator
credentials to restore apparent connectivity.

**Evidence/follow-up:** the assurance measurement restarts the RabbitMQ application
inside its owned container and measures time to fresh authenticated operation.
Transport tests cover missing PUBACK/SUBACK and stale-publication cleanup. Container,
host, network-partition and real-controller reboot recovery require deployment tests.

## 4. Controller replacement

**Actor/assets:** authorized commissioner and qualified installer; replacement's
actual hardware/firmware identity, wiring map, pinned SSH fingerprint, accepted
configuration and approved signed runtime.

1. Disconnect/isolate the old controller and revoke its permanent and temporary
   identities. Verify old active/new sessions cannot authenticate.
2. Verify replacement model/firmware and wiring against the qualified combination.
   Never assume a software fixture or copied hardware ID proves electrical identity.
3. Start a fresh destructive commissioning/recovery session with explicit consent.
   Verify trust and permanent CODESYS disablement before I/O, use a new identity/epoch,
   and publish a validated complete configuration through the existing service.
4. Review and update affected flow bindings for the replacement controller through
   the flow editor. Require fresh authenticated readiness and matching revision/hash.
   Independently check each physical input/output, packed-bit independence and configured Modbus
   map before enabling dependent flows.

**Interruption/stop:** keep both devices isolated if ownership, wiring, credentials
or output state is uncertain. Retry through the owned session; do not restore the
old credential into an unverified replacement.

**Evidence/follow-up:** the software replacement exercise proves identity replacement
and old-secret rejection. Actual installation, wiring, I/O, Modbus and nontechnical
operator acceptance remain ATT-984 requirements.

## 5. Upgrade recovery

**Actor/assets:** release/host administrator; current and previous verified signed
runtime artifacts, manifests/image identities, trusted signing keys and existing
managed update record/operation ownership.

1. Isolate equipment and inspect the recorded transfer/start/readiness stage. Reject
   unsigned, modified, wrong-platform or untrusted artifacts before deployment.
2. Resume or recover using the existing signed-artifact updater. Preserve operation
   ownership and its journal; do not add a manual container or alternate updater.
3. For failed transfer/start/readiness, use the updater's supported rollback to the
   prior verified artifact. Every launch must repeat the host/I/O gate; rollback
   must never re-enable CODESYS or restore permissive host settings.
4. Confirm the observed runtime image matches the approved image, policy approval
   is current, configuration is applied and a fresh readiness probe succeeds.

**Interruption/stop:** unknown container stop state, failed host observation, missing
artifact/signing trust or inability to reconcile the update journal blocks progress.
Keep the runtime in failsafe until recovery is verified.

**Evidence/follow-up:** `recovery.json` records a coordinated stopped-writer restore
of SQLite, an isolated host-storage tree, encrypted management material and controller
state, followed by fresh authenticated commands. It records the snapshot/data-loss
boundary and elapsed restoration time; it does not prove a customer's backup tools.
`upgrade-recovery.json` records measured transfer, start and readiness failure
recovery through the production coordinator and signed management helper. The
signature verifier and updater run against simulated FW31 host interfaces; prior
image, credentials and the stopped-state checkpoint must survive. Each result is
bound to the runner's source fingerprint. These are not on-device upgrade or
real-SSH evidence. Repeat the full procedure on FW31 with physical observations.

## 6. Disaster recovery

**Actor/assets:** host, broker and backup administrators plus local operator; every
asset listed under snapshot consistency, including the original encryption material
and controller management recovery dependencies.

1. Establish an isolated recovery environment and disable automatic actuation.
   Inventory the snapshot timestamp, credentials/epochs, keys, broker policy and
   exact compatible software. Stop if a secret cannot be decrypted with the original
   recovery material; a newly generated host secret will not decrypt old records.
2. Restore the database and storage consistently while writers are stopped. Restore
   trust roots and verified artifacts through their supported stores. Reconcile
   broker policy and controller state rather than blindly overwriting newer epochs.
3. Verify managed SSH recovery independently before assuming controller reachability.
   If device state/identity cannot be reconciled, revoke the old identity and use
   supported local recovery/re-enrollment with fresh destructive consent.
4. Start existing services, require fresh authenticated heartbeat, matching accepted
   configuration and usable state, then run safe acknowledged commands and physical
   confirmation. Verify old/compromised identities remain rejected.
5. Record restore time, last recoverable acknowledged state, post-snapshot losses,
   outstanding controllers and cleanup. Resume flows only after qualified inspection.

**Interruption/stop:** preserve backups and recovery ownership. Do not overwrite the
only decryptable material or accept stale retained data as proof of success.

**Evidence/follow-up:** the isolated exercise closes writers, restores SQLite/runtime
snapshots and a real encrypted management record, rejects the wrong encryption key
and resumes fresh operation. It proves neither real SSH key recovery nor recovery
of customer storage, physical power loss, firmware or preexisting workloads.
