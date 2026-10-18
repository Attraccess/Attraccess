#pragma once
#ifdef ESP_PLATFORM
#include "reader_identity.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <ctime>

namespace ReaderSecurity {
class TrustedTime {
public:
    bool begin(const ReaderIdentity &identity, std::array<uint8_t, 81> &request);
    bool accept(const ReaderIdentity &identity, const uint8_t *reply, size_t length);
    void cancel();
    bool pending() const { return waiting; }
    bool timedOut() const;
    static time_t now(time_t *result = nullptr);
private:
    bool waiting = false;
    int64_t started = 0;
    std::array<uint8_t, 32> challenge{};
};
}
#endif
