#include "rfid.hpp"
#include <functional>
#include "../platform.hpp"
#include "esp_system.h"
#include <cstring>
#include <string>

void NFC::lock()
{
    if (this->opMutex)
    {
        xSemaphoreTakeRecursive(this->opMutex, portMAX_DELAY);
    }
}

void NFC::unlock()
{
    if (this->opMutex)
    {
        xSemaphoreGiveRecursive(this->opMutex);
    }
}

void NFC::setup()
{
    if (!this->opMutex)
    {
        this->opMutex = xSemaphoreCreateRecursiveMutex();
    }

    this->logger.info("Initializing PN532");
    {
        // The LVGL task is already polling GT911 touch on the shared bus at this
        // point — keep the whole PN532 bring-up atomic on the bus (ATT-554).
        I2CBusGuard busGuard;
        // Clock (400 kHz) and 50 ms transfer timeout are per-device settings of
        // the i2c_master driver now — nothing to restore after begin() anymore.
        this->pn532.begin();
    }

    this->logger.info("Checking hardware");
    this->checkHardware(true);

    // configure board to read RFID tags
    bool samConfigSuccess = false;
    {
        I2CBusGuard busGuard;
        samConfigSuccess = this->pn532.SAMConfig();
    }
    if (!samConfigSuccess)
    {
        this->logger.error("SAMConfig failed");
        return;
    }
}

void NFC::enableCardDetection()
{
    LockGuard guard(*this);
    if (this->suspended) return;
    this->logger.info("Enabling card detection");
    this->checkHardware();
    // NOTE: IRQ-driven detection is impossible on this hardware - the PN532 IRQ
    // line is not physically wired (despite the PIN_PN532_IRQ define). Detection
    // stays polled on the NFC task (ATT-554).
    this->cardDetectionEnabled = true;
}

void NFC::setCardDetectionCallback(std::function<void(uint8_t *, uint8_t)> callback)
{
    this->cardDetectionCallback = callback;
}

void NFC::disableCardDetection()
{
    this->logger.info("Disabling card detection");
    this->cardDetectionEnabled = false;
}

bool NFC::suspend()
{
    LockGuard guard(*this);
    if (this->rfFieldOff) return true;
    this->suspended = true;
    this->cardDetectionEnabled = false;
    this->resetCardPresence();

    // A timed-out InListPassiveTarget can still be running on the PN532.
    // Stopping host polling alone leaves its RF field active during OTA.
    I2CBusGuard busGuard;
    this->rfFieldOff = this->pn532.setRfField(false);
    if (!this->rfFieldOff)
        this->logger.error("Failed to turn off NFC RF field for firmware update");
    return this->rfFieldOff;
}

void NFC::resetCardPresence()
{
    this->foundCard = false;
}

bool NFC::isCardDetectionEnabled()
{
    return this->cardDetectionEnabled;
}

bool NFC::isCardPresent()
{
    return this->foundCard;
}

void NFC::setCardRemovalCallback(std::function<void(uint32_t presentationTimeMs)> callback)
{
    this->cardRemovalCallback = callback;
}

bool NFC::transceive(const uint8_t *apdu, uint8_t apduLength, uint8_t *response, uint8_t *responseLength)
{
    LockGuard guard(*this);
    if (this->suspended || apdu == nullptr || response == nullptr || responseLength == nullptr)
    {
        return false;
    }
    if (apduLength == 0 || apduLength > MAX_APDU_COMMAND_LENGTH)
    {
        return false;
    }
    // One command at a time on the shared bus; callbacks never fire in here.
    I2CBusGuard busGuard;
    // The PN532 wants a mutable buffer.
    uint8_t command[MAX_APDU_COMMAND_LENGTH];
    memcpy(command, apdu, apduLength);
    return this->pn532.inDataExchange(command, apduLength, response, responseLength);
}

void NFC::setConversationActive(bool active)
{
    this->conversationActive = active;
    // Do not let a probe that was due while the conversation ran hit the card right after it ends.
    this->lastPresenceCheckMs = millis();
}

void NFC::loop()
{
    LockGuard guard(*this);
    if (this->suspended) return;
    this->checkHardware();
    this->handleCardDetection();
}

void NFC::handleCardDetection()
{
    if (!this->cardDetectionEnabled)
    {
        return;
    }

    if (this->foundCard)
    {
        // Presence probe throttled to every 250 ms (see presenceCheckIntervalMs)
        // so a card parked on the reader doesn't hold the shared I2C bus on
        // every loop pass (PERFORMANCE_ANALYSIS.md M2).
        uint32_t now = millis();
        if (now - this->lastPresenceCheckMs < NFC::presenceCheckIntervalMs)
        {
            // card still present, wait till removed
            return;
        }
        this->lastPresenceCheckMs = now;

        // A server-driven conversation owns the card; its transceive() notices removal.
        if (this->conversationActive)
        {
            return;
        }

        // Key-independent presence probe: one plain command on both card families. Any answer,
        // even an error status, means a card is in the field; only silence means it is gone.
        bool authSuccess = false;
        {
            I2CBusGuard busGuard;
            static const uint8_t probe[] = {0x90, 0x5A, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00};
            uint8_t command[sizeof(probe)];
            memcpy(command, probe, sizeof(probe));
            uint8_t answer[MAX_APDU_RESPONSE_LENGTH];
            uint8_t answerLength = sizeof(answer);
            authSuccess = this->pn532.inDataExchange(command, sizeof(probe), answer, &answerLength);
        }
        if (!authSuccess)
        {
            // card removed, call callback
            this->logger.debug("Card removed");
            // this->disableCardDetection();
            this->foundCard = false;
            uint32_t presentationTimeMs = millis() - this->foundCardTimeMs;

            this->logger.debugf("Calling card detection callback with presentation time: %d ms", presentationTimeMs);
            if (this->cardRemovalCallback != nullptr)
            {
                this->cardRemovalCallback(presentationTimeMs);
            }
        }

        // card still present, wait till removed
        return;
    }

    bool foundCardUpdate = false;
    {
        // Atomic detection poll; the detection callback below runs lock-free.
        I2CBusGuard busGuard;
        foundCardUpdate = this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, cardDetectedUid, &cardDetectedUidLength, NFC::detectionPollTimeoutMs);
    }

    if (foundCardUpdate)
    {
        this->foundCard = true;
        this->foundCardTimeMs = millis();
        this->logger.debug("Card detected");

        if (this->cardDetectionCallback != nullptr)
        {
            this->cardDetectionCallback(cardDetectedUid, cardDetectedUidLength);
        }
    }
}

bool NFC::waitForCard(uint32_t timeoutMs)
{
    uint8_t uid[] = {0, 0, 0, 0, 0, 0, 0}; // Buffer to store the returned UID
    uint8_t uidLength;                     // Length of the UID (4 or 7 bytes depending on ISO14443A
                                           // card type)

    LockGuard guard(*this);
    if (this->suspended) return false;
    I2CBusGuard busGuard;

    // Wait for an NTAG242 card.  When one is found 'uid' will be populated with
    // the UID, and uidLength will indicate the size of the UUID (normally 7)
    uint8_t uidDetected = this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, timeoutMs);

    if (!uidDetected)
    {
        this->logger.error("No tag detected within timeout");
        return false;
    }

    this->logger.info("Tag detected");
    this->pn532.PrintHex(uid, uidLength);
    return true;
}

void NFC::checkHardware(bool logHardwareInfo)
{
    uint32_t now = millis();
    if (now - this->lastHardwareCheckMs < NFC::hardwareCheckIntervalMs)
    {
        return;
    }
    this->lastHardwareCheckMs = now;

    uint32_t versiondata = 0;
    {
        I2CBusGuard busGuard;
        versiondata = this->pn532.getFirmwareVersion();
    }
    if (!versiondata)
    {
        this->logger.error("Didn't find PN53x board");
        while (1)
        {
            this->logger.error("PN53x board not found, restarting in 5 seconds");
            delay(5000);
            esp_restart();
        }
    }

    if (!logHardwareInfo)
    {
        return;
    }

    // Got ok data, print it out!
    this->logger.info("Found chip PN53x");
    this->logger.info((std::to_string((versiondata >> 24) & 0xFF) + " HEX").c_str());
    this->logger.info(("Firmware ver. " + std::to_string((versiondata >> 16) & 0xFF) + "." + std::to_string((versiondata >> 8) & 0xFF)).c_str());
}
