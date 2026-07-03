#include "nfc.hpp"
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
            if (keyVersion == NFC::CARD_KEY_VERSION_FREE)
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
