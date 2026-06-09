#pragma once

#include <Arduino.h>

/**
 * @brief Shared I2C bus serialization (ATT-548).
 *
 * The GT911 touch controller and the PN532 NFC reader sit on the same physical
 * I2C bus. Touch is now read from a dedicated LVGL render task while NFC polling
 * runs on the app loop task, so concurrent bus transactions must be serialized.
 * The mutex is recursive: a single task may re-enter (e.g. NFC::loop ->
 * checkHardware, or changeKey -> authenticate) without deadlocking.
 *
 * Lock ordering rule: whenever both the LVGL lock and the I2C lock are held by
 * the same task, the LVGL lock is always taken first (lv_lock -> i2cBusLock).
 *
 * i2cBusInit() must be called once after Wire.begin(); the lock/unlock helpers
 * are no-ops until then (safe during single-threaded boot).
 */
void i2cBusInit();
void i2cBusLock();
void i2cBusUnlock();

/** RAII helper: holds the shared I2C bus lock for the enclosing scope. */
struct I2CBusGuard
{
    I2CBusGuard() { i2cBusLock(); }
    ~I2CBusGuard() { i2cBusUnlock(); }
    I2CBusGuard(const I2CBusGuard &) = delete;
    I2CBusGuard &operator=(const I2CBusGuard &) = delete;
};

String hexToString(uint8_t *uid, uint8_t uidLength);
bool stringToHexArray(String hexString, uint8_t *array, uint8_t arrayLength);

/**
 * @brief Recover a stuck I2C bus by bit-banging 9 SCL clock pulses then a STOP.
 *
 * Releases any I2C slave that is holding SDA low mid-transaction (common after a
 * firmware flash or crash resets the ESP32 master without power-cycling slaves).
 * Pins are left ready for Wire.begin() to reclaim immediately after.
 *
 * @param sda SDA GPIO number
 * @param scl SCL GPIO number
 */
void recoverI2CBus(int sda, int scl);

/**
 * @brief Convert milliseconds to a time string in the format "HH:MM:SS"
 * @param millis The milliseconds to convert
 * @return The time string
 */
String millisToTimeString(double millis);

/**
 * @brief Convert a UTC time_t to a time string in the format "DD.MM. HH:MM"
 * @param time The time_t (UTC) to convert
 * @param utcOffsetMinutes Minutes east of UTC to apply before formatting (0 = render UTC)
 * @return The time string
 */
String timeToTimeString(time_t time, int utcOffsetMinutes = 0);

/**
 * @brief Parse an ISO8601 datetime string (e.g. "2025-10-16T12:34:56Z" or with offset) to time_t (UTC)
 *
 * Supported examples:
 * - "YYYY-MM-DDTHH:MM:SSZ"
 * - "YYYY-MM-DDTHH:MM:SS.sssZ"
 * - "YYYY-MM-DDTHH:MM:SS+HH:MM" / "YYYY-MM-DDTHH:MM:SS-HH:MM"
 * - Same with optional fractional seconds
 *
 * Returns (time_t)-1 on parse failure.
 */
time_t parseIso8601ToTimeT(const String &iso8601);

/**
 * @brief Translate a machine error key from the server into a human-readable
 * German message for display on the reader (ATT-144).
 *
 * Known keys map to fixed German strings; unknown values (including free-form
 * server messages) are returned unchanged so the raw error is still surfaced.
 * Strings avoid umlauts (ae/oe/ue/ss) so they render with the reader's bitmap
 * fonts on every screen.
 *
 * @param errorKey The error key/string received from the server
 * @return Human-readable German error message
 */
String translateReaderError(const String &errorKey);