#include "identity_upgrade.hpp"

#include <ArduinoJson.h>

#include "identity_proof.hpp"
#include "pairing_codec.hpp"
#include "psa/crypto.h"
#include "rsa_der.hpp"

namespace IdentityUpgrade
{
    bool shouldRequest(Trigger trigger, const RequestState &state)
    {
        if (!state.candidate || state.requested || !state.storageReady)
        {
            return false;
        }
        return trigger == Trigger::ServerRecover || !state.blocked;
    }

    std::string requestMessage()
    {
        return "{\"t\":\"identity.upgrade.request\"}";
    }

    bool fingerprint(const std::vector<uint8_t> &spki, std::vector<uint8_t> &out)
    {
        out.assign(IdentityProof::FINGERPRINT_BYTES, 0);
        size_t length = 0;
        if (psa_crypto_init() != PSA_SUCCESS ||
            psa_hash_compute(PSA_ALG_SHA_256, spki.data(), spki.size(), out.data(), out.size(), &length) != PSA_SUCCESS ||
            length != out.size())
        {
            out.clear();
            return false;
        }
        return true;
    }

    bool upgradeMessage(const Context &context, const std::string &nonceBase64, std::string &out)
    {
        std::vector<uint8_t> nonce;
        std::vector<uint8_t> oldFingerprint;
        if (!context.sign || context.readerId == 0 || context.installationId.empty() ||
            !RsaDer::isCanonicalRsa3072Spki(context.newSpki) ||
            !PairingCodec::base64Decode(nonceBase64, nonce) || nonce.size() != IdentityProof::NONCE_BYTES ||
            !fingerprint(context.oldSpki, oldFingerprint))
        {
            return false;
        }
        const std::vector<uint8_t> tuple =
            IdentityProof::tuple(context.installationId, context.readerId, oldFingerprint, context.newSpki, nonce);
        std::vector<uint8_t> proof;
        if (!context.sign(tuple, proof))
        {
            return false;
        }
        JsonDocument doc;
        doc["t"] = "identity.upgrade";
        doc["spki"] = PairingCodec::base64Encode(context.newSpki);
        doc["proof"] = PairingCodec::base64Encode(proof);
        out.clear();
        serializeJson(doc, out);
        return true;
    }
}
