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

std::string timeToTimeString(time_t value, int utcOffsetMinutes)
{
    value += static_cast<time_t>(utcOffsetMinutes) * 60;
    char result[17];
    const auto *time = std::gmtime(&value);
    return time && std::strftime(result, sizeof(result), "%d.%m. %H:%M", time) ? result : "";
}

namespace
{
bool parseTwoDigits(const std::string &value, size_t startIndex, int &parsed)
{
    if (startIndex + 1 >= value.length()) return false;
    const char first = value[startIndex];
    const char second = value[startIndex + 1];
    if (first < '0' || first > '9' || second < '0' || second > '9') return false;
    parsed = (first - '0') * 10 + second - '0';
    return true;
}

bool parseFourDigits(const std::string &value, size_t startIndex, int &parsed)
{
    int thousands;
    int hundreds;
    if (!parseTwoDigits(value, startIndex, thousands) || !parseTwoDigits(value, startIndex + 2, hundreds)) return false;
    parsed = thousands * 100 + hundreds;
    return true;
}
}

time_t parseIso8601ToTimeT(const std::string &iso8601)
{
    std::string value = iso8601;
    trimString(value);
    if (value.length() < 19) return static_cast<time_t>(-1);

    int year, month, day, hour, minute, second;
    if (!parseFourDigits(value, 0, year) || value[4] != '-' || !parseTwoDigits(value, 5, month) ||
        value[7] != '-' || !parseTwoDigits(value, 8, day) ||
        (value[10] != 'T' && value[10] != 't' && value[10] != ' ') || !parseTwoDigits(value, 11, hour) ||
        value[13] != ':' || !parseTwoDigits(value, 14, minute) || value[16] != ':' || !parseTwoDigits(value, 17, second))
        return static_cast<time_t>(-1);

    size_t index = 19;
    if (index < value.length() && value[index] == '.')
    {
        ++index;
        while (index < value.length() && value[index] >= '0' && value[index] <= '9') ++index;
    }

    int timezoneSign = 0;
    int timezoneHour = 0;
    int timezoneMinute = 0;
    if (index < value.length())
    {
        if (value[index] == 'Z' || value[index] == 'z')
            ++index;
        else if (value[index] == '+' || value[index] == '-')
        {
            timezoneSign = value[index] == '+' ? 1 : -1;
            if (!parseTwoDigits(value, index + 1, timezoneHour) || index + 3 >= value.length() || value[index + 3] != ':' ||
                !parseTwoDigits(value, index + 4, timezoneMinute))
                return static_cast<time_t>(-1);
            index += 6;
        }
        else
            return static_cast<time_t>(-1);
    }
    if (index != value.length()) return static_cast<time_t>(-1);

    std::tm utc = {};
    utc.tm_year = year - 1900;
    utc.tm_mon = month - 1;
    utc.tm_mday = day;
    utc.tm_hour = hour;
    utc.tm_min = minute;
    utc.tm_sec = second;
    const time_t timestamp = ::timegm(&utc);
    if (timestamp == static_cast<time_t>(-1)) return static_cast<time_t>(-1);
    return timestamp - (timezoneHour * 3600L + timezoneMinute * 60L) * timezoneSign;
}

std::string translateReaderError(const std::string &errorKey) { return errorKey; }
