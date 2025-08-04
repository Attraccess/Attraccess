#include "nfc.hpp"

void NFC::task_function(void *pvParameters)
{
    NFC *nfc = (NFC *)pvParameters;

    if (!nfc)
    {
        Serial.println("[NFC][task_function] Error: Invalid NFC instance");
        vTaskDelete(NULL);
        return;
    }

    while (true)
    {
        nfc->loop();
        vTaskDelay(1000 / portTICK_PERIOD_MS);
    }
}

void NFC::setup()
{
    this->pn532.begin();

    xTaskCreate(task_function, "NFC", 8192, this, 10, &task_handle);
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
        Serial.println("[NFC][loop] Detected card with UID: ");
        Serial.println(dicoveredUuid);

        if (this->onNfcCardDetected)
        {
            this->onNfcCardDetected(dicoveredUuid);
        }

        Serial.println();
    }
}

bool NFC::detectNfcModule()
{
    uint32_t versiondata = this->pn532.getFirmwareVersion();

    if (!versiondata)
    {
        this->nfc_is_detected = false;
        Serial.println("[NFC][detectNfcModule] Error: Didn't find PN53x board. Check wiring.");
        return false;
    }

    this->nfc_is_detected = true;

    // Print board info
    Serial.print("[NFC][detectNfcModule] Found PN53x board version: ");
    Serial.print((versiondata >> 24) & 0xFF, HEX);
    Serial.print('.');
    Serial.print((versiondata >> 16) & 0xFF, DEC);
    Serial.print('.');
    Serial.println((versiondata >> 8) & 0xFF, DEC);

    return true;
}

bool NFC::configureNfcModule()
{
    bool success = this->pn532.SAMConfig();

    if (!success)
    {
        Serial.println("[NFC][configureNfcModule] Error: Failed to configure NFC module");
        this->nfc_is_ready = false;
        return false;
    }

    Serial.println("[NFC][configureNfcModule] NFC module configured successfully");
    this->nfc_is_ready = true;

    return true;
}

bool NFC::waitForNfcCard(const uint32_t timeoutMs)
{
    Serial.println("[NFC][waitForNfcCard] version without expectedUuid");

    char uid[16];      // Buffer for UID
    uint8_t uidLength; // Length of UID

    // Clear the buffer to prevent memory issues
    memset(uid, 0, sizeof(uid));
    uidLength = 0;

    return this->waitForNfcCard(uid, &uidLength, timeoutMs);
}

bool NFC::waitForNfcCard(char *detectedUid, uint8_t *detectedUidLength, const uint32_t timeoutMs)
{
    Serial.println("[NFC][waitForNfcCard] version with detectedUid and detectedUidLength");

    // Add parameter validation
    if (!detectedUid || !detectedUidLength)
    {
        Serial.println("[NFC][waitForNfcCard] Error: Invalid parameters");
        return false;
    }

    char dicoveredUuid[16];       // Buffer for UID
    uint8_t discoveredUuidLength; // Length of UID

    // Clear buffers to prevent memory issues
    memset(dicoveredUuid, 0, sizeof(dicoveredUuid));
    discoveredUuidLength = 0;

    uint32_t startTime = millis();

    Serial.println(); // Start with a newline
    Serial.println("[NFC][waitForNfcCard] Waiting for NTAG424 card");

    while (millis() - startTime < timeoutMs)
    {
        // Wait for an ISO14443A card
        // readPassiveTargetID will return 1 if a card is found
        // It will populate uid and uidLength
        if (this->discoverNfcCard(dicoveredUuid, &discoveredUuidLength, 1000))
        {
            Serial.println();
            Serial.println("[NFC][waitForNfcCard] Card is NTAG424.");

            // Safely copy the discovered UID to the output parameters
            if (discoveredUuidLength <= 16)
            {
                memcpy(detectedUid, dicoveredUuid, discoveredUuidLength);
                *detectedUidLength = discoveredUuidLength;
            }
            else
            {
                Serial.println("[NFC][waitForNfcCard] Error: UID too long");
                return false;
            }

            return true;
        }

        Serial.print(".");
        delay(100); // Small delay before next check
    }

    Serial.println();
    Serial.println("[NFC][waitForNfcCard] Timeout waiting for NFC card");
    return false;
}

bool NFC::waitForNfcCardWithUID(const char *expectedUuid, const uint32_t timeoutMs)
{
    Serial.println("[NFC][waitForNfcCard] version with expectedUuid");

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
            Serial.println("[NFC][waitForNfcCard] NTAG424 card detected. SUCCESS!");
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
            Serial.println("[NFC][waitForNfcCard] UUID matches. SUCCESS!");
            return true;
        }
    }

    Serial.println("[NFC][waitForNfcCard] Timeout waiting for NFC card");
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

        Serial.println("[NFC][authenticate] Failed to authenticate with NFC card, retrying in .5sec");
        delay(500);
    }

    if (!success)
    {
        Serial.println("[NFC][authenticate] Failed to authenticate with NFC card");
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
        Serial.println("[NFC][changeKey] Error: Invalid parameters");
        return false;
    }

    // 1. Authenticate with master key (0)
    if (!this->authenticate(NFC::AUTH_KEY_NO, authKey, false))
    {
        Serial.println("[NFC][changeKey] Failed to authenticate with NFC card");
        return false;
    }

    // 2. Change key
    if (!this->pn532.ntag424_ChangeKey(oldKey, newKey, keyNumber))
    {
        Serial.println("[NFC][changeKey] Failed to change key");
        return false;
    }

    Serial.println("[NFC][changeKey] Validating new key...");
    if (!this->authenticate(keyNumber, newKey, true))
    {
        Serial.println("[NFC][changeKey] Failed to authenticate with NFC card after changing key");
        return false;
    }

    Serial.println("[NFC][changeKey] Key change operation completed successfully");
    return true;
}

void NFC::waitForCardRemoval()
{
    uint8_t uid[7];
    uint8_t uidLength;

    Serial.println("[NFC][waitForCardRemoval] Please remove the card.");
    while (this->pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50))
    {
        Serial.print(".");
    }
    Serial.println();
    Serial.println("[NFC] Card removed.");
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

void NFC::setOnNfcCardDetected(void (*callback)(char *uuid))
{
    this->onNfcCardDetected = callback;
}

void NFC::enableLoopCardDetection()
{
    this->loop_card_detection_is_enabled = true;
}

void NFC::disableLoopCardDetection()
{
    this->loop_card_detection_is_enabled = false;
}

bool NFC::isLoopCardDetectionEnabled()
{
    return this->loop_card_detection_is_enabled;
}