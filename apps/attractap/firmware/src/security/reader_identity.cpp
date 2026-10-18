#include "reader_identity.hpp"
#ifdef ESP_PLATFORM
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_idf_version.h"
#include "mbedtls/platform_util.h"
#include <cstring>

namespace ReaderSecurity {
ReaderIdentity::ReaderIdentity() {
    mbedtls_pk_init(&key);
    mbedtls_x509_crt_init(&certificate);
    mbedtls_x509_crt_init(&ca);
}
ReaderIdentity::~ReaderIdentity() { close(); }
void ReaderIdentity::close() {
    loaded = false;
    mbedtls_pk_free(&key);
    if (handle != PSA_KEY_ID_NULL) psa_destroy_key(handle);
    handle = PSA_KEY_ID_NULL;
    mbedtls_x509_crt_free(&certificate);
    mbedtls_x509_crt_free(&ca);
    timeKeys.clear();
    serverRoots.clear();
    trustStartsAt = trustEndsAt = 0;
#if CONFIG_MBEDTLS_HARDWARE_RSA_DS_PERIPHERAL
    mbedtls_platform_zeroize(&encrypted, sizeof(encrypted));
    dsContext = {};
    opaque = {};
#endif
}

bool ReaderIdentity::load() {
    close();
#if CONFIG_MBEDTLS_HARDWARE_RSA_DS_PERIPHERAL
    static_assert(ESP_IDF_VERSION == ESP_IDF_VERSION_VAL(6, 0, 2), "Review DS representation on IDF upgrade");
    static_assert(sizeof(esp_ds_data_t) == 1604, "DS preparation layout mismatch");
    if (psa_crypto_init() != PSA_SUCCESS) return false;
    // Never initialize an encrypted identity partition with generated/replacement
    // keys. Missing keys require protected local recovery, not a trust reset.
    nvs_sec_cfg_t security{};
    const auto *keys = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_NVS_KEYS, "nvs_keys");
    if (!keys || nvs_flash_read_security_cfg(keys, &security) != ESP_OK) return false;
    auto status = nvs_flash_secure_init_partition("identity", &security);
    mbedtls_platform_zeroize(&security, sizeof(security));
    if (status != ESP_OK) return false;
    nvs_handle_t store;
    if (nvs_open_from_partition("identity", "reader", NVS_READONLY, &store) != ESP_OK) return false;
    auto blob = [&](const char *name, void *output, size_t expected) {
        size_t size = expected;
        return nvs_get_blob(store, name, output, &size) == ESP_OK && size == expected;
    };
    auto text = [&](const char *name, std::string &output) {
        size_t size = 0;
        if (nvs_get_str(store, name, nullptr, &size) != ESP_OK || size < 2 || size > 12288) return false;
        output.resize(size);
        if (nvs_get_str(store, name, output.data(), &size) != ESP_OK) return false;
        output.resize(size - 1);
        return true;
    };
    bool valid = blob("ds-data", &encrypted, sizeof(encrypted)) && encrypted.rsa_length == ESP_DS_RSA_3072 &&
                 blob("installation", installationId.data(), installationId.size());
    uint8_t hmacId = 255, caCount = 0, timeCount = 0;
    valid = valid && nvs_get_u8(store, "hmac-id", &hmacId) == ESP_OK && hmacId < 6 &&
            nvs_get_u8(store, "ca-count", &caCount) == ESP_OK && caCount >= 1 && caCount <= 2 &&
            nvs_get_u8(store, "time-count", &timeCount) == ESP_OK && timeCount >= 1 && timeCount <= 2;
    std::string pem;
    valid = valid && text("certificate", pem) &&
            mbedtls_x509_crt_parse(&certificate, reinterpret_cast<const uint8_t *>(pem.c_str()), pem.size() + 1) == 0 &&
            mbedtls_pk_get_bitlen(&certificate.pk) == 3072 &&
            mbedtls_pk_get_key_type(&certificate.pk) == PSA_KEY_TYPE_RSA_PUBLIC_KEY && !certificate.MBEDTLS_PRIVATE(ca_istrue);
    for (unsigned i = 0; valid && i < caCount; i++) {
        valid = text(("server-ca" + std::to_string(i)).c_str(), pem);
        if (valid) serverRoots.push_back(pem);
    }
    if (valid && caCount == 2) valid = nvs_get_u64(store, "ca-start", &trustStartsAt) == ESP_OK &&
        nvs_get_u64(store, "ca-until", &trustEndsAt) == ESP_OK && trustStartsAt > 0 &&
        trustEndsAt > trustStartsAt && trustEndsAt - trustStartsAt <= 86400;
    for (unsigned i = 0; valid && i < timeCount; i++) {
        TimeTrust trust;
        valid = nvs_get_u32(store, ("time-id" + std::to_string(i)).c_str(), &trust.id) == ESP_OK && trust.id != 0 &&
                text(("time-key" + std::to_string(i)).c_str(), trust.publicKey) &&
                (timeKeys.empty() || trust.id != timeKeys.front().id);
        if (valid) timeKeys.push_back(std::move(trust));
    }
    nvs_close(store);
    if (!valid) { close(); return false; }
    // Hash SubjectPublicKeyInfo DER, matching Node's publicKeyFingerprint().
    uint8_t spki[1024];
    int encoded = mbedtls_pk_write_pubkey_der(&certificate.pk, spki, sizeof(spki));
    size_t hashSize = 0;
    valid = encoded > 0 && psa_hash_compute(PSA_ALG_SHA_256, spki + sizeof(spki) - encoded, encoded,
                                          publicFingerprint.data(), publicFingerprint.size(), &hashSize) == PSA_SUCCESS && hashSize == 32;
    dsContext.esp_ds_data = &encrypted;
    dsContext.efuse_key_id = hmacId;
    dsContext.rsa_length_bits = 3072;
    opaque.ds_data_ctx = &dsContext;
    psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
    psa_set_key_type(&attributes, PSA_KEY_TYPE_RSA_KEY_PAIR);
    psa_set_key_bits(&attributes, 3072);
    psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_SIGN_HASH);
    psa_set_key_algorithm(&attributes, PSA_ALG_RSA_PKCS1V15_SIGN(PSA_ALG_ANY_HASH));
    psa_set_key_lifetime(&attributes, PSA_KEY_LIFETIME_ESP_RSA_DS_VOLATILE);
    valid = valid && psa_import_key(&attributes, reinterpret_cast<uint8_t *>(&opaque), sizeof(opaque), &handle) == PSA_SUCCESS;
    psa_reset_key_attributes(&attributes);
    // IDF's DS driver cannot export the public modulus from encrypted material.
    // Seed only the public bytes before wrapping, using the IDF 6.0.2 layout.
    // The private identity remains an opaque PSA handle; no private bytes exist.
    valid = valid && mbedtls_pk_write_pubkey_psa(&certificate.pk, key.MBEDTLS_PRIVATE(pub_raw),
                    sizeof(key.MBEDTLS_PRIVATE(pub_raw)), &key.MBEDTLS_PRIVATE(pub_raw_len)) == 0 &&
                    mbedtls_pk_wrap_psa(&key, handle) == 0;
    if (!valid) { close(); return false; }
    loaded = true;
    return true;
#else
    return false;
#endif
}

bool ReaderIdentity::updateTrust(time_t now) {
    mbedtls_x509_crt_free(&ca);
    mbedtls_x509_crt_init(&ca);
    if (serverRoots.empty() || serverRoots.size() > 2 || (serverRoots.size() == 2 && uint64_t(now) < trustStartsAt)) return false;
    for (size_t index = 0; index < serverRoots.size(); index++) {
        if (serverRoots.size() == 2 && index == 0 && uint64_t(now) >= trustEndsAt) continue;
        const auto &pem = serverRoots[index];
        if (mbedtls_x509_crt_parse(&ca, reinterpret_cast<const uint8_t *>(pem.c_str()), pem.size() + 1) != 0) return false;
    }
    return true;
}
uint64_t ReaderIdentity::retirementFor(const mbedtls_x509_crt *root, time_t now) const {
    if (serverRoots.size() != 2 || uint64_t(now) >= trustEndsAt || !root ||
        root->raw.len != ca.raw.len || std::memcmp(root->raw.p, ca.raw.p, root->raw.len) != 0) return 0;
    return trustEndsAt;
}
}
#endif
