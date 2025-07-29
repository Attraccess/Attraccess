#include "api.hpp"
#include "nfc.hpp"

void API::setup(NFC *nfc)
{
    this->nfc = nfc;

    Serial.println("[API] Setting up...");

    Serial.println("[API] Setup complete.");
}

bool API::isConfigured()
{
    String hostname = Persistence::getSettings().Config.api.hostname;
    int port = Persistence::getSettings().Config.api.port;

    // Check if hostname is set and not empty
    if (hostname.length() == 0 || port == 0)
    {
        return false;
    }

    return true;
}

bool API::checkTCPConnection()
{
    String hostname = Persistence::getSettings().Config.api.hostname;
    int port = Persistence::getSettings().Config.api.port;

    // Only print once per connection attempt
    if (!is_connecting)
    {
        Serial.println("[API] Checking TCP connection to " + hostname + ":" + String(port));
        is_connecting = true;
    }

    int connectStatus = this->client.connect(
        hostname.c_str(),
        port);

    if (connectStatus == 1)
    {
        is_connecting = false;
        return true;
    }

    // Only print detailed error if this is a new failure, not repeated failures
    if (millis() - last_connection_attempt >= connection_retry_interval)
    {
        Serial.print("[API] Failed to establish TCP connection. Status: ");
        Serial.print(connectStatus);
        Serial.print(" (");
        switch (connectStatus)
        {
        case 0:
            Serial.print("FAILED");
            break;
        case -1:
            Serial.print("TIMED_OUT");
            break;
        case -2:
            Serial.print("INVALID_SERVER");
            break;
        case -3:
            Serial.print("TRUNCATED");
            break;
        case -4:
            Serial.print("INVALID_RESPONSE");
            break;
        case -5:
            Serial.print("DOMAIN_NOT_FOUND");
            break;
        default:
            Serial.print("UNKNOWN_ERROR");
            break;
        }
        Serial.println(")");
    }

    is_connecting = false;
    return false;
}

bool API::isConnected()
{
    bool was_connected = this->is_connected;

    // Check if API is configured before attempting connection
    if (!isConfigured())
    {
        if (was_connected)
        {
            Serial.println("[API] Not configured, skipping connection attempts");
            this->is_connected = false;
            this->display->set_api_connected(false);
        }
        return false;
    }

    this->is_connected = this->websocket.connected();

    if (was_connected != this->is_connected)
    {
        if (!this->is_connected)
        {
            Serial.println("[API] Socket not connected to server: " + String(Persistence::getSettings().Config.api.hostname) + ":" + String(Persistence::getSettings().Config.api.port) + API_WS_PATH);
        }

        if (this->is_connected)
        {
            Serial.println("[API] Socket connected to server: " + String(Persistence::getSettings().Config.api.hostname) + ":" + String(Persistence::getSettings().Config.api.port) + API_WS_PATH);
        }
    }

    if (this->is_connected)
    {
        return true;
    }
    else
    {
        this->display->set_api_connected(false);
    }

    this->is_authenticated = false;
    this->authentication_sent_at = 0;
    this->registration_sent_at = 0;

    // Rate limit connection attempts
    unsigned long current_time = millis();
    if (current_time - last_connection_attempt < connection_retry_interval)
    {
        return false;
    }

    last_connection_attempt = current_time;

    bool tcp_connected = this->checkTCPConnection();

    if (!tcp_connected)
    {
        this->display->set_api_connected(false);
        return false;
    }

    Serial.println("[API] Connecting to WebSocket...");
    this->websocket.protocol = "ws";
    this->is_connected = this->websocket.connect(
        Persistence::getSettings().Config.api.hostname,
        Persistence::getSettings().Config.api.port);

    if (this->is_connected)
    {
        Serial.println("[API] WS connection to " + String(Persistence::getSettings().Config.api.hostname) + ":" + String(Persistence::getSettings().Config.api.port) + " established");
    }

    if (!this->is_connected)
    {
        this->display->set_api_connected(false);
    }

    return this->is_connected;
}

void API::onRegistrationData(JsonObject data)
{
    Serial.println("[API] Received registration response.");

    // Extract and save registration info
    if (data["payload"].is<JsonObject>())
    {
        auto payload = data["payload"].as<JsonObject>();
        if (payload["id"].is<uint32_t>() && payload["token"].is<String>())
        {
            uint32_t readerId = payload["id"].as<uint32_t>();
            String apiKey = payload["token"].as<String>();

            // Save to persistence
            PersistSettings<PersistenceData> settings = Persistence::getSettings();
            settings.Config.api.readerId = readerId;
            strncpy(settings.Config.api.apiKey, apiKey.c_str(), sizeof(settings.Config.api.apiKey) - 1);
            settings.Config.api.apiKey[sizeof(settings.Config.api.apiKey) - 1] = '\0'; // Ensure null termination
            settings.Config.api.has_auth = true;
            Persistence::saveSettings(settings);

            Serial.print("[API] Reader registered with ID: ");
            Serial.print(readerId);
            Serial.print(" and token: ");
            Serial.println(apiKey);
        }
    }
}

void API::onUnauthorized(JsonObject data)
{
    String message = "Unknown error";
    if (data["payload"].is<JsonObject>())
    {
        JsonObject payload = data["payload"].as<JsonObject>();
        if (payload["message"].is<String>() && !payload["message"].isNull())
        {
            message = payload["message"].as<String>();
        }
    }

    Serial.println("[API] UNAUTHORIZED: " + message);
    this->is_authenticated = false;
    this->authentication_sent_at = 0;
    this->registration_sent_at = 0;
    PersistSettings<PersistenceData> settings = Persistence::getSettings();
    settings.Config.api.has_auth = false;
    Persistence::saveSettings(settings);
    this->display->set_api_connected(false);
}

void API::onEnableCardChecking(JsonObject data)
{
    Serial.println("[API] ENABLE_CARD_CHECKING");
    this->nfc->enableCardChecking();
    this->display->set_nfc_tap_enabled(true);
    this->display->set_nfc_tap_text(data["payload"]["message"].as<String>());
}

void API::onDisableCardChecking(JsonObject data)
{
    Serial.println("[API] DISABLE_CARD_CHECKING");
    this->nfc->disableCardChecking();
    this->display->set_nfc_tap_enabled(false);
}

void API::hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength)
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

void API::onChangeKeys(JsonObject data)
{
    Serial.println("[API] CHANGE_KEYS");

    // Parse authentication key from hex string
    uint8_t authKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authKey, sizeof(authKey));

    JsonObject response = JsonObject();
    response["failedKeys"] = JsonArray();
    response["successfulKeys"] = JsonArray();

    StaticJsonDocument<256> doc;
    JsonObject responsePayload = doc.to<JsonObject>();
    responsePayload["failedKeys"] = JsonArray();
    responsePayload["successfulKeys"] = JsonArray();

    // TODO: if change includes key 0, we need to change it first using provided auth key
    // TODO: if more keys are provided, we need to change them afterwards using new key 0 as auth key

    bool doesChangeKey0 = false;
    for (JsonPair key : data["payload"]["keys"].as<JsonObject>())
    {
        uint8_t keyNumber = key.key().c_str()[0] - '0';
        if (keyNumber == 0)
        {
            doesChangeKey0 = true;

            uint8_t newKey[16];
            String newKeyHex = key.value().as<String>();
            this->hexStringToBytes(newKeyHex, newKey, sizeof(newKey));

            Serial.println("Change KEy Call 1");
            bool success = this->nfc->changeKey(0, authKey, newKey);
            if (!success)
            {
                responsePayload["failedKeys"].add(0);
                this->sendMessage(true, "CHANGE_KEYS", responsePayload);
                return;
            }

            responsePayload["successfulKeys"].add(0);

            // replace authkey with newkey for further operations
            for (int i = 0; i < 16; i++)
            {
                authKey[i] = newKey[i];
            }

            break;
        }
    }

    // for each key in "keys" object (key = key number as string, value = next key as hex string)
    for (JsonPair key : data["payload"]["keys"].as<JsonObject>())
    {
        uint8_t keyNumber = key.key().c_str()[0] - '0';

        if (keyNumber == 0)
        {
            continue;
        }

        uint8_t newKey[16];
        String newKeyHex = key.value().as<String>();
        this->hexStringToBytes(newKeyHex, newKey, sizeof(newKey));

        Serial.print("[API] executing change key for key number ");
        Serial.print(keyNumber);
        Serial.print(" using current key xxxx");
        for (int i = 10; i < 16; i++)
        {
            Serial.print(authKey[i]);
        }
        Serial.print(" to new key ");
        for (int i = 10; i < 16; i++)
        {
            Serial.print(newKey[i]);
        }
        Serial.println();

        Serial.println("Change key call 3");
        bool success = this->nfc->changeKey(keyNumber, authKey, newKey);
        if (success)
        {
            responsePayload["successfulKeys"].add(keyNumber);
        }
        else
        {
            responsePayload["failedKeys"].add(keyNumber);
            this->sendMessage(true, "CHANGE_KEYS", responsePayload);
            return;
        }
    }

    this->sendMessage(true, "CHANGE_KEYS", responsePayload);
}

void API::onAuthenticate(JsonObject data)
{
    Serial.println("[API] AUTHENTICATE");

    uint8_t authenticationKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authenticationKey, sizeof(authenticationKey));

    uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();

    bool success = this->nfc->authenticate(keyNumber, authenticationKey);
    if (success)
    {
        Serial.println("[API] Authentication successful.");
    }
    else
    {
        Serial.println("[API] Authentication failed.");
    }

    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["authenticationSuccessful"] = success;
    this->sendMessage(true, "AUTHENTICATE", payload);
}

void API::onReauthenticate(JsonObject data)
{
    Serial.println("[API] REAUTHENTICATE Api flow");
    this->display->show_success("Resetting...", 0);
    this->authentication_sent_at = 0;
    this->is_authenticated = false;
}

void API::onShowText(JsonObject data)
{
    Serial.println("[API] SHOW_TEXT");
    this->display->show_text(true);
    this->display->set_text(data["payload"]["lineOne"].as<String>(), data["payload"]["lineTwo"].as<String>());
}

void API::processData()
{
    if (!this->websocket.available())
    {
        return;
    }

    uint8_t buffer[1024];
    const auto bytes_read = this->websocket.read(buffer, 1024);

    // parse json
    JsonDocument doc;
    deserializeJson(doc, buffer, bytes_read);

    auto data = doc["data"].as<JsonObject>();
    auto eventType = data["type"].as<String>();
    auto payload = data["payload"].as<JsonObject>();

    String payloadString;
    serializeJson(payload, payloadString);

    Serial.println("[API] Received message of type " + eventType + " with payload " + payloadString);

    if (eventType == "REGISTER")
    {
        this->onRegistrationData(data);
    }
    else if (eventType == "UNAUTHORIZED")
    {
        this->onUnauthorized(data);
    }
    else if (eventType == "READER_AUTHENTICATED")
    {
        this->is_authenticated = true;
        this->display->set_api_connected(true);
        this->display->set_device_name(payload["name"].as<String>());
        Serial.println("[API] Authentication successful.");
    }
    else if (eventType == "ENABLE_CARD_CHECKING")
    {
        this->onEnableCardChecking(data);
    }
    else if (eventType == "DISABLE_CARD_CHECKING")
    {
        this->onDisableCardChecking(data);
    }
    else if (eventType == "CHANGE_KEYS")
    {
        this->onChangeKeys(data);
    }
    else if (eventType == "AUTHENTICATE")
    {
        this->onAuthenticate(data);
    }
    else if (eventType == "DISPLAY_SUCCESS")
    {
        this->display->show_success(data["payload"]["message"].as<String>(), data["payload"]["duration"].as<unsigned long>());
    }
    else if (eventType == "DISPLAY_ERROR")
    {
        this->display->show_error(data["payload"]["message"].as<String>(), data["payload"]["duration"].as<unsigned long>());
    }
    else if (eventType == "REAUTHENTICATE")
    {
        this->onReauthenticate(data);
    }
    else if (eventType == "SHOW_TEXT")
    {
        this->onShowText(data);
    }
    else if (eventType == "HIDE_TEXT")
    {
        this->display->show_text(false);
    }
    else
    {
        Serial.println("[API] Unknown event type: " + eventType);
        Serial.write(buffer, bytes_read);
        Serial.println();
    }
}

bool API::isRegistered()
{
    return (Persistence::getSettings().Config.api.has_auth);
}

void API::sendMessage(bool is_response, const char *type, JsonObject payload)
{
    JsonDocument event;
    if (is_response)
    {
        event["event"] = "RESPONSE";
    }
    else
    {
        event["event"] = "EVENT";
    }
    event["data"]["type"] = type;

    // Create a copy of the payload in the destination document
    JsonObject eventPayload = event["data"]["payload"].to<JsonObject>();
    for (JsonPair p : payload)
    {
        eventPayload[p.key()] = p.value();
    }

    String payloadString = event["data"]["payload"].as<String>();

    Serial.println("[API] Sending " + String(is_response ? "response" : "event") + " of type " + String(type) + " with payload " + payloadString);

    String json;
    serializeJson(event, json);
    this->websocket.write((uint8_t *)json.c_str(), json.length());
    this->websocket.flush();
}

void API::sendRegistrationRequest()
{
    // only send registration once per minute
    if (this->registration_sent_at != 0 && millis() - this->registration_sent_at < (1000 * 10))
    {
        return;
    }

    Serial.println("[API] Registering reader...");

    this->sendMessage(false, "REGISTER", JsonObject());

    this->registration_sent_at = millis();

    // check write error / status
    auto writeStatus = this->websocket.getWriteError();
    if (writeStatus != 0)
    {
        Serial.print("[API] Failed to send registration request. Error: ");
        Serial.println(writeStatus);
        return;
    }

    Serial.println("[API] Registration request sent.");
}

void API::sendAuthenticationRequest()
{
    // only send authentication once per minute
    if (this->authentication_sent_at != 0 && millis() - this->authentication_sent_at < (1000 * 10))
    {
        return;
    }

    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["id"] = Persistence::getSettings().Config.api.readerId;
    payload["token"] = Persistence::getSettings().Config.api.apiKey;
    this->sendMessage(false, "AUTHENTICATE", payload);

    this->authentication_sent_at = millis();
}

void API::sendNFCTapped(uint8_t *uid, uint8_t uidLength)
{
    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();

    // Convert UID to hex string
    String uidHex = "";
    for (uint8_t i = 0; i < uidLength; i++)
    {
        if (uid[i] < 0x10)
        {
            uidHex += "0";
        }
        uidHex += String(uid[i], HEX);
    }

    payload["cardUID"] = uidHex;
    this->sendMessage(false, "NFC_TAP", payload);
}

void API::sendHeartbeat()
{
    // send every 5 seconds
    if (this->heartbeat_sent_at != 0 && millis() - this->heartbeat_sent_at < (1000 * 5))
    {
        return;
    }

    StaticJsonDocument<512> event;
    event["event"] = "HEARTBEAT";

    String json;
    serializeJson(event, json);
    this->websocket.write((uint8_t *)json.c_str(), json.length());
    this->websocket.flush();

    this->heartbeat_sent_at = millis();
}

void API::loop()
{
    // First check if API is configured
    if (!isConfigured())
    {
        // Skip all connection attempts if not configured
        return;
    }

    // Then check if we're connected
    if (!isConnected())
    {
        return;
    }

    if (!this->isRegistered())
    {
        this->sendRegistrationRequest();
    }
    else if (!this->is_authenticated)
    {
        this->sendAuthenticationRequest();
    }

    this->sendHeartbeat();
    this->processData();
    char key = this->keypad->readKey();
    if (key != '\0')
    {
        StaticJsonDocument<256> doc;
        JsonObject payload = doc.to<JsonObject>();
        payload["key"] = String(key);
        this->sendMessage(false, "KEY_PRESSED", payload);
    }
}