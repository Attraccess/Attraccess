#include "utils.hpp"

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

// Shared I2C bus mutex (ATT-548). Recursive so a single task can re-enter
// nested PN532 calls. Null until i2cBusInit(); helpers no-op before then so the
// single-threaded boot sequence works unchanged.
static SemaphoreHandle_t s_i2cBusMutex = nullptr;

void i2cBusInit()
{
    if (!s_i2cBusMutex)
    {
        s_i2cBusMutex = xSemaphoreCreateRecursiveMutex();
    }
}

void i2cBusLock()
{
    if (s_i2cBusMutex)
    {
        xSemaphoreTakeRecursive(s_i2cBusMutex, portMAX_DELAY);
    }
}

void i2cBusUnlock()
{
    if (s_i2cBusMutex)
    {
        xSemaphoreGiveRecursive(s_i2cBusMutex);
    }
}

void recoverI2CBus(int sda, int scl)
{
    pinMode(scl, OUTPUT);
    pinMode(sda, INPUT_PULLUP); // sense SDA without driving it
    for (int i = 0; i < 9; i++)
    {
        digitalWrite(scl, LOW);
        delayMicroseconds(10);
        digitalWrite(scl, HIGH);
        delayMicroseconds(10);
        if (digitalRead(sda))
            break; // slave released SDA — bus is free
    }
    // STOP condition: SDA LOW → SCL HIGH → SDA HIGH
    pinMode(sda, OUTPUT);
    digitalWrite(sda, LOW);
    delayMicroseconds(10);
    digitalWrite(scl, HIGH);
    delayMicroseconds(10);
    digitalWrite(sda, HIGH);
    delayMicroseconds(10);
    // Pins will be reclaimed by Wire.begin() immediately after
}

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

String padWithZero(int value, int length)
{
    String s = String(value);
    while (s.length() < length)
    {
        s = "0" + s;
    }
    return s;
}

String millisToTimeString(double millis)
{
    long hours = millis / 3600000;
    long minutes = (static_cast<long>(millis) % 3600000) / 60000;
    long seconds = (static_cast<long>(millis) % 60000) / 1000;

    String minutesString = padWithZero(minutes, 2);
    String secondsString = padWithZero(seconds, 2);

    if (hours == 0)
    {
        return minutesString + ":" + secondsString;
    }

    String hoursString = padWithZero(hours, 2);
    return hoursString + ":" + minutesString + ":" + secondsString;
}

String timeToTimeString(time_t time, int utcOffsetMinutes)
{
    // `time` is UTC. Shift by the server-provided offset, then render with gmtime so the
    // result is independent of the device's own (unset) timezone. Offset 0 -> UTC.
    time_t shifted = time + (time_t)utcOffsetMinutes * 60;
    struct tm tmInfo;
    gmtime_r(&shifted, &tmInfo);
    struct tm *tm = &tmInfo;
    int month = tm->tm_mon + 1;
    int day = tm->tm_mday;
    int hours = tm->tm_hour;
    int minutes = tm->tm_min;

    String hoursString = padWithZero(hours, 2);
    String minutesString = padWithZero(minutes, 2);

    return String(day) + "." + String(month) + ". " + hoursString + ":" + minutesString;
}

static bool parseTwoDigits(const String &s, int startIndex, int &out)
{
    if (startIndex + 1 >= s.length())
        return false;
    char c0 = s.charAt(startIndex);
    char c1 = s.charAt(startIndex + 1);
    if (c0 < '0' || c0 > '9' || c1 < '0' || c1 > '9')
        return false;
    out = (c0 - '0') * 10 + (c1 - '0');
    return true;
}

static bool parseFourDigits(const String &s, int startIndex, int &out)
{
    if (startIndex + 3 >= s.length())
        return false;
    int d0, d1, d2, d3;
    if (!parseTwoDigits(s, startIndex, d0))
        return false;
    if (!parseTwoDigits(s, startIndex + 2, d2))
        return false;
    out = d0 * 100 + d2;
    return true;
}

time_t parseIso8601ToTimeT(const String &iso8610)
{
    // Copy into a local C-string for strptime-like parsing we implement manually
    String s = iso8610;
    s.trim();
    // Expected base: YYYY-MM-DDTHH:MM:SS[.frac][Z|±HH:MM]
    // Minimal length: 19 (YYYY-MM-DDTHH:MM:SS)
    if (s.length() < 19)
        return (time_t)-1;

    int year, month, day, hour, minute, second;
    if (!parseFourDigits(s, 0, year))
        return (time_t)-1; // YYYY
    if (s.charAt(4) != '-')
        return (time_t)-1;
    if (!parseTwoDigits(s, 5, month))
        return (time_t)-1; // MM
    if (s.charAt(7) != '-')
        return (time_t)-1;
    if (!parseTwoDigits(s, 8, day))
        return (time_t)-1; // DD
    char tSep = s.charAt(10);
    if (tSep != 'T' && tSep != 't' && tSep != ' ')
        return (time_t)-1;
    if (!parseTwoDigits(s, 11, hour))
        return (time_t)-1; // HH
    if (s.charAt(13) != ':')
        return (time_t)-1;
    if (!parseTwoDigits(s, 14, minute))
        return (time_t)-1; // MM
    if (s.charAt(16) != ':')
        return (time_t)-1;
    if (!parseTwoDigits(s, 17, second))
        return (time_t)-1; // SS

    int index = 19;
    // Optional fractional seconds: .sss...
    if (index < s.length() && s.charAt(index) == '.')
    {
        index++;
        while (index < s.length())
        {
            char c = s.charAt(index);
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
        char tz = s.charAt(index);
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
            if (s.charAt(index + 3) != ':')
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

String translateReaderError(const String &errorKey)
{
    // Card / enrollment errors
    if (errorKey == "USER_NOT_SET")
        return "Kein Benutzer ausgewaehlt";
    if (errorKey == "INVALID_PARAMS")
        return "Ungueltige Anfrage";
    if (errorKey == "CARD_ALREADY_ENROLLED")
        return "Karte ist bereits registriert";
    if (errorKey == "ENROLL_NEW_CARD_DATA_NOT_SET")
        return "Registrierungsdaten fehlen";
    if (errorKey == "KEY_NOT_SET")
        return "Schluessel fehlt";
    if (errorKey == "USER_NOT_FOUND")
        return "Benutzer nicht gefunden";
    if (errorKey == "RESET_NFC_CARD_DATA_NOT_SET")
        return "Daten zum Zuruecksetzen fehlen";
    if (errorKey == "INVALID_UID")
        return "Ungueltige Karten-UID";
    if (errorKey == "CARD_NOT_FOUND")
        return "Karte nicht gefunden";
    if (errorKey == "CARD_NOT_ACTIVE")
        return "Karte ist nicht aktiv";

    // Resource usage / session errors
    if (errorKey == "INVALID_RESOURCE_ID")
        return "Ungueltige Ressource";
    if (errorKey == "READER_NOT_FOUND")
        return "Leser nicht gefunden";
    if (errorKey == "RESOURCE_NOT_ASSOCIATED_WITH_READER")
        return "Ressource ist diesem Leser nicht zugeordnet";
    if (errorKey == "USER_NOT_AUTHENTICATED")
        return "Nicht angemeldet";
    if (errorKey == "INSUFFICIENT_BALANCE")
        return "Guthaben reicht nicht aus";

    // Billing / top-up errors
    if (errorKey == "SUMUP_NOT_ENABLED")
        return "Bezahlung nicht aktiviert";
    if (errorKey == "INVALID_AMOUNT")
        return "Ungueltiger Betrag";
    if (errorKey == "NO_SUMUP_TERMINALS_AVAILABLE")
        return "Kein Zahlungsterminal verfuegbar";
    if (errorKey == "SUMUP_TOPUP_FAILED")
        return "Aufladung fehlgeschlagen";

    // Unknown key or free-form server message: surface the raw value so the
    // information is not lost (e.g. door errors sent as free-form text).
    return errorKey;
}