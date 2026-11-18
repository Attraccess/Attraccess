#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "psa/crypto.h"

// The reader's P-256 identity key. Everything outside this file only sees IReaderKey: the public
// key (canonical SPKI, as sent in pairing) and a PSA key handle that TLS uses for signing. A key
// held in the ESP32-S3 Digital Signature peripheral (ATT-1166) can implement the same interface
// without the private key ever being exportable.
class IReaderKey
{
public:
    enum class Algorithm
    {
        EcdsaP256,
        // RSA-3072 in the ESP32-S3 Digital Signature peripheral (ATT-1207): TLS signs RSA-PSS SHA-256.
        Rsa3072Ds,
    };

    virtual ~IReaderKey() = default;
    virtual Algorithm algorithm() const { return Algorithm::EcdsaP256; }
    // Canonical uncompressed P-256 SubjectPublicKeyInfo (91 bytes).
    virtual const std::vector<uint8_t> &publicKeySpki() const = 0;
    // PSA key usable for ECDSA with SHA-256 (mbedtls_pk_wrap_psa).
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

    // Self-signed certificate over the reader key for the first (bootstrap) session: the server
    // looks the key up by fingerprint and answers with the issued certificate. DER output.
    bool selfSignedCertificate(const IReaderKey &key, std::vector<uint8_t> &der);
}
