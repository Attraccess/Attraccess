#include "utils.hpp"
#include <string>
#include <cstdio>
#include <cstring>
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "platform.hpp"

static bool parseTwoDigits(const std::string &s, size_t startIndex, int &out)
{
    if (startIndex + 1 >= s.length())
        return false;
    char c0 = s[startIndex];
    char c1 = s[startIndex + 1];
    if (c0 < '0' || c0 > '9' || c1 < '0' || c1 > '9')
        return false;
    out = (c0 - '0') * 10 + (c1 - '0');
    return true;
}

static bool parseFourDigits(const std::string &s, size_t startIndex, int &out)
{
    if (startIndex + 3 >= s.length())
        return false;
    int d0, d2;
    if (!parseTwoDigits(s, startIndex, d0))
        return false;
    if (!parseTwoDigits(s, startIndex + 2, d2))
        return false;
    out = d0 * 100 + d2;
    return true;
}

time_t parseIso8601ToTimeT(const std::string &iso8601)
{
    std::string s = iso8601;
    trimString(s);
    // Expected base: YYYY-MM-DDTHH:MM:SS[.frac][Z|±HH:MM]
    // Minimal length: 19 (YYYY-MM-DDTHH:MM:SS)
    if (s.length() < 19)
        return (time_t)-1;

    int year, month, day, hour, minute, second;
    if (!parseFourDigits(s, 0, year))
        return (time_t)-1; // YYYY
    if (s[4] != '-')
        return (time_t)-1;
    if (!parseTwoDigits(s, 5, month))
        return (time_t)-1; // MM
    if (s[7] != '-')
        return (time_t)-1;
    if (!parseTwoDigits(s, 8, day))
        return (time_t)-1; // DD
    char tSep = s[10];
    if (tSep != 'T' && tSep != 't' && tSep != ' ')
        return (time_t)-1;
    if (!parseTwoDigits(s, 11, hour))
        return (time_t)-1; // HH
    if (s[13] != ':')
        return (time_t)-1;
    if (!parseTwoDigits(s, 14, minute))
        return (time_t)-1; // MM
    if (s[16] != ':')
        return (time_t)-1;
    if (!parseTwoDigits(s, 17, second))
        return (time_t)-1; // SS

    size_t index = 19;
    // Optional fractional seconds: .sss...
    if (index < s.length() && s[index] == '.')
    {
        index++;
        while (index < s.length())
        {
            char c = s[index];
            if (c < '0' || c > '9')
                break;
            index++;
        }
    }

    // Timezone: 'Z' or ±HH:MM or absent (assume Z if absent)
    int tzSign = 0;
    int tzHour = 0;
    int tzMinute = 0;
    if (index < s.length())
    {
        char tz = s[index];
        if (tz == 'Z' || tz == 'z')
        {
            index++;
        }
        else if (tz == '+' || tz == '-')
        {
            tzSign = (tz == '+') ? 1 : -1;
            // Expect HH:MM
            if (!parseTwoDigits(s, index + 1, tzHour))
                return (time_t)-1;
            if (index + 3 >= s.length() || s[index + 3] != ':')
                return (time_t)-1;
            if (!parseTwoDigits(s, index + 4, tzMinute))
                return (time_t)-1;
            index += 6;
        }
        // else: unrecognized tail -> fail
        else
        {
            return (time_t)-1;
        }
    }

    // Build tm in UTC
    struct tm tmUtc;
    memset(&tmUtc, 0, sizeof(tmUtc));
    tmUtc.tm_year = year - 1900;
    tmUtc.tm_mon = month - 1;
    tmUtc.tm_mday = day;
    tmUtc.tm_hour = hour;
    tmUtc.tm_min = minute;
    tmUtc.tm_sec = second;

    // mktime assumes local time; we want UTC. On many embedded libc implementations, time is UTC if TZ not set.
    // To be robust, compute time as if local, then adjust by timezone offset.
    time_t t = mktime(&tmUtc);
    if (t == (time_t)-1)
        return (time_t)-1;

    // If the string had an explicit offset, normalize to UTC by subtracting the offset.
    // Example: 12:00:00+02:00 means local is UTC+2, so UTC = local - 2h.
    if (tzSign != 0)
    {
        long offsetSeconds = (tzHour * 3600L + tzMinute * 60L) * tzSign;
        t -= offsetSeconds;
    }

    return t;
}
