#include "nfc.hpp"

uint8_t NFC::FACTORY_KEY[16] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

void NFC::setup()
{
    this->logger.info("Initializing PN532");
    this->pn532.begin();
    // Adafruit BusIO's I2CDevice::begin() (called inside pn532.begin()) re-invokes
    // Wire.begin(), which can reset the bus clock to the 100 kHz default. Restore
    // 400 kHz Fast Mode (same pitfall as the SensorLib restore in rgb_gt911_driver).
    Wire.setClock(ATTRACTAP_I2C_CLOCK_HZ);

    this->logger.info("Checking hardware");
    this->checkHardware(true);

    // configure board to read RFID tags
    bool samConfigSuccess = this->pn532.SAMConfig();
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
    this->checkHardware();
    /*pinMode(PIN_PN532_IRQ, INPUT_PULLUP);
    auto irqHandler = [this]
    {
        this->onCardDetectedInterruptHandler();
    };
    attachInterrupt(digitalPinToInterrupt(PIN_PN532_IRQ), irqHandler, FALLING);
    this->pn532.startPassiveTargetIDDetection(PN532_MIFARE_ISO14443A);
    this->timeOfCardDetectionEnabledMs = millis();*/
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
}

void NFC::loop()
{
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
        bool authSuccess = this->pn532.ntag424_Authenticate(NFC::FACTORY_KEY, 0, 0x71);
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

    bool foundCardUpdate = this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, cardDetectedUid, &cardDetectedUidLength, 100);

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

bool NFC::changeKey(uint8_t keyNumber, uint8_t *masterKey, uint8_t *oldKey, uint8_t *newKey)
{
    this->logger.info("changeKey started");

    // Step 1: Authenticate with master key
    bool authenticateOldKeySuccess = this->pn532.ntag424_Authenticate(masterKey, 0, 0x71);
    if (!authenticateOldKeySuccess)
    {
        this->logger.error("changeKey failed, authenticate old key failed");
        return false;
    }

    // Step 2: Change key
    bool changeKeySuccess = this->pn532.ntag424_ChangeKey(oldKey, newKey, keyNumber);
    if (!changeKeySuccess)
    {
        this->logger.error("changeKey failed, change key procedure failed");
        return false;
    }

    // Step 3: Validate by authenticating with new key
    bool authenticateNewKeySuccess = this->pn532.ntag424_Authenticate(newKey, keyNumber, 0x71);
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

    // Step 1: Authenticate with key
    bool authenticateSuccess = this->pn532.ntag424_Authenticate(key, keyNumber, 0x71);
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

    uint32_t versiondata = this->pn532.getFirmwareVersion();
    if (!versiondata)
    {
        this->logger.error("Didn't find PN53x board");
        while (1)
        {
            this->logger.error("PN53x board not found, restarting in 5 seconds");
            delay(5000);
            ESP.restart();
        }
    }

    if (!logHardwareInfo)
    {
        return;
    }

    // Got ok data, print it out!
    this->logger.info("Found chip PN53x");
    this->logger.info((String((versiondata >> 24) & 0xFF) + " HEX").c_str());
    this->logger.info(("Firmware ver. " + String((versiondata >> 16) & 0xFF) + "." + String((versiondata >> 8) & 0xFF)).c_str());
}

bool NFC::getAvailableKeyNo(uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo)
{
    this->logger.info("getAvailableKeyNo started");

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