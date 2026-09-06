# WAGO Development Signing

The visual runtime importer trusts the packaged Attraccess release public key by
default, including in development. It does not trust keys embedded in uploaded
signatures and does not accept public-key uploads.

For an explicitly configured development installation only, the owner can set
both of these variables on the API process before startup:

```text
NODE_ENV=development
WAGO_CC100_RUNTIME_SIGNING_PUBLIC_KEY_PATH=/absolute/path/to/development.pub
```

The file must contain one OpenSSH `ssh-ed25519` public key, optionally followed by
a comment. Keep the private signing key separate; the API needs only the public
key. This setting replaces the release trust anchor, rather than adding another
trusted signer. A missing or whitespace-only setting keeps the release default.

Any nonempty override outside exactly `NODE_ENV=development` is rejected before
the file is read, including in production, test, or an unset environment. Missing,
unreadable, or malformed configured keys fail closed; there is no fallback or
signature bypass.

The visual importer reads and pins the public-key bytes when its service is
constructed. Import, selected-artifact validation, and delivery snapshot
verification all use that same key. Changing the file or environment afterward
does not rotate an existing service's trust. Restart the API to deliberately
change the key; artifacts signed by the previous key cannot pass validation or
delivery under the new key, even if retained catalog metadata is still listed.

Use the normal visual import flow with the signed runtime tar, matching SHA-256
sidecar, and SSHSIG signature. Development signing does not relax checksum,
signature namespace, manifest compatibility, immutable image reference, archive,
or delivery snapshot checks. It does not replace controller-side image checks or
authorize an installation. The owner alone performs live imports and delivery.

The legacy commissioning path already recognizes the same development-only
setting. This change does not modify that service or its separate key-file
loading lifecycle.
