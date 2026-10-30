#pragma once

#include <string>

#include "../logger/logger.hpp"
#include "Adafruit_PN532_NTAG424.h"
#include "../state/state.hpp"
#include "../utils.hpp"
#include <functional>
#include "rfid_contract.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

class NFC : public INfc
{
public:
    NFC() : logger("NFC"), pn532(PN532_I2C_ADDRESS)
    {
    }

    void setup() override;

    /**
     * Runs on the main application loop (the dedicated NFC task from ATT-554
     * item 6 is reverted while the field I2C wedge is isolated). Blocking PN532
     * time costs only the main loop — rendering and touch live on LvglTask.
     * Public card operations stay serialized with an internal recursive mutex,
     * and every PN532 conversation holds the shared I2CBusGuard against the
     * touch reads on LvglTask.
     */
    void loop() override;

    bool transceive(const uint8_t *apdu, uint8_t apduLength, uint8_t *response, uint8_t *responseLength) override;
    void setConversationActive(bool active) override;
    void enableCardDetection() override;
    void setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback) override;
    void setCardRemovalCallback(std::function<void(uint32_t presentationTimeMs)> callback) override;
    void disableCardDetection() override;
    bool suspend() override;

    // Forget the currently tracked card so the next enableCardDetection() cycle
    // re-detects from a clean state (fresh readPassiveTargetID) instead of
    // assuming the previously held card is still present.
    void resetCardPresence() override;

    bool isCardDetectionEnabled();

    // True while a card is physically on the reader (tracked by handleCardDetection).
    bool isCardPresent() override;

private:
    Logger logger;
    Adafruit_PN532 pn532;
    bool waitForCard(uint32_t timeoutMs = 10000);

    uint8_t cardDetectedUid[7] = {0};
    uint8_t cardDetectedUidLength = 0;

    // Written by the NFC task, read from the main loop.
    volatile bool foundCard = false;
    uint32_t foundCardTimeMs = 0;
    // Presence probe throttle: a card parked on the reader is probed with one keyless command
    // every 250 ms, well under the ~1 s removal-detection budget.
    uint32_t lastPresenceCheckMs = 0;
    static const uint32_t presenceCheckIntervalMs = 250;

    // Toggled from main loop / callbacks, read by the NFC task.
    volatile bool cardDetectionEnabled = false;
    // A server-driven card conversation is running: no presence probes in between (see INfc).
    volatile bool conversationActive = false;
    bool suspended = false;
    bool rfFieldOff = false;
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

    // Detection poll timeout. Reduced from the pre-ATT-554 100 ms to 30 ms:
    // the blocking poll holds I2CBusLock and starves touch+render; 30 ms
    // stays well above the PN532 command turnaround (~5 ms @ 400 kHz) while
    // cutting the worst-case bus hold per loop pass by ~3x
    // (PERFORMANCE_ANALYSIS.md quick win Q4).
    static const uint16_t detectionPollTimeoutMs = 30;
};
