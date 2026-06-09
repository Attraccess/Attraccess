#pragma once

#include <Arduino.h>

/**
 * Shared I2C bus clock (Hz). GT911 touch, PN532 NFC and the PCA9555 IO expander
 * all support 400 kHz Fast Mode; running the single shared bus at 400 kHz cuts
 * every bus hold (touch reads, NFC frames, expander access) 4x vs the Arduino
 * default 100 kHz. Must be re-applied after every Wire.begin(), because library
 * begin() calls (SensorLib, Adafruit BusIO) re-invoke Wire.begin() and can reset
 * the clock - same pitfall as the Wire.setTimeOut(50) restores.
 * Fall back to 200000-300000 here if hardware signal integrity requires it.
 */
static constexpr uint32_t ATTRACTAP_I2C_CLOCK_HZ = 400000;

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