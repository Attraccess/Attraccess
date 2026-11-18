#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

// Reader side of the identity upgrade (ATT-1207): a reader paired with its P-256 software key moves its
// server identity to the RSA-3072 DS key. Inside the authenticated P-256 session:
//   reader -> {"t":"identity.upgrade.request"}
//   server -> {"t":"identity.challenge","nonce":"<base64, 32 bytes>"}
//   reader -> {"t":"identity.upgrade","spki":"<base64 DS SPKI>","proof":"<base64 RSA-PSS signature>"}
//   server -> {"t":"identity.upgraded","certificate":"<PEM>"}  |  {"t":"identity.upgrade.rejected","reason":"..."}
// The proof signs IdentityProof::tuple (domain separated; binds installation, reader, the old key's
// fingerprint, the new SPKI and the nonce). Pure message code; ReaderLink drives it and owns the key switch.
//
// When the reader asks (shouldRequest):
//  - after READER_FIRMWARE_INFO of the session went out: the server's gate reads the profile from it;
//  - when the server opens an upgrade-only session for the replaced P-256 key ({"t":"identity.recover"}): the
//    reader lost the certificate of an upgrade the server already applied (15 minute window).
namespace IdentityUpgrade
{
    enum class Trigger
    {
        FirmwareInfoSent,
        ServerRecover,
    };

    struct RequestState
    {
        // DS key available and the session runs on the P-256 software key, whose certificate is stored.
        bool candidate = false;
        // Already asked in this session.
        bool requested = false;
        // The server answered `not-allowed` earlier in this boot.
        bool blocked = false;
        // NVS works: the new certificate can be stored before the reconnect.
        bool storageReady = false;
    };

    // Whether to send identity.upgrade.request now. A server-initiated recovery is not held back by an earlier
    // `not-allowed`: the server already applied the upgrade and only re-sends the certificate.
    bool shouldRequest(Trigger trigger, const RequestState &state);

    using Signer = std::function<bool(const std::vector<uint8_t> &message, std::vector<uint8_t> &signature)>;

    struct Context
    {
        std::string installationId;
        uint32_t readerId = 0;
        // SPKI of the key the current session is authenticated with (the P-256 software key).
        std::vector<uint8_t> oldSpki;
        // SPKI of the DS key and its RSA-PSS signer.
        std::vector<uint8_t> newSpki;
        Signer sign;
    };

    std::string requestMessage();
    // SHA-256 of an SPKI: the credential fingerprint of the old key.
    bool fingerprint(const std::vector<uint8_t> &spki, std::vector<uint8_t> &out);
    // Turns a challenge nonce (base64) into the `identity.upgrade` message. False when the nonce is not 32
    // bytes or signing failed. Neither the nonce nor the proof is ever logged.
    bool upgradeMessage(const Context &context, const std::string &nonceBase64, std::string &out);
}
