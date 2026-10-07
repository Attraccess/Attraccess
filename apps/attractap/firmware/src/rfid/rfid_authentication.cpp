#include "rfid.hpp"
#include <functional>
#include "platform.hpp"
#include "esp_system.h"
#include <cstring>
#include <string>

bool NFC::desfireSelectAttraccessApp(bool createIfMissing)
{
    if (this->pn532.desfire_SelectApplication(NFC::DESFIRE_AID_ATTRACCESS))
    {
        return true;
    }

    if (!createIfMissing)
    {
        this->logger.error("DESFire Attraccess application not selectable");
        return false;
    }

    // Factory cards: the application does not exist yet. The default PICC
    // master key settings (0x0F) allow CreateApplication without prior
    // authentication; cards with hardened PICC settings fail here.
    this->logger.info("DESFire Attraccess application missing, creating it");
    if (!this->pn532.desfire_CreateApplication(NFC::DESFIRE_AID_ATTRACCESS,
                                               NFC::DESFIRE_APP_KEY_SETTINGS_1,
                                               NFC::DESFIRE_APP_KEY_SETTINGS_2))
    {
        this->logger.error("DESFire CreateApplication failed (PICC may require master key authentication)");
        return false;
    }

    return this->pn532.desfire_SelectApplication(NFC::DESFIRE_AID_ATTRACCESS);
}

bool NFC::authenticateInternal(uint8_t keyNumber, uint8_t *key)
{
    if (this->detectedCardType == CARD_TYPE_DESFIRE)
    {
        // DESFire EV2/EV3: same EV2First handshake as the NTAG424, but inside
        // the Attraccess application instead of the NTAG NDEF application.
        if (!this->desfireSelectAttraccessApp(false))
        {
            return false;
        }
        return this->pn532.ntag424_AuthenticateEV2First(key, keyNumber, 0x71);
    }

    // NTAG424 and unknown cards: proven legacy path (ISOSelectFile + EV2First).
    return this->pn532.ntag424_Authenticate(key, keyNumber, 0x71);
}

bool NFC::changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey, uint8_t *newKey, uint8_t keyVersion)
{
    this->logger.info("changeKey started");

    LockGuard guard(*this);
    // The whole key-change is one multi-command card conversation — keep it
    // atomic on the shared bus (no callbacks fire inside).
    I2CBusGuard busGuard;

    // Step 1: Authenticate with master key
    bool authenticateOldKeySuccess = this->authenticateInternal(0, masterKey);
    if (!authenticateOldKeySuccess)
    {
        this->logger.error("changeKey failed, authenticate old key failed");
        return false;
    }

    // Step 2: Change key (ChangeKey 0xC4 shares the EV2 secure messaging
    // between NTAG424 and DESFire EV2/EV3)
    bool changeKeySuccess = this->pn532.ntag424_ChangeKey(oldKey, newKey, keyNumber, keyVersion);
    if (!changeKeySuccess)
    {
        this->logger.error("changeKey failed, change key procedure failed");
        return false;
    }

    // Step 3: Validate by authenticating with new key
    bool authenticateNewKeySuccess = this->authenticateInternal(keyNumber, newKey);
    if (!authenticateNewKeySuccess)
    {
        this->logger.error("changeKey failed, authenticate new key failed");
        return false;
    }

    this->logger.info("changeKey successful");
    return true;
}

bool NFC::authenticate(uint8_t keyNumber, uint8_t *key)
{
    this->logger.info("authenticate started");

    LockGuard guard(*this);
    I2CBusGuard busGuard;

    // Step 1: Authenticate with key
    bool authenticateSuccess = this->authenticateInternal(keyNumber, key);
    if (!authenticateSuccess)
    {
        this->logger.error("authenticate failed, authenticate procedure failed");
        return false;
    }

    this->logger.info("authenticate successful");
    return true;
}
