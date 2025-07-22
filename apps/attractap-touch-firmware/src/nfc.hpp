#pragma once

#include <Arduino.h>
#include "Adafruit_PN532_NTAG424.h"
#include <Wire.h>

// NFC state machine states
#define NFC_STATE_INIT 0
#define NFC_STATE_READY 1
#define NFC_STATE_SCANNING 2
#define NFC_STATE_AUTH_START 3
#define NFC_STATE_AUTH_WAIT 4
#define NFC_STATE_WRITE_START 5
#define NFC_STATE_WRITE_WAIT 6
#define NFC_STATE_CHANGE_KEY_START 7
#define NFC_STATE_CHANGE_KEY_WAIT 8

#include <functional>

class NFC
{
public:
    // Using I2C with default IRQ and RESET pins (no pins need to be defined)
    NFC() : nfc(PIN_PN532_IRQ, PIN_PN532_RESET, &Wire) {}
    ~NFC() {}

    void setup();
    void loop();

    void enableCardChecking();
    void disableCardChecking();

    // Status methods
    bool isNFCDisabled() const { return nfc_disabled; }
    uint16_t getConsecutiveErrors() const { return consecutive_errors; }
    String getStatusString() const;

    // These operations start the non-blocking operations
    // Returns true if operation was started successfully
    bool startChangeKey(uint8_t keyNumber, uint8_t authKey[16], uint8_t newKey[16]);
    bool startWriteData(uint8_t authKey[16], uint8_t keyNumber, uint8_t data[], size_t dataLength);
    bool startAuthenticate(uint8_t keyNumber, uint8_t authKey[16]);

    // Legacy blocking API - deprecated but kept for backwards compatibility
    bool changeKey(uint8_t keyNumber, uint8_t authKey[16], uint8_t newKey[16]);
    bool writeData(uint8_t authKey[16], uint8_t keyNumber, uint8_t data[], size_t dataLength);
    bool authenticate(uint8_t keyNumber, uint8_t authKey[16]);

    void waitForCardRemoval();

    // Callbacks for operation completion
    void setAuthCompleteCallback(void (*callback)(bool success));
    void setWriteCompleteCallback(void (*callback)(bool success));
    void setChangeKeyCompleteCallback(void (*callback)(bool success));

public:
    // Callback for when an NFC card is tapped
    void setNFCTappedCallback(const std::function<void(const uint8_t *uid, uint8_t uidLength)> &callback) { onNFCTapped = callback; }

private:
    Adafruit_PN532 nfc;
    std::function<void(const uint8_t *uid, uint8_t uidLength)> onNFCTapped;

    // State machine variables
    uint8_t state = NFC_STATE_INIT;
    unsigned long last_state_time = 0;
    unsigned long scan_start_time = 0;

    // Error tracking and recovery
    uint16_t consecutive_errors = 0;
    uint32_t last_error_time = 0;
    bool nfc_disabled = false;
    static const uint16_t MAX_CONSECUTIVE_ERRORS = 10;
    static const uint32_t ERROR_BACKOFF_BASE = 1000;    // 1 second base backoff
    static const uint32_t MAX_ERROR_BACKOFF = 30000;    // 30 seconds max backoff
    static const uint32_t NFC_DISABLE_DURATION = 60000; // 60 seconds disable after too many errors

    // Async operation variables
    uint8_t auth_key_number;
    uint8_t auth_key[16];
    uint8_t new_key[16];
    uint8_t write_data[64]; // Buffer for data to write
    size_t write_data_length;
    bool operation_success = false;

    // Callback functions
    void (*auth_complete_callback)(bool success) = nullptr;
    void (*write_complete_callback)(bool success) = nullptr;
    void (*change_key_complete_callback)(bool success) = nullptr;

    // State handlers
    void handleInitState();
    void handleReadyState();
    void handleScanningState();
    void handleAuthState();
    void handleWriteState();
    void handleChangeKeyState();

    // Error handling and recovery
    void recordError();
    void recordSuccess();
    bool shouldRetryOperation();
    uint32_t getBackoffDelay();
    void checkErrorRecovery();

    bool is_card_checking_enabled = false;

    // Helper constant
    const uint8_t AUTH_CMD = 0x71;
};