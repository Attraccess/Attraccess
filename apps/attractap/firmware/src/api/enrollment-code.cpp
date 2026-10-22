#include "enrollment-code.hpp"
#ifdef ESP_PLATFORM
#include <esp_random.h>
#else
#include <cstdio>
#endif

bool EnrollmentCode::secureRandom(uint8_t *bytes, size_t length) {
#ifdef ESP_PLATFORM
    esp_fill_random(bytes, length);
    return true;
#else
    // OS cryptographic source on both supported desktop platforms (macOS/Linux).
    FILE *source = std::fopen("/dev/urandom", "rb");
    if (!source) return false;
    const bool ok = std::fread(bytes, 1, length, source) == length;
    std::fclose(source);
    return ok;
#endif
}
bool EnrollmentCode::refresh(uint32_t now, bool force) {
    std::lock_guard<std::mutex> lock(mutex);
    if (!force && !code.empty() && static_cast<uint32_t>(now - rotatedAt) < 30000u) return false;
    constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    std::string next;
    for (size_t i = 0; i < 6;) {
        uint8_t byte;
        if (!random(&byte, 1)) return false;
        if (byte >= 252) continue; // Rejection sampling avoids modulo bias.
        if (i == 3) next += '-';
        next += alphabet[byte % 36];
        ++i;
    }
    code = next;
    rotatedAt = now;
    return true;
}
std::string EnrollmentCode::value() const { std::lock_guard<std::mutex> lock(mutex); return code; }
void EnrollmentCode::clear() { std::lock_guard<std::mutex> lock(mutex); code.clear(); }
