#include "ds_creator.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)

#include <cstring>
#include <memory>

#include "../../logger/logger.hpp"
#include "ds_params.hpp"
#include "ds_reader_key.hpp"
#include "ds_storage.hpp"
#include "esp_ds.h"
#include "esp_efuse.h"
#include "esp_efuse_table.h"
#include "esp_heap_caps.h"
#include "mbedtls/platform_util.h"
#include "nvs_erase_gate.hpp"
#include "psa/crypto.h"
#include "rsa_der.hpp"

namespace
{
    Logger logger("DsCreate");

    static_assert(sizeof(DsParams::Operands) == sizeof(esp_ds_p_data_t), "DS operand layouts match");

    // Plaintext material: all of it is wiped in the destructor, whatever path leaves create().
    struct Secrets
    {
        uint8_t hmacKey[32] = {};
        std::unique_ptr<DsParams::Operands, void (*)(DsParams::Operands *)> operands{nullptr, release};

        static void release(DsParams::Operands *p)
        {
            if (p)
            {
                mbedtls_platform_zeroize(p, sizeof(*p));
                heap_caps_free(p);
            }
        }
        void wipe()
        {
            mbedtls_platform_zeroize(hmacKey, sizeof(hmacKey));
            operands.reset();
        }
        ~Secrets() { wipe(); }
    };

    DsCreator::Result fail(const char *code, bool burned = false)
    {
        DsCreator::Result result;
        result.ok = false;
        result.code = code;
        result.burned = burned;
        logger.errorf("DS creation failed: %s%s", code, burned ? " (after the burn: never retry)" : "");
        return result;
    }

    bool generateRsa(RsaDer::PrivateKeyParts &parts)
    {
        psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
        psa_set_key_type(&attributes, PSA_KEY_TYPE_RSA_KEY_PAIR);
        psa_set_key_bits(&attributes, 3072);
        psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_EXPORT);
        psa_set_key_algorithm(&attributes, PSA_ALG_RSA_PSS(PSA_ALG_SHA_256));
        mbedtls_svc_key_id_t id = MBEDTLS_SVC_KEY_ID_INIT;
        if (psa_generate_key(&attributes, &id) != PSA_SUCCESS)
        {
            return false;
        }
        std::vector<uint8_t> der(2400); // a PKCS#1 RSA-3072 private key is about 1.8 KiB
        size_t length = 0;
        const bool exported = psa_export_key(id, der.data(), der.size(), &length) == PSA_SUCCESS;
        psa_destroy_key(id);
        const bool parsed = exported && RsaDer::parsePrivateKey(der.data(), length, parts);
        mbedtls_platform_zeroize(der.data(), der.size());
        return parsed;
    }

    // RSAPublicKey (PKCS#1) of a canonical SPKI, as PSA imports an RSA public key.
    std::vector<uint8_t> pkcs1PublicKey(const std::vector<uint8_t> &spki)
    {
        constexpr size_t HEADER = RsaDer::SPKI_BYTES - 398;
        return std::vector<uint8_t>(spki.begin() + HEADER, spki.end());
    }

    // PSS and PKCS#1 v1.5 signatures of the DS peripheral, verified against the record's public key.
    bool selfTest(const DsRecord::Record &record)
    {
        std::unique_ptr<DsReaderKey> key = DsReaderKey::fromRecord(record);
        if (!key)
        {
            return false;
        }
        const uint8_t message[] = "attractap ds self-test";
        uint8_t digest[32];
        size_t digestLength = 0;
        if (psa_hash_compute(PSA_ALG_SHA_256, message, sizeof(message), digest, sizeof(digest), &digestLength) !=
            PSA_SUCCESS)
        {
            return false;
        }
        const std::vector<uint8_t> publicDer = pkcs1PublicKey(record.spki);
        psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
        psa_set_key_type(&attributes, PSA_KEY_TYPE_RSA_PUBLIC_KEY);
        psa_set_key_bits(&attributes, 3072);
        psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_VERIFY_HASH);
        psa_set_key_algorithm(&attributes, PSA_ALG_RSA_PSS(PSA_ALG_SHA_256));
        psa_set_key_enrollment_algorithm(&attributes, PSA_ALG_RSA_PKCS1V15_SIGN(PSA_ALG_SHA_256));
        mbedtls_svc_key_id_t verifier = MBEDTLS_SVC_KEY_ID_INIT;
        if (psa_import_key(&attributes, publicDer.data(), publicDer.size(), &verifier) != PSA_SUCCESS)
        {
            return false;
        }
        bool ok = true;
        const psa_algorithm_t algorithms[] = {PSA_ALG_RSA_PSS(PSA_ALG_SHA_256),
                                              PSA_ALG_RSA_PKCS1V15_SIGN(PSA_ALG_SHA_256)};
        for (psa_algorithm_t algorithm : algorithms)
        {
            uint8_t signature[RsaDer::MODULUS_BYTES];
            size_t length = 0;
            ok = ok && psa_sign_hash(key->keyId(), algorithm, digest, digestLength, signature, sizeof(signature),
                                     &length) == PSA_SUCCESS &&
                 length == sizeof(signature) &&
                 psa_verify_hash(verifier, algorithm, digest, digestLength, signature, length) == PSA_SUCCESS;
        }
        psa_destroy_key(verifier);
        return ok;
    }
}

namespace DsCreator
{
    std::string refusal()
    {
        if (!NvsEraseGate::initialized())
        {
            return "nvs-not-ready";
        }
        if (!esp_efuse_key_block_unused(EFUSE_BLK_KEY3) ||
            esp_efuse_get_key_purpose(EFUSE_BLK_KEY3) != ESP_EFUSE_KEY_PURPOSE_USER)
        {
            return "key3-in-use";
        }
        if (esp_efuse_get_key_purpose(EFUSE_BLK_KEY2) != ESP_EFUSE_KEY_PURPOSE_XTS_AES_128_KEY)
        {
            return "key2-not-xts";
        }
        if (esp_efuse_get_key_purpose(EFUSE_BLK_KEY4) != ESP_EFUSE_KEY_PURPOSE_HMAC_UP)
        {
            return "key4-not-hmac-up";
        }
        if (!esp_efuse_get_key_dis_read(EFUSE_BLK_KEY2) || !esp_efuse_get_key_dis_read(EFUSE_BLK_KEY4))
        {
            return "keys-not-read-protected";
        }
        if (esp_efuse_read_field_bit(ESP_EFUSE_WR_DIS_RD_DIS))
        {
            return "rd-dis-locked";
        }
        return "";
    }

    Result create()
    {
        const std::string refused = refusal();
        if (!refused.empty())
        {
            return fail(refused.c_str());
        }
        if (psa_crypto_init() != PSA_SUCCESS)
        {
            return fail("crypto-init-failed");
        }

        Secrets secrets;
        if (psa_generate_random(secrets.hmacKey, sizeof(secrets.hmacKey)) != PSA_SUCCESS)
        {
            return fail("random-failed");
        }
        RsaDer::PrivateKeyParts parts;
        logger.info("Generating the RSA-3072 key (this takes a while)");
        if (!generateRsa(parts))
        {
            return fail("keygen-failed");
        }
        DsRecord::Record record;
        record.spki = RsaDer::spkiFromModulus(parts.modulus.data(), parts.modulus.size());

        // The DS peripheral reads its operands from internal, word-aligned memory.
        secrets.operands.reset(static_cast<DsParams::Operands *>(
            heap_caps_calloc(1, sizeof(DsParams::Operands), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)));
        const bool computed = secrets.operands && DsParams::compute(parts.modulus.data(), parts.privateExponent.data(),
                                                                     *secrets.operands);
        mbedtls_platform_zeroize(parts.privateExponent.data(), parts.privateExponent.size());
        if (!computed || record.spki.empty())
        {
            return fail("params-failed");
        }
        uint8_t iv[DsRecord::IV_BYTES];
        if (psa_generate_random(iv, sizeof(iv)) != PSA_SUCCESS)
        {
            return fail("random-failed");
        }
        std::unique_ptr<esp_ds_data_t> data(new esp_ds_data_t());
        if (esp_ds_encrypt_params(data.get(), iv, reinterpret_cast<const esp_ds_p_data_t *>(secrets.operands.get()),
                                  secrets.hmacKey) != ESP_OK)
        {
            return fail("encrypt-failed");
        }
        // The RSA operands are not needed any more.
        secrets.operands.reset();

        record.keyBlock = DsRecord::DS_KEY_BLOCK;
        record.rsaLength = static_cast<uint16_t>(data->rsa_length);
        memcpy(record.iv, data->iv, sizeof(record.iv));
        record.c.assign(data->c, data->c + sizeof(data->c));

        // The record must be stored and verified BEFORE KEY3 is burned: with the record lost after a
        // burn, the key would be gone for good.
        DsRecord::Record readBack;
        const std::vector<uint8_t> expected = DsRecord::serialize(record);
        std::vector<uint8_t> stored;
        if (expected.empty() || !DsStorage::write(record))
        {
            return fail("record-write-failed");
        }
        if (!DsStorage::readRaw(stored) || stored != expected)
        {
            return fail("record-verify-failed");
        }

        // One eFuse batch: key, purpose and read protection are burned together.
        esp_err_t burn = esp_efuse_batch_write_begin();
        if (burn == ESP_OK)
        {
            burn = esp_efuse_write_key(EFUSE_BLK_KEY3, ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_DIGITAL_SIGNATURE,
                                       secrets.hmacKey, sizeof(secrets.hmacKey));
            if (burn == ESP_OK)
            {
                burn = esp_efuse_set_read_protect(EFUSE_BLK_KEY3);
            }
            const esp_err_t commit = esp_efuse_batch_write_commit();
            burn = burn == ESP_OK ? commit : burn;
        }
        // Whatever happened, the HMAC key has no further use in RAM.
        secrets.wipe();
        if (burn != ESP_OK)
        {
            return fail("burn-failed", true);
        }
        if (esp_efuse_get_key_purpose(EFUSE_BLK_KEY3) != ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_DIGITAL_SIGNATURE ||
            !esp_efuse_get_key_dis_read(EFUSE_BLK_KEY3))
        {
            return fail("burn-verify-failed", true);
        }

        if (!selfTest(record))
        {
            return fail("self-test-failed", true);
        }
        mbedtls_platform_zeroize(data.get(), sizeof(*data));

        if (esp_efuse_write_field_bit(ESP_EFUSE_WR_DIS_RD_DIS) != ESP_OK || !esp_efuse_read_field_bit(ESP_EFUSE_WR_DIS_RD_DIS))
        {
            return fail("rd-dis-lock-failed", true);
        }
        logger.info("DS key created");
        Result result;
        result.ok = true;
        result.burned = true;
        return result;
    }
}
#endif
