#include "rfid.hpp"
#include <functional>
#include "platform.hpp"
#include "esp_system.h"
#include <cstring>
#include <string>

void NFC::detectCardType()
{
    // GetVersion (native 0x60, ISO7816-wrapped) answers unauthenticated on
    // both chip families and reports the hardware type. Cards that do not
    // speak wrapped native commands leave garbage/zeroes in the version info,
    // which fails the NXP vendor check below and lands on UNKNOWN.
    memset(&this->pn532.ntag424_VersionInfo, 0, sizeof(this->pn532.ntag424_VersionInfo));
    this->pn532.ntag424_GetVersion();

    if (this->pn532.ntag424_VersionInfo.VendorID != 0x04)
    {
        this->detectedCardType = CARD_TYPE_UNKNOWN;
        this->logger.debug("Card type: unknown (no NXP GetVersion response)");
        return;
    }

    switch (this->pn532.ntag424_VersionInfo.HWType)
    {
    case NTAG424_RESPONE_GETVERSION_HWTYPE_NTAG424:
        this->detectedCardType = CARD_TYPE_NTAG424;
        this->logger.debug("Card type: NTAG424");
        break;

    case NTAG424_RESPONE_GETVERSION_HWTYPE_DESFIRE:
        this->detectedCardType = CARD_TYPE_DESFIRE;
        this->logger.debugf("Card type: MIFARE DESFire (HW version %02X.%02X)",
                            this->pn532.ntag424_VersionInfo.HWMajorVersion,
                            this->pn532.ntag424_VersionInfo.HWMinorVersion);
        if (this->pn532.ntag424_VersionInfo.HWMajorVersion < DESFIRE_HWMAJOR_EV2)
        {
            // EV1 lacks AuthenticateEV2First (0x71); authentication and
            // enrollment will fail. Surface why instead of failing silently.
            this->logger.error("DESFire EV1 is not supported (requires EV2 or EV3)");
        }
        break;

    default:
        this->detectedCardType = CARD_TYPE_UNKNOWN;
        this->logger.debugf("Card type: unknown (HWType 0x%02X)",
                            this->pn532.ntag424_VersionInfo.HWType);
        break;
    }
}

void NFC::loop()
{
    LockGuard guard(*this);
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
        // so a card parked on the reader doesn't hold the shared I2C bus with a
        // full AES handshake on every loop pass (PERFORMANCE_ANALYSIS.md M2).
        uint32_t now = millis();
        if (now - this->lastPresenceCheckMs < NFC::presenceCheckIntervalMs)
        {
            // card still present, wait till removed
            return;
        }
        this->lastPresenceCheckMs = now;

        // just try to comminucate with card in any way to check if it is still present
        bool authSuccess = false;
        {
            // Keep the full AES handshake atomic on the shared bus; the removal
            // callback below must run WITHOUT the bus lock held (leaf-lock rule).
            I2CBusGuard busGuard;
            if (this->detectedCardType == CARD_TYPE_DESFIRE)
            {
                // Key-independent presence probe: selecting the PICC master
                // application answers regardless of the key configuration.
                authSuccess = this->pn532.desfire_SelectApplication(NFC::DESFIRE_AID_MASTER);
            }
            else
            {
                authSuccess = this->pn532.ntag424_Authenticate(NFC::FACTORY_KEY, 0, 0x71);
            }
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
        if (foundCardUpdate)
        {
            // Classify the card (NTAG424 vs. DESFire) while we still hold the
            // bus; the routing of all later card operations depends on it.
            this->detectCardType();
        }
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
