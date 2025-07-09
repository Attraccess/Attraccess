#include "nfc.hpp"
#include "api.hpp"

void NFC::setup()
{
    Serial.println("[NFC] Setup");
    this->nfc.begin();
    this->state = NFC_STATE_INIT;
    this->last_state_time = millis();
}

void NFC::enableCardChecking()
{
    this->is_card_checking_enabled = true;
}

void NFC::disableCardChecking()
{
    this->is_card_checking_enabled = false;
}

void NFC::loop()
{
    switch (this->state)
    {
    case NFC_STATE_INIT:
        handleInitState();
        break;
    case NFC_STATE_READY:
        handleReadyState();
        break;
    case NFC_STATE_SCANNING:
        handleScanningState();
        break;
    case NFC_STATE_AUTH_START:
    case NFC_STATE_AUTH_WAIT:
        handleAuthState();
        break;
    case NFC_STATE_WRITE_START:
    case NFC_STATE_WRITE_WAIT:
        handleWriteState();
        break;
    case NFC_STATE_CHANGE_KEY_START:
    case NFC_STATE_CHANGE_KEY_WAIT:
        handleChangeKeyState();
        break;
    default:
        break;
    }
}

void NFC::handleInitState()
{
    // Only check firmware version every 500ms to avoid hammering the bus
    if (millis() - this->last_state_time < 500)
    {
        return;
    }

    this->last_state_time = millis();
    uint32_t versiondata = nfc.getFirmwareVersion();

    if (versiondata)
    {
        // Print board info
        Serial.print("Found PN53x board version: ");
        Serial.print((versiondata >> 24) & 0xFF, HEX);
        Serial.print('.');
        Serial.print((versiondata >> 16) & 0xFF, DEC);
        Serial.print('.');
        Serial.println((versiondata >> 8) & 0xFF, DEC);

        // Configure the PN532 to read ISO14443A tags
        nfc.SAMConfig();

        // Move to ready state
        this->state = NFC_STATE_READY;
        this->last_state_time = millis();
    }
    else
    {
        Serial.println("Error: Didn't find PN53x board. Check wiring.");
    }
}

void NFC::handleReadyState()
{
    if (this->is_card_checking_enabled)
    {
        if (millis() - this->last_state_time >= 100)
        {
            this->state = NFC_STATE_SCANNING;
            this->scan_start_time = millis();
        }
    }
}

void NFC::handleScanningState()
{
    // Start the card detection process
    uint8_t uid[7];
    uint8_t uidLength;

    // Use a smaller timeout for each scan attempt (250ms)
    bool foundCard = this->nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 250);

    if (foundCard)
    {
        this->api->sendNFCTapped(uid, uidLength);
    }

    // Always return to ready state after a scan attempt
    this->state = NFC_STATE_READY;
    this->last_state_time = millis();
}

void NFC::handleAuthState()
{
    if (this->state == NFC_STATE_AUTH_START)
    {
        Serial.println("[NFC] Starting authentication for key " + String(this->auth_key_number));
        this->operation_success = this->nfc.ntag424_Authenticate(this->auth_key, this->auth_key_number, this->AUTH_CMD);

        // Authentication completes immediately, no wait state needed
        Serial.println(this->operation_success ? "[NFC] Authentication successful" : "[NFC] Authentication failed");

        // Notify callback if set
        if (this->auth_complete_callback != nullptr)
        {
            this->auth_complete_callback(this->operation_success);
        }

        // Return to ready state
        this->state = NFC_STATE_READY;
        this->last_state_time = millis();
    }
}

void NFC::handleWriteState()
{
    if (this->state == NFC_STATE_WRITE_START)
    {
        // First authenticate
        Serial.println("[NFC] Starting authentication for write operation");
        bool auth_success = this->nfc.ntag424_Authenticate(this->auth_key, this->auth_key_number, this->AUTH_CMD);

        if (!auth_success)
        {
            Serial.println("[NFC] Authentication for write failed");
            this->operation_success = false;

            // Notify callback if set
            if (this->write_complete_callback != nullptr)
            {
                this->write_complete_callback(false);
            }

            // Return to ready state
            this->state = NFC_STATE_READY;
            this->last_state_time = millis();
            return;
        }

        Serial.println("[NFC] Authentication for write successful");

        // Now perform the write
        uint8_t fileNumberForCustomData = 0x03;
        this->operation_success = this->nfc.ntag424_WriteData(this->write_data, fileNumberForCustomData,
                                                              0, this->write_data_length, this->auth_key_number);

        Serial.println(this->operation_success ? "[NFC] Write data successful" : "[NFC] Write data failed");

        // Notify callback if set
        if (this->write_complete_callback != nullptr)
        {
            this->write_complete_callback(this->operation_success);
        }

        // Return to ready state
        this->state = NFC_STATE_READY;
        this->last_state_time = millis();
    }
}

void NFC::handleChangeKeyState()
{
    if (this->state == NFC_STATE_CHANGE_KEY_START)
    {
        Serial.print("[NFC] Starting key change for key ");
        Serial.print(this->auth_key_number);
        Serial.print(" with auth key xxx");
        for (int i = 10; i < 16; i++)
        {
            Serial.print(this->auth_key[i], HEX);
        }
        Serial.print(" to new key xxx");
        for (int i = 10; i < 16; i++)
        {
            Serial.print(this->new_key[i], HEX);
        }
        Serial.println();

        // First authenticate
        Serial.println("[NFC] Authenticating key " + String(this->auth_key_number));
        bool auth_success = this->nfc.ntag424_Authenticate(this->auth_key, this->auth_key_number, this->AUTH_CMD);

        if (!auth_success)
        {
            Serial.println("[NFC] Authentication failed");
            this->operation_success = false;

            // Notify callback if set
            if (this->change_key_complete_callback != nullptr)
            {
                this->change_key_complete_callback(false);
            }

            // Return to ready state
            this->state = NFC_STATE_READY;
            this->last_state_time = millis();
            return;
        }

        Serial.println("[NFC] Authentication successful");
        Serial.println("[NFC] Changing key " + String(this->auth_key_number));

        // Now change the key
        this->operation_success = this->nfc.ntag424_ChangeKey(this->auth_key, this->new_key, this->auth_key_number);

        Serial.println(this->operation_success ? "[NFC] Change key successful" : "[NFC] Change key failed");

        // Notify callback if set
        if (this->change_key_complete_callback != nullptr)
        {
            this->change_key_complete_callback(this->operation_success);
        }

        // Return to ready state
        this->state = NFC_STATE_READY;
        this->last_state_time = millis();
    }
}

// Implement the non-blocking operation starters
bool NFC::startAuthenticate(uint8_t keyNumber, uint8_t authKey[16])
{
    // Only start if in ready state
    if (this->state != NFC_STATE_READY)
    {
        return false;
    }

    // Set up the auth parameters
    this->auth_key_number = keyNumber;
    memcpy(this->auth_key, authKey, 16);

    // Change state to start auth
    this->state = NFC_STATE_AUTH_START;
    this->last_state_time = millis();
    return true;
}

bool NFC::startWriteData(uint8_t authKey[16], uint8_t keyNumber, uint8_t data[], size_t dataLength)
{
    // Only start if in ready state
    if (this->state != NFC_STATE_READY)
    {
        return false;
    }

    // Check if data size is within our buffer
    if (dataLength > sizeof(this->write_data))
    {
        return false;
    }

    // Set up the write parameters
    this->auth_key_number = keyNumber;
    memcpy(this->auth_key, authKey, 16);
    memcpy(this->write_data, data, dataLength);
    this->write_data_length = dataLength;

    // Change state to start write
    this->state = NFC_STATE_WRITE_START;
    this->last_state_time = millis();
    return true;
}

bool NFC::startChangeKey(uint8_t keyNumber, uint8_t authKey[16], uint8_t newKey[16])
{
    // Only start if in ready state
    if (this->state != NFC_STATE_READY)
    {
        return false;
    }

    // Set up the key change parameters
    this->auth_key_number = keyNumber;
    memcpy(this->auth_key, authKey, 16);
    memcpy(this->new_key, newKey, 16);

    // Change state to start key change
    this->state = NFC_STATE_CHANGE_KEY_START;
    this->last_state_time = millis();
    return true;
}

// Implement the callback setters
void NFC::setAuthCompleteCallback(void (*callback)(bool success))
{
    this->auth_complete_callback = callback;
}

void NFC::setWriteCompleteCallback(void (*callback)(bool success))
{
    this->write_complete_callback = callback;
}

void NFC::setChangeKeyCompleteCallback(void (*callback)(bool success))
{
    this->change_key_complete_callback = callback;
}

// Legacy blocking APIs - now implemented using the non-blocking state machine

const uint8_t AUTH_CMD = 0x71;
bool NFC::changeKey(uint8_t keyNumber, uint8_t authKey[16], uint8_t newKey[16])
{
    // Wait for any ongoing operation to complete
    while (this->state != NFC_STATE_READY && this->state != NFC_STATE_INIT)
    {
        this->loop();
        delay(10);
    }

    // Start the non-blocking operation
    if (!this->startChangeKey(keyNumber, authKey, newKey))
    {
        return false;
    }

    // Wait for completion
    while (this->state != NFC_STATE_READY)
    {
        this->loop();
        delay(10);
    }

    return this->operation_success;
}

bool NFC::writeData(uint8_t authKey[16], uint8_t keyNumber, uint8_t data[], size_t dataLength)
{
    // Wait for any ongoing operation to complete
    while (this->state != NFC_STATE_READY && this->state != NFC_STATE_INIT)
    {
        this->loop();
        delay(10);
    }

    // Start the non-blocking operation
    if (!this->startWriteData(authKey, keyNumber, data, dataLength))
    {
        return false;
    }

    // Wait for completion
    while (this->state != NFC_STATE_READY)
    {
        this->loop();
        delay(10);
    }

    return this->operation_success;
}

bool NFC::authenticate(uint8_t keyNumber, uint8_t authKey[16])
{
    // Wait for any ongoing operation to complete
    while (this->state != NFC_STATE_READY && this->state != NFC_STATE_INIT)
    {
        this->loop();
        delay(10);
    }

    // Start the non-blocking operation
    if (!this->startAuthenticate(keyNumber, authKey))
    {
        return false;
    }

    // Wait for completion
    while (this->state != NFC_STATE_READY)
    {
        this->loop();
        delay(10);
    }

    return this->operation_success;
}

void NFC::waitForCardRemoval()
{
    // This is a placeholder for a non-blocking card removal detection
    // To be implemented based on specific requirements
    // For now, we just return immediately to avoid blocking
    return;
}