#include "utils.hpp"

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

String hexToString(uint8_t *uid, uint8_t uidLength)
{
    String hexString = "";
    for (uint8_t i = 0; i < uidLength; i++)
    {
        // Always render two hex digits per byte (zero-padded)
        if (uid[i] < 0x10)
        {
            hexString += "0";
        }
        hexString += String(uid[i], HEX);
    }
    return hexString;
}

bool stringToHexArray(String hexString, uint8_t *array, uint8_t arrayLength)
{
    hexString.trim();

    uint8_t expectedLength = arrayLength * 2;
    uint8_t hexLength = hexString.length();
    if (hexLength != expectedLength)
    {
        return false;
    }

    for (uint8_t i = 0; i < arrayLength; i++)
    {
        char hiChar = hexString.charAt(i * 2);
        char loChar = hexString.charAt((i * 2) + 1);

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

String millisToTimeString(double millis)
{
    long hours = millis / 3600000;
    long minutes = (static_cast<long>(millis) % 3600000) / 60000;
    long seconds = (static_cast<long>(millis) % 60000) / 1000;
    return String(hours) + ":" + String(minutes) + ":" + String(seconds);
}

String timeToTimeString(time_t time)
{
    struct tm *tm = localtime(&time);
    int year = tm->tm_year + 1900;
    int month = tm->tm_mon + 1;
    int day = tm->tm_mday;
    int hour = tm->tm_hour;
    int minute = tm->tm_min;
    int second = tm->tm_sec;
    return String(year) + "." + String(month) + "." + String(day) + " " + String(hour) + ":" + String(minute);
}