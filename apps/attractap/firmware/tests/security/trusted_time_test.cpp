// Host-only software identity. No DS or hardware qualification is claimed.
#include "security/reader_identity.hpp"
#include "settings/settings.hpp"
#include <chrono>
#include <cstdlib>
#include <fstream>
#include <stdexcept>
#include "psa/crypto.h"

static int64_t clockAdvance = 0;
void advance_reader_test_clock(int64_t microseconds) { clockAdvance += microseconds; }
int64_t esp_timer_get_time() {
    return std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count() + clockAdvance;
}
void esp_fill_random(void *output, size_t size) {
    if (psa_generate_random(static_cast<uint8_t *>(output), size) != PSA_SUCCESS)
        throw std::runtime_error("Host entropy unavailable");
}
AttraccessApiConfig Settings::getAttraccessApiConfig() { return {"localhost", 0, false}; }
namespace ReaderSecurity {
ReaderIdentity::ReaderIdentity() {
    mbedtls_pk_init(&key); mbedtls_x509_crt_init(&certificate); mbedtls_x509_crt_init(&ca);
}
ReaderIdentity::~ReaderIdentity() { close(); }
void ReaderIdentity::close() {
    loaded = false; mbedtls_pk_free(&key); mbedtls_x509_crt_free(&certificate); mbedtls_x509_crt_free(&ca);
    timeKeys.clear();
}
bool ReaderIdentity::load() {
    close();
    const auto *directory = std::getenv("READER_TEST_CERT_DIRECTORY");
    if (!directory || psa_crypto_init() != PSA_SUCCESS) return false;
    const std::string base = std::string(directory) + "/";
    if (mbedtls_pk_parse_keyfile(&key, (base + "reader.key").c_str(), nullptr) != 0 ||
        mbedtls_x509_crt_parse_file(&certificate, (base + "enroll.pem").c_str()) != 0 ||
        mbedtls_x509_crt_parse_file(&ca, (base + "ca.pem").c_str()) != 0) return false;
    installationId = {0,0,0,0,0,0,0x40,0,0x80,0,0,0,0,0,0,1};
    uint8_t spki[1024]; size_t count = 0;
    int bytes = mbedtls_pk_write_pubkey_der(&certificate.pk, spki, sizeof(spki));
    if (bytes <= 0 || psa_hash_compute(PSA_ALG_SHA_256, spki + sizeof(spki) - bytes, bytes,
        publicFingerprint.data(), publicFingerprint.size(), &count) != PSA_SUCCESS || count != 32) return false;
    std::ifstream input(base + "time-public.pem");
    const std::string pem((std::istreambuf_iterator<char>(input)), {});
    if (pem.empty()) return false;
    timeKeys.push_back({1, pem}); loaded = true; return true;
}
bool ReaderIdentity::updateTrust(time_t) { return loaded; }
uint64_t ReaderIdentity::retirementFor(const mbedtls_x509_crt *, time_t) const { return 0; }
}
