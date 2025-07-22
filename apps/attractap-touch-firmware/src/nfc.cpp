#include "nfc.hpp"

void NFC::setup()
{
    Serial.println("[NFC] Setup");
    this->nfc.begin();
    this->state = NFC_STATE_INIT;
    this->last_state_time = millis();
}

void NFC::enableCardChecking()
{
    Serial.println("[DEBUG] Entered NFC::enableCardChecking");
    this->is_card_checking_enabled = true;
    Serial.println("[DEBUG] NFC card checking enabled");
}

void NFC::disableCardChecking()
{
    this->is_card_checking_enabled = false;
}

String NFC::getStatusString() const
{
    if (nfc_disabled)
    {
        uint32_t time_remaining = (NFC_DISABLE_DURATION - (millis() - last_error_time)) / 1000;
        return "NFC Disabled (" + String(time_remaining) + "s remaining)";
    }
    else if (consecutive_errors > 0)
    {
        return "NFC Errors: " + String(consecutive_errors);
    }
    else if (state == NFC_STATE_INIT)
    {
        return "NFC Initializing";
    }
    else if (state == NFC_STATE_READY)
    {
        return "NFC Ready";
    }
    else
    {
        return "NFC Active";
    }
}

void NFC::loop()
{
    // Check for error recovery first
    checkErrorRecovery();

    // Skip all operations if NFC is disabled due to errors
    if (nfc_disabled)
    {
        return;
    }

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
    // Check if we should retry the operation
    if (!shouldRetryOperation())
    {
        return;
    }

    this->last_state_time = millis();

    // Non-blocking check: attempt to get firmware version with timeout protection
    Serial.println("[NFC] Attempting to detect PN532...");
    uint32_t start_time = millis();
    uint32_t versiondata = 0;

    // Yield to scheduler before potentially blocking operation
    yield();

    // Try to get firmware version with our own timeout wrapper
    bool operation_success = false;
    uint32_t operation_start = millis();

    try
    {
        versiondata = nfc.getFirmwareVersion();
        operation_success = (versiondata != 0);
    }
    catch (...)
    {
        operation_success = false;
    }

    // Additional safety: if operation took too long, consider it failed
    if (millis() - operation_start > 1000)
    { // 1 second safety timeout
        operation_success = false;
        versiondata = 0;
    }

    if (operation_success && versiondata)
    {
        // Print board info
        Serial.print("[NFC] Found PN53x board version: ");
        Serial.print((versiondata >> 24) & 0xFF, HEX);
        Serial.print('.');
        Serial.print((versiondata >> 16) & 0xFF, DEC);
        Serial.print('.');
        Serial.println((versiondata >> 8) & 0xFF, DEC);

        // Configure the PN532 to read ISO14443A tags
        bool sam_config_success = false;
        try
        {
            sam_config_success = nfc.SAMConfig();
        }
        catch (...)
        {
            sam_config_success = false;
        }

        if (sam_config_success)
        {
            recordSuccess();
            // Move to ready state
            this->state = NFC_STATE_READY;
            this->last_state_time = millis();
            Serial.println("[NFC] Successfully initialized PN532");
        }
        else
        {
            recordError();
            Serial.println("[NFC] Error: SAMConfig failed");
        }
    }
    else
    {
        recordError();
        Serial.println("[NFC] Error: Didn't find PN53x board. Check wiring.");
    }
}

void NFC::handleReadyState()
{
    if (this->is_card_checking_enabled)
    {
        // Use longer delay to reduce I2C bus load
        if (millis() - this->last_state_time >= 200) // Increased from 100ms
        {
            this->state = NFC_STATE_SCANNING;
            this->scan_start_time = millis();
        }
    }
}

void NFC::handleScanningState()
{
    // Check if we should retry the operation
    if (!shouldRetryOperation())
    {
        this->state = NFC_STATE_READY;
        this->last_state_time = millis();
        return;
    }

    // Start the card detection process with timeout protection
    uint8_t uid[7];
    uint8_t uidLength;
    bool foundCard = false;

    // Yield to scheduler before potentially blocking operation
    yield();

    uint32_t operation_start = millis();

    try
    {
        // Use a smaller timeout for each scan attempt (200ms instead of 250ms)
        foundCard = this->nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 200);
    }
    catch (...)
    {
        foundCard = false;
    }

    // Additional safety: if operation took too long, consider it failed
    if (millis() - operation_start > 300)
    { // 300ms safety timeout
        foundCard = false;
        recordError();
        Serial.println("[NFC] Warning: Card scan operation timed out");
    }

    if (foundCard)
    {
        recordSuccess();
        if (this->onNFCTapped)
        {
            this->onNFCTapped(uid, uidLength);
        }
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

// Error handling methods
void NFC::recordError()
{
    consecutive_errors++;
    last_error_time = millis();

    Serial.printf("[NFC] Error recorded. Consecutive errors: %d\n", consecutive_errors);

    if (consecutive_errors >= MAX_CONSECUTIVE_ERRORS)
    {
        nfc_disabled = true;
        Serial.printf("[NFC] Too many consecutive errors (%d). Disabling NFC for %d seconds.\n",
                      consecutive_errors, NFC_DISABLE_DURATION / 1000);
    }
}

void NFC::recordSuccess()
{
    if (consecutive_errors > 0)
    {
        Serial.printf("[NFC] Success after %d errors. Resetting error count.\n", consecutive_errors);
    }
    consecutive_errors = 0;
    last_error_time = 0;
}

bool NFC::shouldRetryOperation()
{
    if (nfc_disabled)
        return false;

    if (consecutive_errors == 0)
        return true;

    uint32_t backoff_delay = getBackoffDelay();
    return (millis() - last_error_time >= backoff_delay);
}

uint32_t NFC::getBackoffDelay()
{
    if (consecutive_errors == 0)
        return 0;

    // Exponential backoff with cap
    uint32_t delay = ERROR_BACKOFF_BASE * (1 << min(consecutive_errors - 1, 5)); // Cap at 32x base delay
    return min(delay, MAX_ERROR_BACKOFF);
}

void NFC::checkErrorRecovery()
{
    if (nfc_disabled && (millis() - last_error_time >= NFC_DISABLE_DURATION))
    {
        Serial.println("[NFC] Recovery time elapsed. Re-enabling NFC with reset error count.");
        nfc_disabled = false;
        consecutive_errors = 0;
        last_error_time = 0;
        // Reset to init state to re-detect hardware
        this->state = NFC_STATE_INIT;
        this->last_state_time = millis();
    }
}