#pragma once

#include <Arduino.h>
#include <Adafruit_PN532_NTAG424.h>
#include <Wire.h>
#include "configuration.hpp"

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

// Forward declare API instead of including the header
class API; // Forward declaration instead of #include "api.hpp"

class NFC
{
public:
    // Using I2C with default IRQ and RESET pins (no pins need to be defined)
    NFC(API *api) : nfc(PIN_PN532_IRQ, PIN_PN532_RESET, &Wire), api(api) {}
    ~NFC() {}

    void setup();
    void loop();

    void enableCardChecking();
    void disableCardChecking();

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

private:
    Adafruit_PN532 nfc;
    API *api;

    // State machine variables
    uint8_t state = NFC_STATE_INIT;
    unsigned long last_state_time = 0;
    unsigned long scan_start_time = 0;

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

    bool is_card_checking_enabled = false;

    // Helper constant
    const uint8_t AUTH_CMD = 0x71;
};