#include "utils.hpp"
#include <string>
#include <cstdio>
#include <cstring>
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "platform.hpp"

static SemaphoreHandle_t s_i2cBusMutex = nullptr;
static i2c_master_bus_handle_t s_i2cBus = nullptr;

bool initSharedI2CBus(int sda, int scl)
{
    if (s_i2cBus)
    {
        return true;
    }
    i2c_master_bus_config_t cfg = {};
    cfg.i2c_port = I2C_NUM_0;
    cfg.sda_io_num = (gpio_num_t)sda;
    cfg.scl_io_num = (gpio_num_t)scl;
    cfg.clk_source = I2C_CLK_SRC_DEFAULT;
    cfg.glitch_ignore_cnt = 7;
    cfg.flags.enable_internal_pullup = true; // Wire.begin() default
    return i2c_new_master_bus(&cfg, &s_i2cBus) == ESP_OK;
}

i2c_master_bus_handle_t getSharedI2CBus()
{
    return s_i2cBus;
}

i2c_master_dev_handle_t addSharedI2CDevice(uint8_t address7bit, uint32_t sclSpeedHz)
{
    if (!s_i2cBus)
    {
        return nullptr;
    }
    i2c_device_config_t devCfg = {};
    devCfg.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    devCfg.device_address = address7bit;
    devCfg.scl_speed_hz = sclSpeedHz;
    i2c_master_dev_handle_t dev = nullptr;
    if (i2c_master_bus_add_device(s_i2cBus, &devCfg, &dev) != ESP_OK)
    {
        return nullptr;
    }
    return dev;
}

void I2CBusLock::init()
{
    if (!s_i2cBusMutex)
    {
        s_i2cBusMutex = xSemaphoreCreateRecursiveMutex();
    }
}

void I2CBusLock::lock()
{
    if (s_i2cBusMutex)
    {
        xSemaphoreTakeRecursive(s_i2cBusMutex, portMAX_DELAY);
    }
}

void I2CBusLock::unlock()
{
    if (s_i2cBusMutex)
    {
        xSemaphoreGiveRecursive(s_i2cBusMutex);
    }
}

void recoverI2CBus(int sda, int scl)
{
    gpio_num_t sdaPin = (gpio_num_t)sda;
    gpio_num_t sclPin = (gpio_num_t)scl;

    gpio_set_direction(sclPin, GPIO_MODE_OUTPUT);
    gpio_set_direction(sdaPin, GPIO_MODE_INPUT); // sense SDA without driving it
    gpio_set_pull_mode(sdaPin, GPIO_PULLUP_ONLY);
    for (int i = 0; i < 9; i++)
    {
        gpio_set_level(sclPin, 0);
        delayMicroseconds(10);
        gpio_set_level(sclPin, 1);
        delayMicroseconds(10);
        if (gpio_get_level(sdaPin))
            break; // slave released SDA — bus is free
    }
    // STOP condition: SDA LOW → SCL HIGH → SDA HIGH
    gpio_set_direction(sdaPin, GPIO_MODE_OUTPUT);
    gpio_set_level(sdaPin, 0);
    delayMicroseconds(10);
    gpio_set_level(sclPin, 1);
    delayMicroseconds(10);
    gpio_set_level(sdaPin, 1);
    delayMicroseconds(10);
    // Release the pads so the i2c_master driver can claim them right after
    gpio_reset_pin(sdaPin);
    gpio_reset_pin(sclPin);
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

std::string translateReaderError(const std::string &errorKey)
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
