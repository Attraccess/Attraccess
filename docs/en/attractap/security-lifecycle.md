# Reader credentials, migration and recovery

The API instance defines one installation boundary. Initial trust and lifecycle changes use an independently protected local path. An HTTP administration page, reader JSON and first-use network data cannot establish trust.

Set `READER_SECURITY_DIRECTORY` to an absolute API-account-owned 0700 directory. Its `reader-security.json` and all referenced input files must be API-owned regular 0600 files in owned 0700 directories. Symlinks and unsafe modes are rejected. The API listens on `reader-control.sock` with mode 0600; it exposes no TCP or browser management endpoint. Both encoded requests and responses, including JSON wrappers and newline, are limited to 4,096 bytes. Unknown commands and fields deny.

The configuration contains `installationId`, absolute `serverCertificateFile`, `serverKeyFile`, `readerCaFiles` and `timeKeyFile` paths. Optional `qualificationTrustFile` holds independently installed reviewer public trust. Optional `issuer` contains only `caCertificateFile` and `caKeyFile`. Without an issuer, enrolled readers can validate but issuance denies. Invalid configured issuer material stops configuration validation.

The issuer must be the active configured reader root with CA and certificate-signing usage. Its matching RSA private key must be at least 3072 bits. During two-root overlap, issuance uses the replacement (last) root, never the retiring first root. Roots are never created or downloaded automatically.

The protected `issue` command takes `readerId`, `publicKeyFile` and optional `lifetimeSeconds`. The reader must already exist in this installation. The input is exactly one public RSA-3072 key; private, malformed, multiple, non-RSA and other-size keys deny. The result is certificate PEM only. Issuance neither enrolls the reader nor authorizes operations.

Certificates contain the supplied key, a fixed `CN=reader-ID`, and URI `https://reader.attraccess.invalid/INSTALLATION-UUID/ID` (an identifier, not a network request). They use SHA-256/RSA, critical CA=false and digitalSignature, with clientAuth only. Positive serials contain 144 random bits in 19 encoded octets. Lifetime defaults to 86,400 seconds; integers from 1 through 31,536,000 are accepted and clipped to issuer expiry. Time comes from whole-second API UTC. Protect the API host's clock. Native Node verifies issued credentials independently. The Node production dependency is node-forge 1.4.0; manufacturing Python is not an API issuer dependency. Private signing buffers are cleared without caching, but managed-memory clearing is best effort.

Use the exported `sendReaderSecurityCommand` API-host client with a newline-delimited request such as:

```json
{ "command": "issue", "readerId": 17, "publicKeyFile": "/protected/public.pem", "lifetimeSeconds": 86400 }
```

Other commands are `status`, `enroll`, `renew`, `replace`, `transfer`, `revoke`, `configure` and `rewrap-card-keys`. Enrollment commands reference `certificateFile` and `manifestFile`, declare `enrollmentClass`, and optionally request `overlapSeconds`. Production enrollment additionally requires exact artifact/inventory bindings and valid independent hardware qualification. Issued PEM alone is insufficient. Development enrollment never establishes production eligibility.

## Renewal and trust

Renewal adds a certificate generation for the same reader and DS key. Certificates remain globally unique. Database insert/update checks prevent another reader from claiming a key, including keys in revoked or retired rows. Reader and key ownership fields cannot be relabeled. Identity rotation can provision a new key; replacement hardware must use a distinct key. Ownership transfer must preserve the original reader identity or revoke it and provision a distinct replacement identity.

Enrolled readers cannot be deleted, including after revocation or retirement. The API returns HTTP 409 and directs operators to revoke them instead. Database triggers preserve both the reader ID and credential history, so deletion cannot free a key for another reader or make a secured reader eligible for legacy authentication. Readers that have never enrolled a secured identity can still be deleted. The upgrade protects existing retained records without rewriting credentials; it cannot reconstruct ownership records deleted before the fix. Restoring such a database requires trusted historical evidence before reusing any affected identity. Both reader-security migrations refuse rollback before removing any guards or schema whenever credential history exists, including revoked and retired credentials. Rollback and reapplication are supported only before the first enrollment.

At most two credential generations may overlap. Overlap defaults to zero and cannot exceed 24 hours or either credential's validity. Revocation, expiry and retirement take precedence. Lifecycle success waits for affected connections and pending proof/work cancellation. Startup rechecks stored credentials. Signed-time lookup considers generations newest first and skips invalid, expired, retired, revoked or untrusted rows; historical same-key rows cannot shadow a valid renewal.

The same two-generation, at-most-24-hour policy governs reader server trust. Time verification has at most two explicitly provisioned signing generations; retire old keys through the protected path. No third generation or network bootstrap changes trust. Disconnected readers need protected recovery. Hardware signing/revocation capacity is finite; plan replacement before exhausting it.

Every connection automatically obtains signed time with a fresh challenge before TLS. No per-boot operator command is needed. The API requires accurate UTC and separate RSA-3072 online time-signing material. Replies bind installation, reader key, key generation and challenge, and expire after five monotonic seconds. Unsigned display/SNTP time cannot change security validity. Outages block sessions; bounded retries use fresh challenges and recover automatically.

Time admission uses actual socket peers, ignoring forwarding headers: one request/second, burst two, and at most 1,024 peer buckets. Each admission removes buckets older than 60 seconds; exactly 60 seconds is retained. A new peer at capacity is rejected before identity lookup or signing.

## Storage, backups and feature limits

Card keys use independent random 16-byte values. Server envelopes use AES-256-GCM with key ID, 12-byte IV, 16-byte tag and bound record context. Configure the protected keyring independently of `AUTH_SESSION_SECRET`. Missing or unknown key IDs and corrupted envelopes deny. Metadata queries do not decrypt; HTTP key export denies even for administrators.

Local rewrapping transactionally imports legacy ciphertext or plaintext without changing card keys, IDs, UIDs, active state or slot metadata. It checks original stored contents before writing, detects conflicts and is idempotent on retry. Back up the encrypted database and protected keyring separately. Retain old keys for retained backups; test restoration before retiring them. Back up issuer, time and server trust separately with restricted access. Rewrapping is not on-card key rotation: ATT-950 must authenticate, replace and cryptographically confirm actual card keys before activation.

Until ATT-950 supplies actual verification, card authentication/enrollment/reset/supervision, reader top-ups and reader user-project responses deny. Cached user IDs, UIDs, reader success and fabricated proofs cannot authorize them. Browser billing/project services retain their authorization. Offline reader authorization fails closed. Existing card and organization-slot records remain intact for later integration. ATT-1033 retains its BLE ownership protocol and must carry later traffic through the protected channel.

Legacy readers retain registration/authentication and firmware exchanges with update-only capability. Secured identities cannot fall back to bearer authentication. Updating a bridge does not enable operational access or convert it to a locked production reader. See [firmware updates](firmware-updates.md). After locking, recovery must use a qualified signed image and approved protected process; unrestricted USB/browser reflashing is not promised.

## Transport and memory limits

Protected TLS runs over the versioned binary WS route with `attraccess-reader-v1`. Plain WS is supported; optional outer WSS cannot weaken inner verification. TLS 1.2 uses ECDHE-RSA-AES256-GCM-SHA384, RSA-3072 identity and SHA-256-or-stronger certificate signatures. No cleartext fallback, resumption, early data or renegotiation is permitted.

One firmware handshake and 16 pending API connections are allowed. Phases expire after 30 seconds. Heartbeat is every 20 seconds; authenticated inbound inactivity closes after 60 seconds. JSON is capped at 8,192 bytes, envelopes at 8,200, reassembled WS messages and OTA chunks at 4,096. TLS plaintext input is 16 KiB, output fragments 4 KiB, ciphertext queues 32 KiB per direction. APDU frames remain rejected pending ATT-950. Oversized output denies before emission.

ArduinoJson 7.4.2 has a 32,768-byte parser allocation ceiling including headers, alignment and live replacement storage. Original 17,901-byte host use selected that next-power-of-two ceiling; stricter accounting measured 21,228 bytes. The rich 7,933-byte fixture contains ten resources and 70 buttons. Body copies, handler storage, TLS buffers and queues are separate costs. Host measurements do not prove device RAM headroom. Complex in-limit JSON can fail closed; parsing failures publish no partial resource snapshot. Sensitive parser/session storage uses internal RAM and is cleared on teardown. Production diagnostics retain bounded nonsecret summaries without raw dump blobs; acknowledgment clears the retained summary and rejection preserves it.
