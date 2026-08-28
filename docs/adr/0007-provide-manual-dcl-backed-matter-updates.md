# Provide manual DCL-backed Matter updates

The Matter Sidecar will use matter.js OTA Provider capabilities to discover vendor-published updates through the Distributed Compliance Ledger, validate applicability and artifacts, and serve updates after explicit administrator approval. Attraccess will not deploy the connectedhomeip reference provider as production infrastructure and will not implement automatic rollouts in this milestone.

Locally uploaded images are permitted only when the dangerous development override is enabled and must pass exact Matter header, VID, PID, and version checks. Attraccess does not claim to replace vendor-specific firmware-signature verification or device rollback protections.
