#pragma once

#include <Arduino.h>
#include "Adafruit_PN532_NTAG424.h"
#include <esp_task_wdt.h>
#include <Wire.h>

#define PIN_PN532_IRQ (2)
#define PIN_PN532_RESET (0)

class NFC
{
public:
    NFC() : pn532(PIN_PN532_IRQ, PIN_PN532_RESET, &Wire) {}

    void setup();

    /*
     *  Set the callback to be called when an nfc card is detected
     *  @param callback : callback to be called when an nfc card is detected
     */
    void setOnNfcCardDetected(void (*callback)(char *uuid));

    /*
     *  Authenticate with the nfc card
     *  @param uuid: uuid of the nfc card (can be nullptr to authenticate with any card)
     *  @param keyNumber: key number to authenticate with
     *  @param key: key to authenticate with (16 bytes)
     *  @param waitForRemovalAtEnd: whether to wait for card removal after authentication
     *  @return true if authentication is successful, false otherwise
     */
    bool authenticate(const uint8_t keyNumber, uint8_t *key, bool waitForRemovalAtEnd = true);

    /*
     *  Change a key on the nfc card
     *  @param uuid: uuid of the nfc card
     *  @param keyNumber: key number to change
     *  @param authKey: key to authenticate with (16 bytes)
     *  @param newKey: new key to use (16 bytes)
     *  @return true if key change is successful, false otherwise
     */
    bool changeKey(const uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey);

    /*
     *  Waits a given amount of time for the nfc card to be detected
     *  @param timeout: timeout in milliseconds
     *  @return true if the nfc card is detected, false otherwise
     */
    bool waitForNfcCardWithUID(const char *expectedUuid, const uint32_t timeoutMs);
    bool waitForNfcCard(const uint32_t timeoutMs);
    bool waitForNfcCard(char *detectedUid, uint8_t *detectedUidLength, const uint32_t timeoutMs);

    /*
     *  Waits for the nfc card to be removed
     */
    void waitForCardRemoval();

    /*
     *  Convert a byte array to a string
     *  @param uuid: the byte array to convert
     *  @param length: the length of the byte array
     *  @return the string representation of the byte array
     */
    void uintArrayToCharArray(const uint8_t *uuid, const uint8_t length, char *charArray);

    /*
     *  Discover the nfc card one time
     *  @param dicoveredUuid: the discovered uuid
     *  @param discoveredUuidLength: the length of the discovered uuid
     *  @param timeoutMs: the timeout in milliseconds
     *  @return true if the nfc card is discovered, false otherwise
     */
    bool discoverNfcCard(char *dicoveredUuid, uint8_t *discoveredUuidLength, const uint32_t timeoutMs = 500);

    void enableLoopCardDetection();
    void disableLoopCardDetection();
    bool isLoopCardDetectionEnabled();

private:
    static const uint8_t AUTH_KEY_NO = 0;
    static const uint8_t AUTH_CMD = 0x71;

    TaskHandle_t task_handle;
    static void task_function(void *pvParameters);

    Adafruit_PN532 pn532;

    bool nfc_is_detected = false;
    bool nfc_is_ready = false;
    bool loop_card_detection_is_enabled = false;

    void (*onNfcCardDetected)(char *uuid);

    void loop();

    /*
     *  Detect the nfc module and set the nfc_is_detected flag if it is detected
     */
    bool detectNfcModule();

    /*
     *  Configure the nfc module
     */
    bool configureNfcModule();
};