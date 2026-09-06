# WAGO credential rotation

The authenticated administration operation changes the controller's broker password,
persists an encrypted recovery copy, hands it to the running controller, and waits
up to 30 seconds for the controller to reconnect with the persisted credentials.
Only that reconnect acknowledgement completes `wago.credential_rotation`. The API
returns a rotation revision and state, never the password or recovery token.

The operation requires runtime capability `credential-rotation-v1`. Its broker topic
policy must allow the controller to subscribe to
`<namespace>/v1/controllers/<hardwareId>/credentials/rotate` and publish under its
own controller namespace. Initial credential provisioning must include this
subscription. The rotation request is never retained; the completion acknowledgement
is retained and contains only its revision, correlation token, and `reconnected`
status. Older runtimes fail admission before the broker password changes.

The runtime persists the new credentials and rotation revision before reconnecting
its existing MQTT client. This keeps output management on the same runtime instance.
It acknowledges only after MQTT authentication succeeds with credentials matching
the saved state. Restart republishes that acknowledgement; lower revisions and
different tokens for an already accepted revision are rejected.

## Recovery

A timeout, lost response, or interrupted handoff leaves encrypted pending state.
An explicit retry uses that saved password and token; it does not call the broker's
rotation operation again. Broker implementations that disconnect existing clients
immediately on password change may prevent the handoff. They require explicit
controller recovery rather than a claim of successful rotation.

An interruption between the broker mutation and saving its returned credential
leaves a `provisioning` recovery record. The broker outcome is uncertain and automatic
re-rotation is refused. Explicit controller removal can recover this state: recover
the controller-operation lease first, validate the original broker, revoke its
credential with the existing removal workflow, and then delete its registration.
The recovery row is deleted by the controller foreign-key cascade. Manual broker
instructions alone never count as completed revocation or rotation.

All operations run within the existing controller-operation lease. The owner must
pass its `assertOwned`, abort signal, and deadline into the rotation service and call
`assertRemovalBroker` before existing removal revokes credentials. The module owns
no second controller lock. Register `WagoCredentialRotationEntity`,
`WagoCredentialRotationService`, and `WagoCredentialRotation1780010610000` in the
plugin. The HTTP owner must authenticate with `system.settings.manage`, derive the
principal from the authenticated request, and require explicit rotation/retry intent.

Completed rows retain the monotonically increasing revision. Downgrade refuses to
erase any rotation history while its controller registration remains. Recovery
credentials use the host's existing encrypted-secret seam; audit events never contain
credentials, broker payloads, or manual instructions.

Software fixture acceptance does not qualify a physical controller, broker deployment,
or supported hardware release.
