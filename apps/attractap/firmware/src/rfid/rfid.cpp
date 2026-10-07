#include "rfid.hpp"
#include <functional>
#include "platform.hpp"
#include "esp_system.h"
#include <cstring>
#include <string>

uint8_t NFC::FACTORY_KEY[16] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

// AID 0xACCE55 ("access"), transmitted LSB first per DESFire native protocol.
const uint8_t NFC::DESFIRE_AID_ATTRACCESS[3] = {0x55, 0xCE, 0xAC};
const uint8_t NFC::DESFIRE_AID_MASTER[3] = {0x00, 0x00, 0x00};

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

    this->logger.infof("Factory key is: %s", hexToString(NFC::FACTORY_KEY, 16).c_str());
}

void NFC::enableCardDetection()
{
    this->logger.info("Enabling card detection");
    {
        LockGuard guard(*this);
        this->checkHardware();
    }
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

void NFC::resetCardPresence()
{
    this->foundCard = false;
    this->detectedCardType = CARD_TYPE_UNKNOWN;
}

NFC::CardType NFC::getDetectedCardType()
{
    return this->detectedCardType;
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
