#pragma once

#include <cstdint>
#include <string>
#include <vector>

// Persisted pairing identity of the reader (NVS namespace "readerpair"):
//  - key:  the reader's private key (raw P-256 scalar); only SoftwareReaderKeyStore reads it
//  - ca:   the pinned installation CA public key (SPKI), set when an admin approved the pairing
//  - rid / inst / cert: reader ID, installation ID and issued certificate (DER) from the bootstrap
//    session grant
//  - floor: trusted-time floor in Unix seconds (see TrustedTime)
// Erasing the pin or the key of a paired reader (one with a certificate) is only done after an
// authenticated rejection from the pinned server; nothing that arrives outside the TLS session can
// do it. A reader whose first session never reached a verifiable server forgets the pin (not the
// key) after a few attempts, see ReaderLink::abandonBootstrap.
struct ReaderCredentials
{
    std::vector<uint8_t> caSpki;
    uint32_t readerId = 0;
    std::string installationId;
    std::vector<uint8_t> certificate;

    bool paired() const { return !caSpki.empty(); }
    bool hasCertificate() const { return paired() && readerId != 0 && !installationId.empty() && !certificate.empty(); }
};

namespace CredentialStore
{
    ReaderCredentials load();
    // The stored private key (empty when none). The caller wipes it after use.
    std::vector<uint8_t> loadPrivateKey();
    // A new identity: stores the key and drops everything bound to the previous one.
    bool saveNewKey(const std::vector<uint8_t> &privateKey);
    bool eraseKey();
    // Which key the pairing was made with (ATT-1207): the DS key or the P-256 software key. Written when the
    // pin is saved; the certificate's own public key decides once there is one. Unknown on readers
    // paired before this existed.
    enum class IdentityKind
    {
        Unknown,
        Software,
        Ds,
    };
    IdentityKind identityKind();
    bool saveIdentityKind(IdentityKind kind);
    // Drops pin, grant and certificate but keeps the key: a new pairing with the same (DS) key.
    bool clearPairing();
    // The certificate the server issued for the DS key after an identity upgrade, and the matching kind.
    bool saveUpgradedCertificate(const std::vector<uint8_t> &certificate);
    // Test hook (ATTRACTAP_TEST_HOOKS): the next boot ignores the DS key and pairs with a fresh P-256 key.
    bool setForceSoftwareIdentity(bool force);
    bool consumeForceSoftwareIdentity();
    bool savePin(const std::vector<uint8_t> &caSpki);
    // Forgets the pinned CA and everything bound to it; keeps the reader key. Only for a reader
    // whose bootstrap session never reached a verifiable server (no certificate yet).
    bool clearPin();
    bool saveGrant(uint32_t readerId, const std::string &installationId, const std::vector<uint8_t> &certificate);
    bool saveCertificate(const std::vector<uint8_t> &certificate);

    uint32_t timeFloorSeconds();
    bool saveTimeFloorSeconds(uint32_t seconds);
}
