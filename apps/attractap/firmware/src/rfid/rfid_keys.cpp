#include "rfid.hpp"
#include <functional>
#include "platform.hpp"
#include "esp_system.h"
#include <cstring>
#include <string>

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

bool NFC::getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo)
{
    this->logger.info("getAvailableKeyNo started");

    LockGuard guard(*this);

    // The card was just selected by handleCardDetection's readPassiveTargetID.
    // Re-running readPassiveTargetID here would fire a second back-to-back
    // InListPassiveTarget on the still-selected card, which the PN532 fails to
    // re-enumerate — leaving the reader looking dead during enrollment
    // (ATT-503: no beep, no screen change). Mirror the proven tap flow
    // (processCardAuthenticationData), which authenticates the already-selected
    // card directly without re-reading it. Reuse the UID captured at detection.
    if (!this->foundCard)
    {
        this->logger.error("getAvailableKeyNo failed, no detected card");
        return false;
    }

    memcpy(uid, this->cardDetectedUid, this->cardDetectedUidLength);
    *uidLength = this->cardDetectedUidLength;

    this->logger.debug("getAvailableKeyNo, using already-detected card");

    if (this->detectedCardType == CARD_TYPE_DESFIRE)
    {
        // Enrollment entry point: make sure the Attraccess application exists
        // before choosing a data key slot (factory cards get it created here).
        I2CBusGuard busGuard;
        if (!this->desfireSelectAttraccessApp(true))
        {
            this->logger.error("getAvailableKeyNo failed, DESFire application unavailable");
            return false;
        }

        // Key versions are public metadata for the selected DESFire
        // application. Query them before opening an EV2 secure session; plain
        // direct commands sent after AuthenticateEV2First can be rejected by
        // the PICC/session state.
        for (uint8_t i = 1; i <= 5; i++)
        {
            uint8_t keyVersion = 0xFF;
            if (!this->pn532.desfire_GetKeyVersion(i, &keyVersion))
            {
                this->logger.errorf("getAvailableKeyNo failed, DESFire key %d version unavailable", i);
                return false;
            }

            this->logger.debugf("getAvailableKeyNo, DESFire key %d version 0x%02X", i, keyVersion);
            if (keyVersion == INfc::CARD_KEY_VERSION_FREE)
            {
                if (!this->pn532.ntag424_AuthenticateEV2First(NFC::FACTORY_KEY, 0, 0x71))
                {
                    this->logger.error("getAvailableKeyNo failed, DESFire app master key is not factory");
                    return false;
                }

                *keyNo = i;
                this->logger.infof("getAvailableKeyNo, DESFire using key %d", i);
                return true;
            }
        }

        this->logger.error("getAvailableKeyNo failed, no free DESFire key found");
        return false;
    }

    // check key 1 to 5, the first one that we can authenticate using factory key is an available key
    for (uint8_t i = 1; i <= 5; i++)
    {
        bool authenticateSuccess = this->authenticate(i, NFC::FACTORY_KEY);
        if (authenticateSuccess)
        {
            this->logger.debugf("getAvailableKeyNo, key %d authenticated", i);
            *keyNo = i;
            return true;
        }

        this->logger.debugf("getAvailableKeyNo, key %d not authenticated", i);
    }

    this->logger.error("getAvailableKeyNo failed, no available key found");
    return false;
}
