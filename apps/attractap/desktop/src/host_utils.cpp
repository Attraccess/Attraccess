#include "utils.hpp"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <iomanip>
#include <sstream>

bool initSharedI2CBus(int, int) { return false; }
i2c_master_bus_handle_t getSharedI2CBus() { return nullptr; }
i2c_master_dev_handle_t addSharedI2CDevice(uint8_t, uint32_t) { return nullptr; }
void I2CBusLock::init() {}
void I2CBusLock::lock() {}
void I2CBusLock::unlock() {}
void recoverI2CBus(int, int) {}

std::string hexToString(const uint8_t *uid, uint8_t uidLength)
{
    std::ostringstream stream;
    for (uint8_t index = 0; index < uidLength; ++index)
        stream << std::hex << std::setw(2) << std::setfill('0') << static_cast<unsigned>(uid[index]);
    return stream.str();
}

bool stringToHexArray(const std::string &value, uint8_t *array, uint8_t length)
{
    if (value.size() != length * 2) return false;
    for (uint8_t index = 0; index < length; ++index)
    {
        unsigned parsed = 0;
        if (std::sscanf(value.c_str() + index * 2, "%2x", &parsed) != 1) return false;
        array[index] = static_cast<uint8_t>(parsed);
    }
    return true;
}

void trimString(std::string &value)
{
    const auto first = std::find_if_not(value.begin(), value.end(), [](unsigned char c) { return std::isspace(c); });
    const auto last = std::find_if_not(value.rbegin(), value.rend(), [](unsigned char c) { return std::isspace(c); }).base();
    value = first < last ? std::string(first, last) : "";
}

std::string millisToTimeString(double milliseconds)
{
    const auto seconds = static_cast<unsigned>(milliseconds / 1000);
    char value[9];
    std::snprintf(value, sizeof(value), "%02u:%02u:%02u", seconds / 3600, (seconds / 60) % 60, seconds % 60);
    return value;
}

std::string timeToTimeString(time_t value, int)
{
    char result[17];
    const auto *time = std::gmtime(&value);
    return time && std::strftime(result, sizeof(result), "%d.%m. %H:%M", time) ? result : "";
}

time_t parseIso8601ToTimeT(const std::string &) { return static_cast<time_t>(-1); }

std::string translateReaderError(const std::string &errorKey) { return errorKey; }
