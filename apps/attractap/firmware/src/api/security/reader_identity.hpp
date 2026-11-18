#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "psa/crypto.h"

// The reader's identity key. Everything outside the key classes only sees IReaderKey: the algorithm, the public
// key (canonical SPKI, as sent in pairing and the identity upgrade) and a PSA key id that TLS and the upgrade proof
// sign with. Two implementations:
//  - SoftwareReaderKey: ECDSA P-256 in a PSA volatile slot, persisted in NVS (every build).
//  - DsReaderKey (ds_reader_key.hpp, secure builds on the device): RSA-3072 held by the ESP32-S3 Digital
//    Signature peripheral (ATT-1207); the private key is never exportable.
class IReaderKey
{
public:
    enum class Algorithm
    {
        // ECDSA P-256 with SHA-256; TLS signs ecdsa_secp256r1_sha256.
        EcdsaP256,
        // RSA-3072 in the ESP32-S3 Digital Signature peripheral (ATT-1207): TLS and the upgrade proof sign
        // RSA-PSS SHA-256 (salt 32).
        Rsa3072Ds,
    };

    virtual ~IReaderKey() = default;
    virtual Algorithm algorithm() const = 0;
    // Canonical SubjectPublicKeyInfo DER: uncompressed P-256 (91 bytes) or RSA-3072 with e = 65537
    // (RsaDer::SPKI_BYTES).
    virtual const std::vector<uint8_t> &publicKeySpki() const = 0;
    // PSA key the signatures run on: ECDSA SHA-256 for P-256, RSA-PSS SHA-256 for the DS key.
    virtual mbedtls_svc_key_id_t keyId() const = 0;
};

struct mbedtls_pk_context;

// Software key in a PSA volatile slot, persisted as the raw 32-byte private scalar.
class SoftwareReaderKey : public IReaderKey
{
public:
    ~SoftwareReaderKey() override;
    SoftwareReaderKey(const SoftwareReaderKey &) = delete;
    SoftwareReaderKey &operator=(const SoftwareReaderKey &) = delete;

    static std::unique_ptr<SoftwareReaderKey> generate();
    static std::unique_ptr<SoftwareReaderKey> fromPrivateKey(const uint8_t *scalar, size_t length);

    // Raw private scalar for NVS. Callers wipe the buffer after use.
    bool exportPrivateKey(std::vector<uint8_t> &out) const;

    Algorithm algorithm() const override { return Algorithm::EcdsaP256; }
    const std::vector<uint8_t> &publicKeySpki() const override { return spki; }
    mbedtls_svc_key_id_t keyId() const override { return key; }

private:
    SoftwareReaderKey() = default;
    bool loadPublicKey();

    mbedtls_svc_key_id_t key = MBEDTLS_SVC_KEY_ID_INIT;
    std::vector<uint8_t> spki;
};

namespace ReaderIdentity
{
    constexpr size_t SPKI_BYTES = 91;
    constexpr size_t PRIVATE_KEY_BYTES = 32;

    // Wraps an uncompressed P-256 point (65 bytes) into the canonical SPKI DER.
    std::vector<uint8_t> spkiFromPoint(const uint8_t *point, size_t length);
    // True for exactly the canonical uncompressed P-256 SPKI form.
    bool isCanonicalP256Spki(const std::vector<uint8_t> &spki);

    // Wraps the key's PSA handle into `pk`. A Digital Signature key has no exportable public key, so its
    // public part (from the DS record) is preset in the context and the wrap never asks PSA for it.
    int wrapKey(mbedtls_pk_context &pk, const IReaderKey &key);

    // RSA-PSS SHA-256 (MGF1-SHA256, salt 32) over `message` with an RSA-3072 key (the identity upgrade proof).
    // False for any other key or when signing fails.
    bool signRsaPssSha256(const IReaderKey &key, const std::vector<uint8_t> &message, std::vector<uint8_t> &signature);

    // Self-signed certificate over the reader key for the first (bootstrap) session: the server
    // looks the key up by fingerprint and answers with the issued certificate. DER output.
    bool selfSignedCertificate(const IReaderKey &key, std::vector<uint8_t> &der);
}
