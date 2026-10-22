#pragma once
#ifdef ESP_PLATFORM
#include "sdkconfig.h"
#include "mbedtls/pk.h"
#include "mbedtls/x509_crt.h"
#include "psa/crypto.h"
#include <array>
#include <ctime>
#include <string>
#include <vector>
#if CONFIG_MBEDTLS_HARDWARE_RSA_DS_PERIPHERAL
#include "psa_crypto_driver_esp_rsa_ds.h"
#endif

namespace ReaderSecurity {
struct TimeTrust {
    uint32_t id = 0;
    std::string publicKey;
};

// Only encrypted parameters and public trust are ever loaded from identity NVS.
// The volatile opaque key references data owned here until close().
class ReaderIdentity {
public:
    ReaderIdentity();
    ~ReaderIdentity();
    ReaderIdentity(const ReaderIdentity &) = delete;
    ReaderIdentity &operator=(const ReaderIdentity &) = delete;
    bool load();
    void close();
    mbedtls_pk_context *signingKey() { return &key; }
    mbedtls_x509_crt *certificateChain() { return &certificate; }
    mbedtls_x509_crt *authorities() { return &ca; }
    const std::array<uint8_t, 16> &installation() const { return installationId; }
    const std::array<uint8_t, 32> &fingerprint() const { return publicFingerprint; }
    const std::vector<TimeTrust> &timeTrust() const { return timeKeys; }
    bool updateTrust(time_t now);
    uint64_t retirementFor(const mbedtls_x509_crt *root, time_t now) const;
    bool ready() const { return loaded; }
private:
    bool loaded = false;
    psa_key_id_t handle = PSA_KEY_ID_NULL;
    mbedtls_pk_context key;
    mbedtls_x509_crt certificate;
    mbedtls_x509_crt ca;
    std::array<uint8_t, 16> installationId{};
    std::array<uint8_t, 32> publicFingerprint{};
    std::vector<TimeTrust> timeKeys;
    std::vector<std::string> serverRoots;
    uint64_t trustStartsAt = 0, trustEndsAt = 0;
#if CONFIG_MBEDTLS_HARDWARE_RSA_DS_PERIPHERAL
    esp_ds_data_t encrypted{};
    esp_ds_data_ctx_t dsContext{};
    esp_rsa_ds_opaque_key_t opaque{};
#endif
};
}
#endif
