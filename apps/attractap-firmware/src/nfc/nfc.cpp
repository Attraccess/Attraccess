#include "nfc.hpp"

uint8_t NFC::FACTORY_KEY[16] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
uint8_t NFC::NEW_KEY[16] = {0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01};

void NFC::setup()
{
    this->logger.info("Initializing PN532");
    this->pn532.begin();

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

    uint8_t cardDetectedUid[7] = {0};
    uint8_t cardDetectedUidLength = 0;

    bool foundCard = this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, cardDetectedUid, &cardDetectedUidLength, 50);
    if (!foundCard)
    {

        return;
    }

    this->disableCardDetection();

    if (this->cardDetectionCallback == nullptr)
    {
        this->logger.error("Card detection callback is null");
        return;
    }

    this->logger.info("Calling card detection callback");
    this->cardDetectionCallback(cardDetectedUid, cardDetectedUidLength);
    this->logger.info("Card detection callback returned");
}

void NFC::demo()
{
    uint8_t uid[] = {0, 0, 0, 0, 0, 0, 0}; // Buffer to store the returned UID
    uint8_t uidLength;                     // Length of the UID (4 or 7 bytes depending on ISO14443A
                                           // card type)

    // Wait for an NTAG242 card.  When one is found 'uid' will be populated with
    // the UID, and uidLength will indicate the size of the UUID (normally 7)
    uint8_t uidDetected = this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 100);

    if (!uidDetected)
    {
        Serial.println("No tag detected");
        return;
    }

    // Display some basic information about the card
    Serial.println("Found a tag");
    Serial.print("  UID Length: ");
    Serial.print(uidLength, DEC);
    Serial.println(" bytes");
    Serial.print("  UID Value: ");
    this->pn532.PrintHex(uid, uidLength);
    Serial.println("");

    bool isNTAG424 = ((uidLength == 7) || (uidLength == 4)) && (this->pn532.ntag424_isNTAG424());

    if (!isNTAG424)
    {
        Serial.println("This doesn't seem to be an NTAG424 tag. (UUID length != 7 bytes and UUID length != 4)");
        return;
    }

    Serial.println("Found an NTAG424-tag");
    // select application
    // uint8_t filename[7] = {0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01};
    // this->pn532.ntag424_ISOSelectFileByDFN(filename);

    // Authenticate with default_key. Will only work if no keys are set.

    uint8_t keyno = 0;
    uint8_t authSuccess = this->pn532.ntag424_Authenticate(NFC::FACTORY_KEY, keyno, 0x71);
    if (authSuccess != 1)
    {
        Serial.println("Authentication (0) with factory key failed.");
        return;
    }
    Serial.println("Authentication (0) with factory key successful.");

    // uint8_t carduid[16];
    // uint8_t bytesread = this->pn532.ntag424_GetCardUID(carduid);
    // Serial.println("CardUId:");
    // this->pn532.PrintHexChar(carduid, bytesread);

    // the next few methods write to the picc and may ruin your tag so you
    // have to uncomment them on your on risk :-)

    bool authenticateDefaultKeySuccess = this->pn532.ntag424_Authenticate(NFC::FACTORY_KEY, 1, 0x71);
    if (!authenticateDefaultKeySuccess)
    {
        Serial.println("Authentication with default key failed.");
        return;
    }
    Serial.println("Authentication with default key successful.");

    // change key 1 - uncomment next line
    Serial.println("Changing key 1 to new key...");
    this->pn532.ntag424_Authenticate(NFC::FACTORY_KEY, keyno, 0x71);
    bool changeKeyToNewKeySuccess = this->pn532.ntag424_ChangeKey(NFC::FACTORY_KEY, NFC::NEW_KEY, 1);
    if (!changeKeyToNewKeySuccess)
    {
        Serial.println("Changing key 1 to new key failed.");
        return;
    }
    Serial.println("Changing key 1 to new key successful.");

    bool authenticateNewKeySuccess = this->pn532.ntag424_Authenticate(NFC::NEW_KEY, 1, 0x71);
    if (!authenticateNewKeySuccess)
    {
        Serial.println("Authentication with new key failed.");
        return;
    }
    Serial.println("Authentication with new key successful.");

    // change key 1 back to default-key
    Serial.println("Changing key 1 back to default-key...");
    this->pn532.ntag424_Authenticate(NFC::FACTORY_KEY, keyno, 0x71);
    bool changeKeyToDefaultKeySuccess = this->pn532.ntag424_ChangeKey(NFC::NEW_KEY, NFC::FACTORY_KEY, 1);
    if (!changeKeyToDefaultKeySuccess)
    {
        Serial.println("Changing key 1 back to default-key failed.");
        return;
    }
    Serial.println("Changing key 1 back to default-key successful.");

    delay(3000);
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

    bool foundCard = this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, uidLength, 30000);
    if (!foundCard)
    {
        this->logger.error("getAvailableKeyNo failed, no card detected");
        return false;
    }

    this->logger.debug("getAvailableKeyNo, card detected");

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