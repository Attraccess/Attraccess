#pragma once
#include <cstdint>
#include <cstddef>
#include <functional>
#include <mutex>
#include <string>

class EnrollmentCode {
public:
    using Random = std::function<bool(uint8_t *, size_t)>;
    explicit EnrollmentCode(Random random = secureRandom) : random(random) {}
    bool refresh(uint32_t now, bool force = false);
    std::string value() const;
    void clear();
    static bool secureRandom(uint8_t *bytes, size_t length);
private:
    Random random;
    mutable std::mutex mutex;
    std::string code;
    uint32_t rotatedAt = 0;
};
