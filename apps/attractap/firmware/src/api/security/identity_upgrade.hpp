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
namespace IdentityUpgrade
{
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
