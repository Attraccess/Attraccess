#pragma once

#include <Arduino.h>
#include "../logger/logger.hpp"
#include "Adafruit_PN532_NTAG424.h"
#include <Wire.h>
#include "../state/state.hpp"
#include "../utils.hpp"
#include <functional>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

class NFC
{
public:
    NFC() : logger("NFC"), pn532(PIN_PN532_IRQ, -1, &Wire)
    {
    }

    void setup();

    /**
     * Runs on the main application loop (the dedicated NFC task from ATT-554
     * item 6 is reverted while the field I2C wedge is isolated). Blocking PN532
     * time costs only the main loop — rendering and touch live on LvglTask.
     * Public card operations stay serialized with an internal recursive mutex,
     * and every PN532 conversation holds the shared I2CBusGuard against the
     * touch reads on LvglTask.
     */
    void loop();

    bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey, uint8_t *newKey);
    bool authenticate(uint8_t keyNumber, uint8_t *key);
    void enableCardDetection();
    void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback);
    void setCardRemovalCallback(std::function<void(uint32_t presentationTimeMs)> callback);
    void disableCardDetection();

    // Forget the currently tracked card so the next enableCardDetection() cycle
    // re-detects from a clean state (fresh readPassiveTargetID) instead of
    // assuming the previously held card is still present.
    void resetCardPresence();

    bool getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo);

    static uint8_t FACTORY_KEY[16];

    bool isCardDetectionEnabled();

    // True while a card is physically on the reader (tracked by handleCardDetection).
    bool isCardPresent();

private:
    Logger logger;
    Adafruit_PN532 pn532;
    bool waitForCard(uint32_t timeoutMs = 10000);

    uint8_t cardDetectedUid[7] = {0};
    uint8_t cardDetectedUidLength = 0;

    // Written by the NFC task, read from the main loop.
    volatile bool foundCard = false;
    uint32_t foundCardTimeMs = 0;

    // TODO: remove this
    void demo();

    // Toggled from main loop / callbacks, read by the NFC task.
    volatile bool cardDetectionEnabled = false;
    std::function<void(uint8_t *, uint8_t)> cardDetectionCallback;
    std::function<void(uint32_t presentationTimeMs)> cardRemovalCallback;
    void handleCardDetection();

    uint32_t lastHardwareCheckMs = 0;
    void checkHardware(bool logHardwareInfo = false);
    static const uint32_t hardwareCheckIntervalMs = 10000;

    // Serializes every PN532 conversation (poll loop on the NFC task vs.
    // enrollment/reset card operations on the main loop). Recursive because
    // e.g. getAvailableKeyNo() -> authenticate() and the detection callback
    // (fired while loop() holds the lock) may call back into NFC methods.
    SemaphoreHandle_t opMutex = nullptr;
    void lock();
    void unlock();

    // RAII helper so every exit path of a card operation releases the mutex.
    class LockGuard
    {
    public:
        explicit LockGuard(NFC &nfc) : nfc(nfc) { nfc.lock(); }
        ~LockGuard() { nfc.unlock(); }
        LockGuard(const LockGuard &) = delete;
        LockGuard &operator=(const LockGuard &) = delete;

    private:
        NFC &nfc;
    };

    // Pre-ATT-554 polling semantics (rate limits reverted for isolation):
    // blocking 100 ms detection poll and a presence handshake on every loop
    // pass, exactly like the firmware that was known to run stable.
    static const uint16_t detectionPollTimeoutMs = 100;
};