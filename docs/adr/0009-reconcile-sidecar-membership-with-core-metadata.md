# Reconcile sidecar membership with core metadata

The Matter Sidecar is authoritative for fabric membership and protocol identity, while Attraccess core is authoritative for user-facing names, metadata, audit, and flow references. Reconciliation quarantines sidecar-only nodes as Unclaimed Matter Devices and marks core-only records as Detached Matter Devices; neither discrepancy is silently promoted or deleted, and mismatched restores require explicit administrator repair.
