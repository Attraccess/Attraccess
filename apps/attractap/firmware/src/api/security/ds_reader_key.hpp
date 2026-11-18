#pragma once

#include <memory>

#include "reader_key_store.hpp"

// The reader's RSA-3072 identity key in the ESP32-S3 Digital Signature peripheral (ATT-1207). Secure
// builds on the device only; plain builds stay ECDSA-only.
//
// Integration: ESP-IDF v6.0.2 ships a PSA opaque driver for the DS peripheral
// (PSA_KEY_LIFETIME_ESP_RSA_DS_VOLATILE, the one esp-tls uses). The key is imported as an opaque PSA
// RSA key pair; mbedTLS signs the TLS 1.3 CertificateVerify (rsa_pss_rsae_sha256) and the identity upgrade signs
// its proof through ReaderIdentity::signRsaPssSha256 (psa_sign_hash on keyId()). The driver keeps pointers
// into our DS data, so DsReaderKey owns it.
// Only the encrypted DS parameters (DS record) exist in flash; the HMAC key that decrypts them lives
// read-protected in eFuse KEY3 and never leaves the chip.
#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)
#include "ds_record.hpp"

struct DsReaderKeyImpl;

class DsReaderKey : public IReaderKey
{
public:
    ~DsReaderKey() override;
    DsReaderKey(const DsReaderKey &) = delete;
    DsReaderKey &operator=(const DsReaderKey &) = delete;

    // Imports the record's parameters as an opaque PSA key. Null when KEY3 is not a DS key or the import fails.
    static std::unique_ptr<DsReaderKey> fromRecord(const DsRecord::Record &record);

    Algorithm algorithm() const override { return Algorithm::Rsa3072Ds; }
    const std::vector<uint8_t> &publicKeySpki() const override { return spki; }
    mbedtls_svc_key_id_t keyId() const override { return key; }

private:
    DsReaderKey() = default;

    mbedtls_svc_key_id_t key = MBEDTLS_SVC_KEY_ID_INIT;
    std::vector<uint8_t> spki;
    std::unique_ptr<DsReaderKeyImpl> impl;
};

class DsReaderKeyStore : public IReaderKeyStore
{
public:
    enum class Status
    {
        // A valid DS record and KEY3 holds the DS purpose.
        Available,
        // KEY3 is a DS key but the record is missing or invalid: DS is gone, the reader falls back to
        // its P-256 software identity and never re-burns.
        ParamsMissing,
        // KEY3 is not a DS key (the lab creation or T3's conversion has not run).
        NoKey,
    };

    static Status status();
    static const char *statusName(Status status);
    // The DS key when status() is Available.
    std::unique_ptr<IReaderKey> load() override;
    // A DS key cannot be created here (see DsCreator); this is the same as load().
    std::unique_ptr<IReaderKey> createNew() override { return load(); }
    // The DS key is never deleted.
    bool erase() override { return false; }
};
#endif
