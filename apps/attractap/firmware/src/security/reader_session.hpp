#pragma once
#ifdef ESP_PLATFORM
#include "reader_identity.hpp"
#include "trusted_time.hpp"
#include "mbedtls/ssl.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include <atomic>
#include <functional>

namespace ReaderSecurity {
// One serialized TLS engine per reader. Raw bytes can only leave through emit.
class ReaderSession {
public:
    using Emit = std::function<bool(const uint8_t *, size_t)>;
    using Deliver = std::function<void(uint8_t, const uint8_t *, size_t)>;
    ReaderSession();
    ~ReaderSession();
    bool begin(Emit emit, Deliver deliver);
    bool receive(const uint8_t *bytes, size_t length);
    bool send(const char *json, size_t length);
    void tick();
    void close();
    bool ready() const { return phase.load() == Phase::Ready; }
    bool failed() const { return phase.load() == Phase::Closed; }
private:
    enum class Phase { Closed, Time, Handshake, Ready };
    std::atomic<Phase> phase{Phase::Closed};
    SemaphoreHandle_t mutex;
    ReaderIdentity identity;
    TrustedTime time;
    mbedtls_ssl_context tls;
    mbedtls_ssl_config config;
    mbedtls_x509_crt_profile certificateProfile;
    Emit emit;
    Deliver deliver;
    uint8_t *input = nullptr;
    size_t inputUsed = 0, inputRead = 0;
    uint8_t *body = nullptr;
    size_t bodyUsed = 0, bodySize = 0, headerUsed = 0;
    uint8_t header[8]{};
    int64_t phaseStarted = 0, lastInput = 0;
    mbedtls_x509_time serverValidUntil{};
    uint64_t serverTrustRetiresAt = 0;
    bool configure();
    bool progress();
    bool parse(const uint8_t *bytes, size_t length);
    void clear();
    static int read(void *context, unsigned char *output, size_t maximum);
    static int write(void *context, const unsigned char *bytes, size_t length);
    static int verify(void *context, mbedtls_x509_crt *certificate, int depth, uint32_t *flags);
};
}
#endif
