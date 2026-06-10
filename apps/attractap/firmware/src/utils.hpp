#pragma once

#include <Arduino.h>

/**
 * Shared I2C bus clock (Hz). GT911 touch, PN532 NFC and the PCA9555 IO expander
 * all support 400 kHz Fast Mode, but field testing on reader-21 showed the bus
 * wedging once NFC traffic starts (ATT-554 crash + follow-up reports), so the
 * 400 kHz change (item 3) is reverted to the proven 100 kHz while the I2C
 * problems are isolated. Must be re-applied after every Wire.begin(), because
 * library begin() calls (SensorLib, Adafruit BusIO) re-invoke Wire.begin() and
 * can reset the clock - same pitfall as the Wire.setTimeOut(50) restores.
 */
static constexpr uint32_t ATTRACTAP_I2C_CLOCK_HZ = 400000;

String hexToString(uint8_t *uid, uint8_t uidLength);
bool stringToHexArray(String hexString, uint8_t *array, uint8_t arrayLength);

/**
 * Global lock serializing all traffic on the shared I2C bus.
 *
 * PN532 (NfcTask), GT911 touch (LvglTask) and the IO expander (main loop /
 * LVGL callbacks) share one physical bus but run on different FreeRTOS tasks
 * since ATT-554. TwoWire's internal lock only serializes single transactions;
 * a PN532 conversation (write command, poll ready, read frame — with clock
 * stretching in between) interleaved with GT911/IO-expander transactions can
 * wedge the ESP-IDF I2C driver: a field coredump showed LvglTask stuck inside
 * an I2C read holding the TwoWire lock, NfcTask blocked forever on that lock
 * while holding its NFC op mutex, and loopTask blocked on lv_lock until the
 * task watchdog rebooted the reader.
 *
 * Rules:
 * - Hold the lock for one complete logical transaction/conversation
 *   (full PN532 command+response exchange, one GT911 point read, one IO
 *   expander register access).
 * - The lock is strictly a LEAF lock: while holding it, never take lv_lock,
 *   never fire application callbacks, never block on queues/other mutexes.
 * - Recursive, so nested NFC helpers (e.g. getAvailableKeyNo -> authenticate)
 *   are safe on the same task.
 */
class I2CBusLock
{
public:
    // Must run before any secondary task can touch the bus (called from setup()
    // in main.cpp right after Wire.begin()).
    static void init();
    static void lock();
    static void unlock();
};

// RAII guard for I2CBusLock — every exit path releases the bus.
class I2CBusGuard
{
public:
    I2CBusGuard() { I2CBusLock::lock(); }
    ~I2CBusGuard() { I2CBusLock::unlock(); }
    I2CBusGuard(const I2CBusGuard &) = delete;
    I2CBusGuard &operator=(const I2CBusGuard &) = delete;
};

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
