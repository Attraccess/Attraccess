#include "trusted_time.hpp"
#ifdef ESP_PLATFORM
#include "esp_random.h"
#include "esp_timer.h"
#include "mbedtls/platform_time.h"
#include "mbedtls/platform_util.h"
#include <atomic>
#include <cstring>

namespace ReaderSecurity {
namespace {
std::atomic<int64_t> verifiedOffset{0};
uint32_t read32(const uint8_t *bytes) {
    return (uint32_t(bytes[0]) << 24) | (uint32_t(bytes[1]) << 16) | (uint32_t(bytes[2]) << 8) | bytes[3];
}
}

time_t TrustedTime::now(time_t *result) {
    const auto base = verifiedOffset.load(std::memory_order_acquire);
    time_t value = base ? (base + esp_timer_get_time()) / 1000000 : 0;
    if (result) *result = value;
    return value;
}
bool TrustedTime::begin(const ReaderIdentity &identity, std::array<uint8_t, 81> &request) {
    cancel();
    if (!identity.ready()) return false;
#if defined(MBEDTLS_PLATFORM_TIME_ALT)
    if (mbedtls_platform_set_time(now) != 0) return false;
#else
    return false; // Never verify credentials using an unsigned display/SNTP clock.
#endif
    esp_fill_random(challenge.data(), challenge.size());
    request[0] = 1;
    std::memcpy(request.data() + 1, identity.installation().data(), 16);
    std::memcpy(request.data() + 17, identity.fingerprint().data(), 32);
    std::memcpy(request.data() + 49, challenge.data(), 32);
    started = esp_timer_get_time();
    waiting = true;
    return true;
}
bool TrustedTime::timedOut() const { return waiting && esp_timer_get_time() - started >= 5000000; }
void TrustedTime::cancel() {
    waiting = false;
    started = 0;
    mbedtls_platform_zeroize(challenge.data(), challenge.size());
}
bool TrustedTime::accept(const ReaderIdentity &identity, const uint8_t *reply, size_t length) {
    const bool eligible = waiting && !timedOut();
    waiting = false; // Consume even failed/reused replies.
    static const uint8_t domain[16] = {'A','T','T','R','-','T','I','M','E','-','V','1',0,0,0,0};
    bool valid = eligible && length == 493 && std::memcmp(reply, domain, 16) == 0 && reply[16] == 1 &&
                 std::memcmp(reply + 21, identity.installation().data(), 16) == 0 &&
                 std::memcmp(reply + 37, identity.fingerprint().data(), 32) == 0 &&
                 std::memcmp(reply + 69, challenge.data(), 32) == 0;
    uint64_t seconds = 0;
    if (valid) for (size_t i = 101; i < 109; i++) seconds = (seconds << 8) | reply[i];
    valid = valid && seconds >= 1577836800ULL && seconds <= 253402300799ULL;
    mbedtls_pk_context publicKey;
    mbedtls_pk_init(&publicKey);
    psa_key_id_t key = PSA_KEY_ID_NULL;
    bool verified = false;
    for (const auto &trust : identity.timeTrust()) {
        if (!valid || trust.id != read32(reply + 17)) continue;
        psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
        uint8_t digest[32];
        size_t digestSize = 0;
        verified = mbedtls_pk_parse_public_key(&publicKey, reinterpret_cast<const uint8_t *>(trust.publicKey.c_str()), trust.publicKey.size() + 1) == 0 &&
                   mbedtls_pk_get_key_type(&publicKey) == PSA_KEY_TYPE_RSA_PUBLIC_KEY && mbedtls_pk_get_bitlen(&publicKey) == 3072 &&
                   mbedtls_pk_get_psa_attributes(&publicKey, PSA_KEY_USAGE_VERIFY_HASH, &attributes) == 0;
        psa_set_key_algorithm(&attributes, PSA_ALG_RSA_PSS(PSA_ALG_SHA_256));
        verified = verified && mbedtls_pk_import_into_psa(&publicKey, &attributes, &key) == 0 &&
                   psa_hash_compute(PSA_ALG_SHA_256, reply, 109, digest, sizeof(digest), &digestSize) == PSA_SUCCESS && digestSize == 32 &&
                   psa_verify_hash(key, PSA_ALG_RSA_PSS(PSA_ALG_SHA_256), digest, sizeof(digest), reply + 109, 384) == PSA_SUCCESS;
        psa_reset_key_attributes(&attributes);
        mbedtls_platform_zeroize(digest, sizeof(digest));
        break;
    }
    if (key != PSA_KEY_ID_NULL) psa_destroy_key(key);
    mbedtls_pk_free(&publicKey);
    if (verified) {
        verifiedOffset.store(int64_t(seconds) * 1000000 - esp_timer_get_time(), std::memory_order_release);
    }
    cancel();
    return verified;
}
}
#endif
