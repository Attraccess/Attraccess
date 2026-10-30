#pragma once

#include <cstdint>
#include <string>
#include <vector>

// Persisted pairing identity of the reader (NVS namespace "readerpair"):
//  - key:  the reader's private key (raw P-256 scalar)
//  - ca:   the pinned installation CA public key (SPKI), set when an admin approved the pairing
//  - rid / inst / cert: reader ID, installation ID and issued certificate (DER) from the bootstrap
//    session grant
//  - floor: trusted-time floor in Unix seconds (see TrustedTime)
// Erasing the pin or the key is only done after an authenticated rejection from the pinned
// server; nothing that arrives outside the TLS session can do it.
struct ReaderCredentials
{
    std::vector<uint8_t> privateKey;
    std::vector<uint8_t> caSpki;
    uint32_t readerId = 0;
    std::string installationId;
    std::vector<uint8_t> certificate;

    bool hasKey() const { return !privateKey.empty(); }
    bool paired() const { return !caSpki.empty(); }
    bool hasCertificate() const { return paired() && readerId != 0 && !installationId.empty() && !certificate.empty(); }
};

namespace CredentialStore
{
    ReaderCredentials load();
    // A new identity: stores the key and drops everything bound to the previous one.
    bool saveNewKey(const std::vector<uint8_t> &privateKey);
    bool savePin(const std::vector<uint8_t> &caSpki);
    bool saveGrant(uint32_t readerId, const std::string &installationId, const std::vector<uint8_t> &certificate);
    bool saveCertificate(const std::vector<uint8_t> &certificate);

    uint32_t timeFloorSeconds();
    bool saveTimeFloorSeconds(uint32_t seconds);
}
