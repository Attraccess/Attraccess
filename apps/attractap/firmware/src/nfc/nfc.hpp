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
     * Runs on a dedicated FreeRTOS task (Application::nfcTask), NOT the main
     * loop: PN532 polling blocks the shared I2C bus and used to stall the UI
     * (ATT-554 item 6). All public card operations are serialized with an
     * internal recursive mutex so the main-loop enrollment/reset state machines
     * can keep calling changeKey()/authenticate()/getAvailableKeyNo() safely.
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

    // Polling cadence (ATT-554 item 6): keep every bus hold short and rare.
    // - When no card is present: probe every ~125 ms with a ~25 ms timeout
    //   (instead of a blocking 100 ms timeout on every single loop pass).
    // - When a card rests on the reader: verify presence via AES handshake only
    //   every ~250 ms (instead of a full handshake per loop pass).
    uint32_t lastDetectionPollMs = 0;
    uint32_t lastPresenceCheckMs = 0;
    static const uint32_t detectionPollIntervalMs = 125;
    static const uint16_t detectionPollTimeoutMs = 25;
    static const uint32_t presenceCheckIntervalMs = 250;
};