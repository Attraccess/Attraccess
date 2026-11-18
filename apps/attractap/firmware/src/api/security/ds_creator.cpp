#include "ds_creator.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)

#include <cstring>
#include <memory>
#include <new>

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
#include "efuse_report.hpp"
#include "psa/crypto.h"
#include "rsa_der.hpp"

namespace
{
    Logger logger("DsCreate");

    static_assert(sizeof(DsParams::Operands) == sizeof(esp_ds_p_data_t), "DS operand layouts match");

    // Creation runs on the main loop and must not run out of internal RAM half way: a failure after the
    // burn cannot be retried. Estimate of what create() holds at its peak (NOT measured on the device):
    //   key generation: mbedTLS RSA-3072 context and prime search temporaries (~10 KiB, internal RAM on
    //     secure builds: CONFIG_MBEDTLS_INTERNAL_MEM_ALLOC), the PSA key slot (~1.8 KiB) and the exported
    //     PKCS#1 DER (2.4 KiB);
    //   parameters and record: DS operands (1.5 KiB), esp_ds_data_t (1.6 KiB), the record and its serialized,
    //     written and read-back copies (4 x ~2.1 KiB);
    //   self-test: the opaque DS key, a PSA RSA public key and its RSA-3072 public operation (~5 KiB).
    // That is ~22 KiB. The floor adds ~18 KiB for the tasks that keep running meanwhile (Wi-Fi, TLS, LVGL);
    // the secure-lab Touch V2 idles at ~64 KB free with a ~30 KB largest block (apps/attractap-lab
    // hil/heap_floors.py). The largest single allocation of create() is ~2.4 KiB; mbedTLS bignum work
    // wants a few contiguous KiB more, so 12 KiB leaves room for fragmentation. Measure with
    // ds.create on the lab reader and tighten these when there are numbers.
    constexpr size_t MIN_FREE_INTERNAL_BYTES = 40 * 1024;
    constexpr size_t MIN_LARGEST_INTERNAL_BLOCK_BYTES = 12 * 1024;

    // Plaintext key material lives in internal RAM (never PSRAM, also with CONFIG_SPIRAM_USE_MALLOC) and is
    // wiped before it is freed, whatever path drops it.
    template <typename T>
    struct InternalDeleter
    {
        void operator()(T *p) const
        {
            if (p)
            {
                p->~T();
                mbedtls_platform_zeroize(p, sizeof(T));
                heap_caps_free(p);
            }
        }
    };
    template <typename T>
    using InternalPtr = std::unique_ptr<T, InternalDeleter<T>>;

    template <typename T>
    InternalPtr<T> makeInternal()
    {
        // heap_caps memory is at least word aligned, as the DS peripheral needs for its operands.
        void *memory = heap_caps_calloc(1, sizeof(T), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
        return InternalPtr<T>(memory ? new (memory) T() : nullptr);
    }

    // A PKCS#1 RSA-3072 private key as psa_export_key writes it (about 1.8 KiB).
    struct PrivateKeyDer
    {
        uint8_t bytes[2400];
    };

    // Plaintext material: all of it is wiped in the destructor, whatever path leaves create().
    struct Secrets
    {
        uint8_t hmacKey[32] = {};
        InternalPtr<RsaDer::PrivateKeyParts> parts;
        InternalPtr<DsParams::Operands> operands;

        void wipe()
        {
            mbedtls_platform_zeroize(hmacKey, sizeof(hmacKey));
            parts.reset();
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
        InternalPtr<PrivateKeyDer> der = makeInternal<PrivateKeyDer>();
        mbedtls_svc_key_id_t id = MBEDTLS_SVC_KEY_ID_INIT;
        if (!der || psa_generate_key(&attributes, &id) != PSA_SUCCESS)
        {
            return false;
        }
        size_t length = 0;
        const bool exported = psa_export_key(id, der->bytes, sizeof(der->bytes), &length) == PSA_SUCCESS;
        psa_destroy_key(id);
        // `der` is wiped when it goes out of scope.
        return exported && RsaDer::parsePrivateKey(der->bytes, length, parts);
    }

    // Locks RD_DIS (write-protects it), so no further key block can become read-protected.
    bool lockRdDis()
    {
        return esp_efuse_write_field_bit(ESP_EFUSE_WR_DIS_RD_DIS) == ESP_OK &&
               esp_efuse_read_field_bit(ESP_EFUSE_WR_DIS_RD_DIS);
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
        if (heap_caps_get_free_size(MALLOC_CAP_INTERNAL) < MIN_FREE_INTERNAL_BYTES ||
            heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) < MIN_LARGEST_INTERNAL_BLOCK_BYTES)
        {
            return "low-memory";
        }
        return "";
    }

    std::string spkiFingerprint(const std::vector<uint8_t> &spki)
    {
        uint8_t digest[32];
        size_t length = 0;
        if (spki.empty() || psa_crypto_init() != PSA_SUCCESS ||
            psa_hash_compute(PSA_ALG_SHA_256, spki.data(), spki.size(), digest, sizeof(digest), &length) !=
                PSA_SUCCESS ||
            length != sizeof(digest))
        {
            return "";
        }
        return EfuseReport::hex(digest, sizeof(digest));
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
        secrets.parts = makeInternal<RsaDer::PrivateKeyParts>();
        logger.info("Generating the RSA-3072 key (this takes a while)");
        if (!secrets.parts || !generateRsa(*secrets.parts))
        {
            return fail("keygen-failed");
        }
        DsRecord::Record record;
        record.spki = RsaDer::spkiFromModulus(secrets.parts->modulus.data(), secrets.parts->modulus.size());

        // The DS peripheral reads its operands from internal, word-aligned memory.
        secrets.operands = makeInternal<DsParams::Operands>();
        const bool computed = secrets.operands && DsParams::compute(secrets.parts->modulus.data(),
                                                                     secrets.parts->privateExponent.data(),
                                                                     *secrets.operands);
        // The private exponent now lives in the operands only.
        secrets.parts.reset();
        if (!computed || record.spki.empty())
        {
            return fail("params-failed");
        }
        // Of the key generated in RAM, before anything is stored: what the lab compares with the server's view.
        const std::string fingerprint = spkiFingerprint(record.spki);
        if (fingerprint.empty())
        {
            return fail("fingerprint-failed");
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

        // KEY3 is burned: from here on every step runs once, and the RD_DIS lock is attempted even when the
        // self-test fails, so the reader always ends in the janitor's post-burn state (KEY3 + RD_DIS locked).
        // The first failure is reported: self-test-failed wins over rd-dis-lock-failed, whose own outcome
        // is logged.
        const bool selfTestPassed = selfTest(record);
        mbedtls_platform_zeroize(data.get(), sizeof(*data));
        const bool locked = lockRdDis();
        if (!selfTestPassed)
        {
            logger.errorf("RD_DIS lock after the failed self-test: %s", locked ? "done" : "failed");
            return fail("self-test-failed", true);
        }
        if (!locked)
        {
            return fail("rd-dis-lock-failed", true);
        }
        logger.info("DS key created");
        Result result;
        result.ok = true;
        result.burned = true;
        result.spkiSha256 = fingerprint;
        return result;
    }
}
#endif
