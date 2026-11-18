#include "ds_reader_key.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)

#include <cstring>

#include "../../logger/logger.hpp"
#include "ds_storage.hpp"
#include "esp_ds.h"
#include "esp_efuse.h"
#include "identity_proof.hpp"
#include "psa_crypto_driver_esp_rsa_ds.h"
#include "rsa_der.hpp"

struct DsReaderKeyImpl
{
    esp_ds_data_t data;
    esp_ds_data_ctx_t context;
};

namespace
{
    Logger logger("DsKey");

    esp_efuse_block_t blockFor(uint8_t keyBlock)
    {
        return static_cast<esp_efuse_block_t>(EFUSE_BLK_KEY0 + keyBlock);
    }
}

DsReaderKey::~DsReaderKey()
{
    psa_destroy_key(key);
}

std::unique_ptr<DsReaderKey> DsReaderKey::fromRecord(const DsRecord::Record &record)
{
    if (record.keyBlock > 5 ||
        esp_efuse_get_key_purpose(blockFor(record.keyBlock)) != ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_DIGITAL_SIGNATURE ||
        psa_crypto_init() != PSA_SUCCESS)
    {
        return nullptr;
    }
    std::unique_ptr<DsReaderKey> result(new DsReaderKey());
    result->impl.reset(new DsReaderKeyImpl());
    DsReaderKeyImpl &impl = *result->impl;
    memset(&impl.data, 0, sizeof(impl.data));
    impl.data.rsa_length = static_cast<esp_digital_signature_length_t>(record.rsaLength);
    memcpy(impl.data.iv, record.iv, sizeof(impl.data.iv));
    memcpy(impl.data.c, record.c.data(), sizeof(impl.data.c));
    impl.context.esp_ds_data = &impl.data;
    impl.context.efuse_key_id = record.keyBlock;
    impl.context.rsa_length_bits = 3072;

    esp_rsa_ds_opaque_key_t opaque = {};
    opaque.ds_data_ctx = &impl.context;

    psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
    // As esp-tls imports it: PKCS#1 v1.5 as the key's algorithm (X.509 signing, the DS self-test) and RSA-PSS
    // as enrollment algorithm (TLS 1.3 CertificateVerify, the upgrade proof).
    psa_set_key_enrollment_algorithm(&attributes, PSA_ALG_RSA_PSS(PSA_ALG_ANY_HASH));
    psa_set_key_type(&attributes, PSA_KEY_TYPE_RSA_KEY_PAIR);
    psa_set_key_bits(&attributes, 3072);
    psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_SIGN_HASH);
    psa_set_key_algorithm(&attributes, PSA_ALG_RSA_PKCS1V15_SIGN(PSA_ALG_ANY_HASH));
    psa_set_key_lifetime(&attributes, PSA_KEY_LIFETIME_ESP_RSA_DS_VOLATILE);
    const psa_status_t status =
        psa_import_key(&attributes, reinterpret_cast<const uint8_t *>(&opaque), sizeof(opaque), &result->key);
    psa_reset_key_attributes(&attributes);
    if (status != PSA_SUCCESS)
    {
        logger.errorf("DS key import failed (%d)", static_cast<int>(status));
        result->key = MBEDTLS_SVC_KEY_ID_INIT;
        return nullptr;
    }
    result->spki = record.spki;
    return result;
}

bool DsReaderKey::signPss(const std::vector<uint8_t> &message, std::vector<uint8_t> &signature) const
{
    uint8_t digest[32];
    size_t digestLength = 0;
    if (psa_hash_compute(PSA_ALG_SHA_256, message.data(), message.size(), digest, sizeof(digest), &digestLength) !=
        PSA_SUCCESS)
    {
        return false;
    }
    signature.assign(RsaDer::MODULUS_BYTES, 0);
    size_t length = 0;
    if (psa_sign_hash(key, PSA_ALG_RSA_PSS(PSA_ALG_SHA_256), digest, digestLength, signature.data(), signature.size(),
                      &length) != PSA_SUCCESS ||
        length != RsaDer::MODULUS_BYTES)
    {
        signature.clear();
        return false;
    }
    return true;
}

DsReaderKeyStore::Status DsReaderKeyStore::status()
{
    if (esp_efuse_get_key_purpose(EFUSE_BLK_KEY3) != ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_DIGITAL_SIGNATURE)
    {
        return Status::NoKey;
    }
    DsRecord::Record record;
    return DsStorage::read(record) ? Status::Available : Status::ParamsMissing;
}

const char *DsReaderKeyStore::statusName(Status status)
{
    switch (status)
    {
    case Status::Available:
        return "available";
    case Status::ParamsMissing:
        return "params-missing";
    case Status::NoKey:
    default:
        return "no-key";
    }
}

std::unique_ptr<IReaderKey> DsReaderKeyStore::load()
{
    DsRecord::Record record;
    if (esp_efuse_get_key_purpose(EFUSE_BLK_KEY3) != ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_DIGITAL_SIGNATURE)
    {
        return nullptr;
    }
    if (!DsStorage::read(record))
    {
        // A burned KEY3 without its parameters: DS is unusable. Fall back to the software identity; the
        // KEY3 burn is never repeated.
        logger.error("DS params missing: KEY3 is a DS key but the DS record is not valid");
        return nullptr;
    }
    return DsReaderKey::fromRecord(record);
}
#endif
