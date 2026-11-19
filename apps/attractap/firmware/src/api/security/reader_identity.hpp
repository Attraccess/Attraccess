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
    virtual ~IReaderKey() = default;
    // Canonical uncompressed P-256 SubjectPublicKeyInfo (91 bytes).
    virtual const std::vector<uint8_t> &publicKeySpki() const = 0;
    // PSA key usable for ECDSA with SHA-256 (mbedtls_pk_wrap_psa).
    virtual mbedtls_svc_key_id_t keyId() const = 0;
};

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

    // Self-signed certificate over the reader key for the first (bootstrap) session: the server
    // looks the key up by fingerprint and answers with the issued certificate. DER output.
    bool selfSignedCertificate(const IReaderKey &key, std::vector<uint8_t> &der);
}
