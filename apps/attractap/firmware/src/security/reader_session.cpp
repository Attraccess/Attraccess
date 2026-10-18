#include "reader_session.hpp"
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "mbedtls/platform_util.h"
#include "../settings/settings.hpp"
#include <algorithm>
#include <cstring>
#include <tuple>

namespace ReaderSecurity {
namespace {
constexpr size_t QueueLimit = 32768;
struct Lock {
    SemaphoreHandle_t value;
    explicit Lock(SemaphoreHandle_t mutex): value(mutex) { xSemaphoreTake(value, portMAX_DELAY); }
    ~Lock() { xSemaphoreGive(value); }
};
void release(uint8_t *&bytes, size_t size) {
    if (bytes) { mbedtls_platform_zeroize(bytes, size); heap_caps_free(bytes); bytes = nullptr; }
}
}
ReaderSession::ReaderSession(): mutex(xSemaphoreCreateMutex()) {
    mbedtls_ssl_init(&tls);
    mbedtls_ssl_config_init(&config);
}
ReaderSession::~ReaderSession() { close(); if (mutex) vSemaphoreDelete(mutex); }
void ReaderSession::clear() {
    phase = Phase::Closed;
    time.cancel();
    mbedtls_ssl_free(&tls);
    mbedtls_ssl_config_free(&config);
    identity.close();
    release(input, QueueLimit);
    release(body, bodySize);
    inputUsed = inputRead = bodySize = bodyUsed = headerUsed = 0;
    mbedtls_platform_zeroize(header, sizeof(header));
    emit = {};
    deliver = {};
    serverValidUntil = {};
    serverTrustRetiresAt = 0;
}
void ReaderSession::close() { if (!mutex) { clear(); return; } Lock lock(mutex); clear(); }
bool ReaderSession::begin(Emit output, Deliver application) {
    if (!mutex) return false;
    Lock lock(mutex);
    clear();
    if (!identity.load()) return false;
    input = static_cast<uint8_t *>(heap_caps_malloc(QueueLimit, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
    if (!input) { clear(); return false; }
    emit = std::move(output);
    deliver = std::move(application);
    std::array<uint8_t, 81> request{};
    if (!time.begin(identity, request) || !emit(request.data(), request.size())) { clear(); return false; }
    phaseStarted = esp_timer_get_time();
    phase = Phase::Time;
    return true;
}
int ReaderSession::write(void *context, const unsigned char *bytes, size_t length) {
    auto &session = *static_cast<ReaderSession *>(context);
    const size_t count = std::min(length, size_t(4096));
    return session.emit && session.emit(bytes, count) ? int(count) : MBEDTLS_ERR_SSL_INTERNAL_ERROR;
}
int ReaderSession::read(void *context, unsigned char *output, size_t maximum) {
    auto &session = *static_cast<ReaderSession *>(context);
    const size_t count = std::min(maximum, session.inputUsed - session.inputRead);
    if (!count) return MBEDTLS_ERR_SSL_WANT_READ;
    std::memcpy(output, session.input + session.inputRead, count);
    mbedtls_platform_zeroize(session.input + session.inputRead, count);
    session.inputRead += count;
    return int(count);
}
bool ReaderSession::configure() {
    if (!identity.updateTrust(TrustedTime::now())) return false;
    if (mbedtls_ssl_config_defaults(&config, MBEDTLS_SSL_IS_CLIENT, MBEDTLS_SSL_TRANSPORT_STREAM, MBEDTLS_SSL_PRESET_DEFAULT) != 0) return false;
    static const int suites[] = { MBEDTLS_TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, 0 };
    static const uint16_t signatures[] = { 0x0401, 0x0501, 0x0601, 0 };
    mbedtls_ssl_conf_ciphersuites(&config, suites);
    mbedtls_ssl_conf_sig_algs(&config, signatures);
    mbedtls_ssl_conf_min_tls_version(&config, MBEDTLS_SSL_VERSION_TLS1_2);
    mbedtls_ssl_conf_max_tls_version(&config, MBEDTLS_SSL_VERSION_TLS1_2);
    mbedtls_ssl_conf_authmode(&config, MBEDTLS_SSL_VERIFY_REQUIRED);
    mbedtls_ssl_conf_verify(&config, verify, this);
    certificateProfile = mbedtls_x509_crt_profile_default;
    certificateProfile.allowed_mds = MBEDTLS_X509_ID_FLAG(MBEDTLS_MD_SHA256) | MBEDTLS_X509_ID_FLAG(MBEDTLS_MD_SHA384) | MBEDTLS_X509_ID_FLAG(MBEDTLS_MD_SHA512);
    certificateProfile.rsa_min_bitlen = 3072;
    mbedtls_ssl_conf_cert_profile(&config, &certificateProfile);
    mbedtls_ssl_conf_ca_chain(&config, identity.authorities(), nullptr);
#if defined(MBEDTLS_SSL_RENEGOTIATION)
    mbedtls_ssl_conf_renegotiation(&config, MBEDTLS_SSL_RENEGOTIATION_DISABLED);
#endif
#if defined(MBEDTLS_SSL_SESSION_TICKETS)
    mbedtls_ssl_conf_session_tickets(&config, MBEDTLS_SSL_SESSION_TICKETS_DISABLED);
#endif
    // No saved sessions or early-data API is used. Every begin loads a fresh engine.
    if (mbedtls_ssl_conf_own_cert(&config, identity.certificateChain(), identity.signingKey()) != 0 || mbedtls_ssl_setup(&tls, &config) != 0) return false;
    const auto hostname = Settings::getAttraccessApiConfig().hostname;
    if (hostname.empty() || mbedtls_ssl_set_hostname(&tls, hostname.c_str()) != 0) return false;
    mbedtls_ssl_set_bio(&tls, this, write, read, nullptr);
    return true;
}

int ReaderSession::verify(void *context, mbedtls_x509_crt *certificate, int depth, uint32_t *flags) {
    auto &session = *static_cast<ReaderSession *>(context);
    (void)depth;
    // Keep every library verification flag. This callback only retains public
    // expiry metadata so a long-lived connection cannot outlive its trust.
    if (*flags != 0) return 0;
    const auto tuple = [](const mbedtls_x509_time &value) { return std::make_tuple(value.year, value.mon, value.day, value.hour, value.min, value.sec); };
    if (session.serverValidUntil.year == 0 || tuple(certificate->valid_to) < tuple(session.serverValidUntil)) session.serverValidUntil = certificate->valid_to;
    const auto retirement = session.identity.retirementFor(certificate, TrustedTime::now());
    if (retirement) session.serverTrustRetiresAt = retirement;
    return 0;
}

bool ReaderSession::parse(const uint8_t *bytes, size_t length) {
    while (length) {
        if (headerUsed < sizeof(header)) {
            const auto count = std::min(length, sizeof(header) - headerUsed);
            std::memcpy(header + headerUsed, bytes, count);
            headerUsed += count; bytes += count; length -= count;
            if (headerUsed < sizeof(header)) continue;
            bodySize = (size_t(header[4]) << 24) | (size_t(header[5]) << 16) | (size_t(header[6]) << 8) | header[7];
            const size_t limit = header[1] == 1 ? 8192 : header[1] == 2 ? 4096 : 0;
            if (header[0] != 1 || header[2] || header[3] || !limit || bodySize > limit || !bodySize) return false;
            body = static_cast<uint8_t *>(heap_caps_malloc(bodySize, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
            if (!body) return false;
        }
        const auto count = std::min(length, bodySize - bodyUsed);
        std::memcpy(body + bodyUsed, bytes, count);
        bodyUsed += count; bytes += count; length -= count;
        if (bodyUsed == bodySize) {
            deliver(header[1], body, bodySize);
            release(body, bodySize);
            bodyUsed = bodySize = headerUsed = 0;
            mbedtls_platform_zeroize(header, sizeof(header));
        }
    }
    return true;
}
bool ReaderSession::progress() {
    if (phase == Phase::Handshake) {
        const int result = mbedtls_ssl_handshake(&tls);
        if (result == MBEDTLS_ERR_SSL_WANT_READ || result == MBEDTLS_ERR_SSL_WANT_WRITE) return true;
        if (result != 0 || serverValidUntil.year == 0 || mbedtls_ssl_get_verify_result(&tls) != 0 || mbedtls_ssl_get_version_number(&tls) != MBEDTLS_SSL_VERSION_TLS1_2) return false;
        phase = Phase::Ready;
        lastInput = esp_timer_get_time();
    }
    if (phase == Phase::Ready) {
        uint8_t plaintext[4096];
        while (true) {
            int result = mbedtls_ssl_read(&tls, plaintext, sizeof(plaintext));
            if (result == MBEDTLS_ERR_SSL_WANT_READ || result == MBEDTLS_ERR_SSL_WANT_WRITE) break;
            if (result <= 0) { mbedtls_platform_zeroize(plaintext, sizeof(plaintext)); return false; }
            lastInput = esp_timer_get_time();
            const bool valid = parse(plaintext, result);
            mbedtls_platform_zeroize(plaintext, sizeof(plaintext));
            if (!valid) return false;
        }
        mbedtls_platform_zeroize(plaintext, sizeof(plaintext));
    }
    return true;
}
bool ReaderSession::receive(const uint8_t *bytes, size_t length) {
    if (!mutex) return false;
    Lock lock(mutex);
    if (phase == Phase::Closed || !bytes || !length || length > 4096 || inputUsed - inputRead + length > QueueLimit) { clear(); return false; }
    if (inputRead) {
        std::memmove(input, input + inputRead, inputUsed - inputRead);
        inputUsed -= inputRead; inputRead = 0;
    }
    std::memcpy(input + inputUsed, bytes, length); inputUsed += length;
    if (phase == Phase::Time) {
        if (inputUsed > 493) { clear(); return false; }
        if (inputUsed < 493) return true;
        if (!time.accept(identity, input, inputUsed) || !configure()) { clear(); return false; }
        mbedtls_platform_zeroize(input, inputUsed); inputUsed = 0;
        phase = Phase::Handshake;
        phaseStarted = esp_timer_get_time();
    }
    if (!progress()) { clear(); return false; }
    return true;
}
bool ReaderSession::send(const char *json, size_t length) {
    if (!mutex) return false;
    Lock lock(mutex);
    if (phase != Phase::Ready || !json || !length || length > 8192) { clear(); return false; }
    const size_t total = length + 8;
    auto *frame = static_cast<uint8_t *>(heap_caps_malloc(total, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
    if (!frame) { clear(); return false; }
    std::memset(frame, 0, 8); frame[0] = 1; frame[1] = 1;
    for (unsigned i = 0; i < 4; i++) frame[7-i] = uint8_t(length >> (8*i));
    std::memcpy(frame + 8, json, length);
    size_t offset = 0;
    while (offset < total) {
        const int written = mbedtls_ssl_write(&tls, frame + offset, std::min(total - offset, size_t(4096)));
        if (written <= 0) { release(frame, total); clear(); return false; }
        offset += written;
    }
    release(frame, total);
    return true;
}
void ReaderSession::tick() {
    if (!mutex) return;
    Lock lock(mutex);
    if ((phase == Phase::Time && time.timedOut()) ||
        (phase == Phase::Handshake && esp_timer_get_time() - phaseStarted >= 30000000) ||
        (phase == Phase::Ready && (esp_timer_get_time() - lastInput >= 60000000 ||
          mbedtls_x509_time_is_past(&serverValidUntil) ||
          mbedtls_x509_time_is_past(&identity.certificateChain()->valid_to) ||
          (serverTrustRetiresAt && uint64_t(TrustedTime::now()) >= serverTrustRetiresAt)))) clear();
}
}
#endif
