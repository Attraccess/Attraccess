# Production reader security

Production rollout is blocked until independent hardware qualification passes for the exact inventory and images. Host tests and signed builds do not qualify a physical reader. No eFuse writes, locking or production rollout are part of this software delivery.

The intended target is an attacker with an opened enclosure, seven days and EUR 1,000 of equipment. Qualification covers supported APIs, USB/UART/JTAG, flash programmers, flash copying, bus observation and modified firmware. Resistance to fault injection, side channels and invasive extraction is unproven. Stronger claims require suitable hardware and competent testing. DS proves use of a key; it does not attest healthy firmware or prevent relay, use of stolen genuine hardware, server compromise or actuator bypass.

## Build and trust boundaries

Use project-local ESP-IDF v6.0.2. `INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh` installs or repairs it. Shared setup also installs `.tools/reader-provisioning`, an isolated Python environment with esp-secure-cert-tool 2.6.1 and the exact hashed closure in `tools/requirements-provisioning.txt`. It does not modify IDF's environment or global Python. Setup succeeds only after dependency checks pass; rerun it after an incomplete installation.

Use separate reader identity, DS HMAC root, server TLS, signed-time, firmware-signing and card-encryption keys. Each reader needs a unique identity and DS HMAC root. Flash Encryption and NVS roots must also be unique per device and purpose. Never put private identity material, HMAC roots or card keys in firmware source, arguments, logs, manifests or support archives.

Offline DS preparation uses only the vendor's `calculate_rsa_ds_params` for ESP32-S3 with a protected RSA-3072 key and 32-byte HMAC root. It never calls vendor automatic flashing or eFuse configuration. The retained IDF representation is 1,604 bytes: a little-endian length, 16-byte IV and 1,584-byte ciphertext. Temporary private snapshots are removed on every exit; deletion does not promise disk erasure.

```bash
.tools/reader-provisioning/bin/python apps/attractap/firmware/tools/provision_reader.py prepare-ds \
  --private-key-file /protected/reader.pem \
  --hmac-key-file /protected/hmac.bin \
  --output /protected/ds.bin
```

Input files must be operator-owned regular 0600 files in owned 0700 directories. Outputs must not already exist. Only encrypted DS parameters and public credentials belong on the reader. A host result does not establish that DS operates on real hardware.

The production overlay enables Secure Boot v2, release Flash Encryption, NVS Encryption, anti-rollback with security version 1, DS signing and restricted debug/download access. It disables interactive consoles and raw dumps while retaining bounded nonsecret boot summaries. Development and demo images are outside the production protection claim.

The preserved 16 MiB layout has OTA slots at `0x10000` and `0x650000`, each `0x640000` bytes. NVS keys occupy `0xfe0000/0x1000`; identity occupies `0xfe1000/0x1f000`, replacing former dump space. The signed bootloader has a 32,768-byte limit. Reject unknown geometry, overlap, overflow or an image that does not fit. Bridge OTA never repartitions or burns eFuses; production transition requires protected local reprovisioning.

Build all six bridge variants explicitly from the repository root:

```bash
python3 apps/attractap/firmware/build_firmwares.py --variants \
  attractap-touch attractap-touch-v2 attractap-lite-ethernet \
  attractap-touch-ethernet attractap-touch-demo attractap-touch-v2-demo
```

The default non-production build selects all six variants. Production builds exclude both demo variants. Firmware source changes must increase `version.txt` above the merge-base version, as enforced by `tools/check-version.mjs` and the shared release-version check. The integration baseline is 1.6.8, so the security delivery uses 1.6.9.

Build four non-demo production overlays with `--production --signing-key-file /protected/firmware-signing.pem`. Keep test signing keys disposable and clearly separated from production. Unqualified output stays under `build/unqualified-production-output`; it must not enter deployable catalogs. Catalog creation, API asset copying and API selection require independently signed qualification matching the artifacts. Do not bypass the gate by renaming or copying an image.

See [hardware qualification](hardware-qualification.md) before provisioning apply, and [lifecycle and recovery](security-lifecycle.md) before key or trust changes.

## Preparing a provisioning bundle

Generate a fresh 32-byte DS HMAC root for every reader with an operating-system cryptographic random source. Do not reuse roots across devices or purposes. Save the nonsecret DS receipt with `prepare-ds --metadata-output /protected/ds.json`; preparation binds the encrypted DS bytes, public-key fingerprint and HMAC commitment. Do not substitute a private key for the API's protected public-key input when obtaining the certificate.

The explicit `inventory --port PORT --board VARIANT --module MODULE --output /protected/inventory.json` command reads a device without resetting it. It is distinct from offline preparation. It records public identity/security fields and whether key blocks are empty or occupied; it does not retain readable eFuse key bytes. No physical inventory was captured in this software delivery.

`prepare-bundle --request-file /protected/request.json --output-directory /protected/new-bundle` prepares the reviewed layout using the pinned NVS encryption tool and an explicit operating-system-generated NVS key. The request contains:

- Positive `readerId`, installation UUID `installationId`, `inventoryFile`, and free `hmacId` (0–5).
- Protected `dsFile`, `dsMetadataFile` and API-issued `certificateFile` paths.
- One initial `serverCaFiles` entry, and one or two `timeKeys` entries containing `id` and `publicKeyFile`.
- Signed `applicationFile`, `bootloaderFile`, reviewed `partitionFile`, and the future independently signed `qualificationFile` reference. Preparation records its basename; place that receipt beside `reader-manifest.json` before apply or API enrollment. Both paths resolve the same bundle-local filename. Preserve the manifest bytes when signing qualification.

The output contains encrypted identity NVS, protected NVS keys, signed images, initialization images and a nonsecret `reader-manifest.json`. Preserve these exact files for review. Preparation grants no production eligibility. The initial provisioning path rejects missing, unreadable or unknown silicon revisions, invalid board/module labels, unknown geometry, insufficient free key-purpose blocks and conflicting protection state; it does not offer a force override for locked devices.

`apply --manifest-file ... --hmac-key-file ... --qualification-trust-file ...` defaults to a qualification-checked dry-run without serial access. `--execute --port PORT` is an irreversible manufacturing action requiring independently reviewed qualification and freshly matching actual inventory. It burns the DS root with the vendor tool, confirms its purpose and read/write protections, then writes the reviewed images without automatically resetting the reader. The qualified first boot runs the IDF production bootloader's protection transition. The tool reports that this physical first boot and final protection verification are still required; writing images is not proof of a locked reader.

An exclusive bundle lock prevents concurrent apply executions from inspecting stale inventory or writing the same journal. The lock is held until apply finishes. An operation journal is persisted before irreversible work. After interruption, a previous journal or mismatched inventory stops the tool for protected recovery; it never guesses which key was burned or repeats an uncertain write. Retain the journal and fresh inventory for independent review. This run does not execute apply, burn eFuses or perform that first boot.

## Software memory evidence

`pnpm nx run attractap-firmware:test` exercises the actual TLS libraries, signed-time verifier, production WebSocket owner loop and parser with software signing keys. Its `MEMORY` lines separate library allocation peaks from session objects and queue/envelope allocations. Run `ctest --test-dir apps/attractap/firmware/tests/security/build -V` to see parser current/peak storage, pointer width, ArduinoJson version, handler storage, dynamic copies and received input storage for each fixture.

These are host requested-byte measurements. Fixed object sizes include their embedded fields and must not be added again to their component sizes. Library allocation peaks include certificate/key operations as well as TLS. Host allocation overhead, IDF allocator behavior, task stack peaks and physical DS memory use are not established by these measurements. Real-device RAM headroom and hardware security qualification remain outstanding.

The API validates its protected configuration at startup and after the local configuration-install command. Readiness uses that installed snapshot; public certificate verification is bounded and cached, while registry revocation, retirement and validity remain checked. Replace trust through the protected install command (or restart after offline changes); editing a file alone does not invalidate a running snapshot. Issuer signing keys are loaded only for startup/install validation and issuance, never retained in the snapshot. Standalone language updates require a protected connection; legacy authentication responses still carry the current language.
