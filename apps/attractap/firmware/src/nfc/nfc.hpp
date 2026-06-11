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
    // Card technology detected at tap time (GetVersion HWType). Routing:
    // NTAG424 keeps the proven ISOSelectFile+EV2First path; DESFire EV2/EV3
    // run the same EV2First handshake inside the Attraccess application
    // (selected/created via the DESFire native commands). Unknown cards fall
    // back to the legacy NTAG424 path (pre-DESFire behavior).
    enum CardType
    {
        CARD_TYPE_UNKNOWN = 0,
        CARD_TYPE_NTAG424,
        CARD_TYPE_DESFIRE,
    };

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

    bool changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey, uint8_t *newKey, uint8_t keyVersion = 0x01);
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

    // Card type of the currently tracked card (valid while isCardPresent()).
    CardType getDetectedCardType();

    static uint8_t FACTORY_KEY[16];

    // Attraccess DESFire application (AID 0xACCE55, bytes LSB first) and the
    // PICC-level master application (AID 0x000000).
    static const uint8_t DESFIRE_AID_ATTRACCESS[3];
    static const uint8_t DESFIRE_AID_MASTER[3];

    // Application master key settings (0x0F = factory default: master key
    // changeable, free directory access, free create/delete, settings
    // changeable; ChangeKey requires app master key) and key config
    // (0x80 = AES | 6 keys, mirroring the NTAG424 key slots 0-5).
    static const uint8_t DESFIRE_APP_KEY_SETTINGS_1 = 0x0F;
    static const uint8_t DESFIRE_APP_KEY_SETTINGS_2 = 0x86;
    static const uint8_t CARD_KEY_VERSION_FREE = 0x00;
    static const uint8_t CARD_KEY_VERSION_ENROLLED = 0x01;

    bool isCardDetectionEnabled();

    // True while a card is physically on the reader (tracked by handleCardDetection).
    bool isCardPresent();

private:
    Logger logger;
    Adafruit_PN532 pn532;
    bool waitForCard(uint32_t timeoutMs = 10000);

    uint8_t cardDetectedUid[7] = {0};
    uint8_t cardDetectedUidLength = 0;

    // Set by detectCardType() right after a successful detection poll.
    CardType detectedCardType = CARD_TYPE_UNKNOWN;

    // Probe the freshly detected card via GetVersion (works unauthenticated on
    // both NTAG424 and DESFire). Caller must hold the I2C bus guard.
    void detectCardType();

    // Authenticate the tracked card with the routing described at CardType.
    // Caller must hold opMutex and the I2C bus guard.
    bool authenticateInternal(uint8_t keyNumber, uint8_t *key);

    // Select the Attraccess application on a DESFire card, optionally creating
    // it first (enrollment of factory cards). Caller must hold the bus guard.
    bool desfireSelectAttraccessApp(bool createIfMissing);

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
