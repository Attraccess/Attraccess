#include "identity_proof.hpp"

namespace
{
    void appendField(std::vector<uint8_t> &out, const uint8_t *data, size_t length)
    {
        out.push_back(static_cast<uint8_t>(length >> 24));
        out.push_back(static_cast<uint8_t>(length >> 16));
        out.push_back(static_cast<uint8_t>(length >> 8));
        out.push_back(static_cast<uint8_t>(length));
        out.insert(out.end(), data, data + length);
    }

    void appendField(std::vector<uint8_t> &out, const std::string &text)
    {
        appendField(out, reinterpret_cast<const uint8_t *>(text.data()), text.size());
    }

    void appendField(std::vector<uint8_t> &out, const std::vector<uint8_t> &bytes)
    {
        appendField(out, bytes.data(), bytes.size());
    }
}

namespace IdentityProof
{
    std::vector<uint8_t> tuple(const std::string &installationId, uint32_t readerId,
                               const std::vector<uint8_t> &oldFingerprint, const std::vector<uint8_t> &newSpki,
                               const std::vector<uint8_t> &nonce)
    {
        std::vector<uint8_t> out;
        out.reserve(newSpki.size() + 160 + installationId.size());
        appendField(out, std::string(DOMAIN));
        appendField(out, installationId);
        appendField(out, std::to_string(readerId));
        appendField(out, oldFingerprint);
        appendField(out, newSpki);
        appendField(out, nonce);
        return out;
    }
}
