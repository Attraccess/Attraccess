# Back up Matter fabric identity with Attraccess

The Matter Sidecar's persistent Fabric Identity is part of an Attraccess installation's durable state and must be backed up and restored together with core data. Supported deployment and backup flows must preserve encrypted sidecar storage and prove that a restored installation reconnects to already commissioned devices; restoring only core or only the sidecar is not a supported complete recovery.
