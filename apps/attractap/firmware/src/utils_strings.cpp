#include "utils.hpp"
#include <string>
#include <cstdio>
#include <cstring>
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "platform.hpp"

static inline int8_t hexCharToNibble(char c)
{
    if (c >= '0' && c <= '9')
    {
        return static_cast<int8_t>(c - '0');
    }
    if (c >= 'a' && c <= 'f')
    {
        return static_cast<int8_t>(10 + (c - 'a'));
    }
    if (c >= 'A' && c <= 'F')
    {
        return static_cast<int8_t>(10 + (c - 'A'));
    }
    return -1;
}

void trimString(std::string &s)
{
    const char *ws = " \t\r\n\f\v";
    size_t start = s.find_first_not_of(ws);
    if (start == std::string::npos)
    {
        s.clear();
        return;
    }
    size_t end = s.find_last_not_of(ws);
    s = s.substr(start, end - start + 1);
}

std::string hexToString(const uint8_t *uid, uint8_t uidLength)
{
    std::string hexString;
    hexString.reserve(uidLength * 2);
    char buf[3];
    for (uint8_t i = 0; i < uidLength; i++)
    {
        // Always render two hex digits per byte (zero-padded, lowercase)
        snprintf(buf, sizeof(buf), "%02x", uid[i]);
        hexString += buf;
    }
    return hexString;
}

bool stringToHexArray(const std::string &hexString, uint8_t *array, uint8_t arrayLength)
{
    std::string trimmed = hexString;
    trimString(trimmed);

    size_t expectedLength = static_cast<size_t>(arrayLength) * 2;
    if (trimmed.length() != expectedLength)
    {
        return false;
    }

    for (uint8_t i = 0; i < arrayLength; i++)
    {
        char hiChar = trimmed[i * 2];
        char loChar = trimmed[(i * 2) + 1];

        int8_t hi = hexCharToNibble(hiChar);
        int8_t lo = hexCharToNibble(loChar);
        if (hi < 0 || lo < 0)
        {
            return false;
        }

        array[i] = static_cast<uint8_t>((hi << 4) | lo);
    }

    return true;
}

std::string millisToTimeString(double millis)
{
    long hours = millis / 3600000;
    long minutes = (static_cast<long>(millis) % 3600000) / 60000;
    long seconds = (static_cast<long>(millis) % 60000) / 1000;

    char buf[32];
    if (hours == 0)
    {
        snprintf(buf, sizeof(buf), "%02ld:%02ld", minutes, seconds);
    }
    else
    {
        snprintf(buf, sizeof(buf), "%02ld:%02ld:%02ld", hours, minutes, seconds);
    }
    return std::string(buf);
}

std::string timeToTimeString(time_t time, int utcOffsetMinutes)
{
    // `time` is UTC. Shift by the server-provided offset, then render with gmtime so the
    // result is independent of the device's own (unset) timezone. Offset 0 -> UTC.
    time_t shifted = time + (time_t)utcOffsetMinutes * 60;
    struct tm tmInfo;
    gmtime_r(&shifted, &tmInfo);

    char buf[24];
    snprintf(buf, sizeof(buf), "%d.%d. %02d:%02d", tmInfo.tm_mday, tmInfo.tm_mon + 1, tmInfo.tm_hour, tmInfo.tm_min);
    return std::string(buf);
}
