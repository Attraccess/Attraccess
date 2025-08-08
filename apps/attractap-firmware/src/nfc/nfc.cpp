#include "nfc.hpp"

void NFC::task_function(void *pvParameters)
{
    NFC *nfc = (NFC *)pvParameters;

    if (!nfc)
    {
        nfc->logger.error("task_function Error: Invalid NFC instance");
        vTaskDelete(NULL);
        ESP.restart();
        return;
    }

    const int LOOP_DELAY_MS = 50; // 50ms delay for NFC operations

    while (true)
    {
        nfc->loop();
        vTaskDelay(LOOP_DELAY_MS / portTICK_PERIOD_MS);
    }
}

void NFC::setup()
{
    this->pn532.begin();

    xTaskCreate(NFC::task_function, "NFC", 8192, this, TASK_PRIORITY_NFC, NULL);
}

void NFC::loop()
{
    if (!this->nfc_is_detected && !this->detectNfcModule())
    {
        return;
    }

    if (!this->nfc_is_ready && !this->configureNfcModule())
    {
        return;
    }

    this->updateStateFromAppState();
    this->processNfcCommands();

    if (!this->loop_card_detection_is_enabled)
    {
        return;
    }

    char dicoveredUuid[16];       // Buffer for UID
    uint8_t discoveredUuidLength; // Length of UID

    // Clear the buffer to prevent memory issues
    memset(dicoveredUuid, 0, sizeof(dicoveredUuid));
    discoveredUuidLength = 0;

    if (this->discoverNfcCard(dicoveredUuid, &discoveredUuidLength, 1000))
    {
        String uidHex = "";
        for (uint8_t i = 0; i < discoveredUuidLength; i++)
        {
            if (dicoveredUuid[i] < 0x10)
            {
                uidHex += "0";
            }
            uidHex += String(dicoveredUuid[i], HEX);
        }
        logger.infof("loop Detected card with UID: %s", uidHex.c_str());

        State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_DETECTED, uidHex);
    }
}

void NFC::processNfcCommands()
{
    State::NfcCommand command;
    if (!State::getNextNfcCommand(command))
    {
        return;
    }

    switch (command.type)
    {
    case State::NfcCommandType::NFC_COMMAND_TYPE_CHANGE_KEY:
    {
        String payload(command.payload);

        // Parse space-delimited values more efficiently
        int firstSpace = payload.indexOf(' ');
        int secondSpace = payload.indexOf(' ', firstSpace + 1);
        int thirdSpace = payload.indexOf(' ', secondSpace + 1);

        String keyNumberStr = payload.substring(0, firstSpace);
        String authKeyHex = payload.substring(firstSpace + 1, secondSpace);
        String oldKeyHex = payload.substring(secondSpace + 1, thirdSpace);
        String newKeyHex = payload.substring(thirdSpace + 1);

        uint8_t keyNumber = keyNumberStr.toInt();
        uint8_t authKey[16];
        uint8_t oldKey[16];
        uint8_t newKey[16];

        this->hexStringToBytes(authKeyHex, authKey, 16);
        this->hexStringToBytes(oldKeyHex, oldKey, 16);
        this->hexStringToBytes(newKeyHex, newKey, 16);

        bool success = this->changeKey(keyNumber, authKey, oldKey, newKey);
        if (success)
        {
            State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_CHANGE_KEY_SUCCESS, command.payload);
        }
        else
        {
            State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_CHANGE_KEY_FAILED, command.payload);
        }
        break;
    }

    case State::NfcCommandType::NFC_COMMAND_TYPE_AUTHENTICATE:
    {
        String payload(command.payload);

        // Parse space-delimited values more efficiently
        int firstSpace = payload.indexOf(' ');
        String keyNumberStr = payload.substring(0, firstSpace);
        String authKeyHex = payload.substring(firstSpace + 1);

        uint8_t keyNumber = keyNumberStr.toInt();
        uint8_t authKey[16];

        this->hexStringToBytes(authKeyHex, authKey, 16);

        bool success = this->authenticate(keyNumber, authKey, true);
        if (success)
        {
            State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_AUTHENTICATE_SUCCESS, command.payload);
        }
        else
        {
            State::pushEventToApi(State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_AUTHENTICATE_FAILED, command.payload);
        }

        break;
    }
    }
}

void NFC::hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength)
{
    // Initialize array with zeros
    memset(byteArray, 0, byteArrayLength);

    // Process the hex string - 2 characters per byte
    for (size_t i = 0; i < byteArrayLength && i * 2 + 1 < hexString.length(); i++)
    {
        String byteHex = hexString.substring(i * 2, i * 2 + 2);
        byteArray[i] = strtol(byteHex.c_str(), NULL, 16);
    }
}

void NFC::updateStateFromAppState()
{
    uint32_t lastAppStateChangeTime = State::getLastStateChangeTime();
    if (this->lastKnownAppStateChangeTime >= lastAppStateChangeTime)
    {
        return;
    }

    this->loop_card_detection_is_enabled = State::getApiEventData().state == State::ApiEventState::API_EVENT_STATE_WAIT_FOR_NFC_TAP;
}

bool NFC::detectNfcModule()
{
    uint32_t versiondata = this->pn532.getFirmwareVersion();

    if (!versiondata)
    {
        this->nfc_is_detected = false;
        logger.error("detectNfcModule Error: Didn't find PN53x board. Check wiring.");
        return false;
    }

    this->nfc_is_detected = true;

    // Print board info
    String versionStr = "detectNfcModule Found PN53x board version: " + String((versiondata >> 24) & 0xFF, HEX) + "." + String((versiondata >> 16) & 0xFF, DEC) + "." + String((versiondata >> 8) & 0xFF, DEC);
    logger.info(versionStr.c_str());

    return true;
}

bool NFC::configureNfcModule()
{
    bool success = this->pn532.SAMConfig();

    if (!success)
    {
        logger.error("configureNfcModule Error: Failed to configure NFC module");
        this->nfc_is_ready = false;
        return false;
    }

    logger.info("configureNfcModule NFC module configured successfully");
    this->nfc_is_ready = true;

    return true;
}

bool NFC::waitForNfcCard(const uint32_t timeoutMs)
{
    logger.debug("waitForNfcCard version without expectedUuid");

    char uid[16];      // Buffer for UID
    uint8_t uidLength; // Length of UID

    // Clear the buffer to prevent memory issues
    memset(uid, 0, sizeof(uid));
    uidLength = 0;

    return this->waitForNfcCard(uid, &uidLength, timeoutMs);
}

bool NFC::waitForNfcCard(char *detectedUid, uint8_t *detectedUidLength, const uint32_t timeoutMs)
{
    logger.debug("waitForNfcCard version with detectedUid and detectedUidLength");

    // Add parameter validation
    if (!detectedUid || !detectedUidLength)
    {
        logger.error("waitForNfcCard Error: Invalid parameters");
        return false;
    }

    char dicoveredUuid[16];       // Buffer for UID
    uint8_t discoveredUuidLength; // Length of UID

    // Clear buffers to prevent memory issues
    memset(dicoveredUuid, 0, sizeof(dicoveredUuid));
    discoveredUuidLength = 0;

    uint32_t startTime = millis();

    logger.info("waitForNfcCard Waiting for NTAG424 card");

    while (millis() - startTime < timeoutMs)
    {
        // Wait for an ISO14443A card
        // readPassiveTargetID will return 1 if a card is found
        // It will populate uid and uidLength
        if (this->discoverNfcCard(dicoveredUuid, &discoveredUuidLength, 1000))
        {

            logger.info("waitForNfcCard Card is NTAG424.");

            // Safely copy the discovered UID to the output parameters
            if (discoveredUuidLength <= 16)
            {
                memcpy(detectedUid, dicoveredUuid, discoveredUuidLength);
                *detectedUidLength = discoveredUuidLength;
            }
            else
            {
                logger.error("waitForNfcCard Error: UID too long");
                return false;
            }

            return true;
        }

        // Wait indicator removed for logger
        delay(100); // Small delay before next check
    }

    logger.info("waitForNfcCard Timeout waiting for NFC card");
    return false;
}

bool NFC::waitForNfcCardWithUID(const char *expectedUuid, const uint32_t timeoutMs)
{
    logger.debug("waitForNfcCard version with expectedUuid");

    uint32_t startTime = millis();

    while (millis() - startTime < timeoutMs)
    {
        char dicoveredUuid[16];       // Buffer for UID
        uint8_t discoveredUuidLength; // Length of UID

        // Clear the buffer to prevent memory issues
        memset(dicoveredUuid, 0, sizeof(dicoveredUuid));
        discoveredUuidLength = 0;

        // Use discoverNfcCard directly instead of waitForNfcCard to avoid nested loops
        if (!this->discoverNfcCard(dicoveredUuid, &discoveredUuidLength, 1000))
        {
            delay(100); // Small delay before next check
            continue;
        }

        if (expectedUuid == nullptr)
        {
            logger.info("waitForNfcCard NTAG424 card detected. SUCCESS!");
            return true;
        }

        // compare UUIds
        String discovoredUUIDString = "";
        for (int i = 0; i < discoveredUuidLength; i++)
        {
            if (dicoveredUuid[i] < 0x10)
                discovoredUUIDString += "0";
            discovoredUUIDString += String(dicoveredUuid[i], HEX);
        }

        if (discovoredUUIDString.equalsIgnoreCase(String(expectedUuid)))
        {
            logger.info("waitForNfcCard UUID matches. SUCCESS!");
            return true;
        }
    }

    logger.info("waitForNfcCard Timeout waiting for NFC card");
    return false;
}

bool NFC::authenticate(uint8_t keyNumber, uint8_t *key, bool waitForRemovalAtEnd)
{
    // retry 3 times
    bool success = false;
    for (int i = 0; i < 3; i++)
    {

        if (this->pn532.ntag424_Authenticate(key, keyNumber, NFC::AUTH_CMD))
        {
            success = true;
            break;
        }

        logger.debug("authenticate Failed to authenticate with NFC card, retrying in .5sec");
        delay(500);
    }

    if (!success)
    {
        logger.error("authenticate Failed to authenticate with NFC card");
        return false;
    }

    if (waitForRemovalAtEnd)
    {
        this->waitForCardRemoval();
    }

    return true;
}

bool NFC::changeKey(const uint8_t keyNumber, uint8_t authKey[16], uint8_t *oldKey, uint8_t *newKey)
{
    // Add memory protection and error handling
    if (!authKey || !oldKey || !newKey)
    {
        logger.error("changeKey Error: Invalid parameters");
        return false;
    }

    // 1. Authenticate with master key (0)
    if (!this->authenticate(NFC::AUTH_KEY_NO, authKey, false))
    {
        logger.error("changeKey Failed to authenticate with NFC card");
        return false;
    }

    // 2. Change key
    if (!this->pn532.ntag424_ChangeKey(oldKey, newKey, keyNumber))
    {
        logger.error("changeKey Failed to change key");
        return false;
    }

    logger.debug("changeKey Validating new key...");
    if (!this->authenticate(keyNumber, newKey, true))
    {
        logger.error("changeKey Failed to authenticate with NFC card after changing key");
        return false;
    }

    logger.info("changeKey Key change operation completed successfully");
    return true;
}

void NFC::waitForCardRemoval()
{
    uint8_t uid[7];
    uint8_t uidLength;

    logger.info("waitForCardRemoval Please remove the card.");
    while (this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50))
    {
        // Wait indicator removed for logger
    }

    logger.info("Card removed.");
}

bool NFC::discoverNfcCard(char *dicoveredUuid, uint8_t *discoveredUuidLength, const uint32_t timeoutMs)
{
    uint8_t uid[7];
    uint8_t uidLength;

    if (!this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, timeoutMs))
    {
        return false;
    }

    if (!this->pn532.ntag424_isNTAG424())
    {
        return false;
    }

    this->uintArrayToCharArray(uid, uidLength, dicoveredUuid);
    *discoveredUuidLength = uidLength;

    return true;
}

void NFC::uintArrayToCharArray(const uint8_t *uuid, const uint8_t length, char *charArray)
{
    for (int i = 0; i < length; i++)
    {
        charArray[i] = uuid[i];
    }
    // Null terminate the string
    charArray[length] = '\0';
}
