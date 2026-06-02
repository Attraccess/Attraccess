// Reader registration, authentication, and device-name handshake handlers
// FEATURE: api-auth

#include "api.hpp"

void API::onRegistrationData(JsonObject data)
{
    this->logger.info("Received registration response.");

    if (data["payload"].is<JsonObject>())
    {
        auto payload = data["payload"].as<JsonObject>();
        if (payload["id"].is<uint32_t>() && payload["token"].is<String>())
        {
            uint32_t readerId = payload["id"].as<uint32_t>();
            String apiKey = payload["token"].as<String>();

            Settings::saveAttraccessAuthConfig(apiKey, readerId);

            this->logger.infof("Reader registered with ID: %d and token: %s", readerId, apiKey.c_str());

            this->sendAuthenticationRequest();
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

    logger.error(("UNAUTHORIZED: " + message).c_str());
    Settings::clearAttraccessAuthConfig();

    this->sendMessage("READER_REGISTER", JsonObject());
}

bool API::isRegistered()
{
    return (Settings::getAttraccessAuthConfig().apiKey.length() > 0);
}

void API::sendAuthenticationRequest()
{
    if (!this->isRegistered())
    {
        logger.info("Not registered, sending registration request");
        this->sendMessage("READER_REGISTER");
        return;
    }

    logger.info("Sending authentication request");
    JsonDocument event;
    event["event"] = "EVENT";
    event["data"]["type"] = "READER_AUTHENTICATE";
    event["data"]["payload"]["id"] = Settings::getAttraccessAuthConfig().readerId;
    event["data"]["payload"]["token"] = Settings::getAttraccessAuthConfig().apiKey;
    char json[JSON_OUTBUF_AUTH];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0)
    {
        this->logger.error("Failed to serialize authenticate event to buffer");
        return;
    }
    this->logger.info((String("sending authentication request to websocket: ") + String(json)).c_str());
    this->websocket.sendMessage(json, n);
}

void API::sendFirmwareInfo()
{
    this->logger.info("Requested firmware info");

    JsonDocument event;
    event["event"] = "EVENT";
    event["data"]["type"] = "READER_FIRMWARE_INFO";
    event["data"]["payload"]["name"] = FIRMWARE_NAME;
    event["data"]["payload"]["variant"] = FIRMWARE_VARIANT;
    event["data"]["payload"]["version"] = FIRMWARE_VERSION;
    event["data"]["payload"]["capabilities"]["resourceSelection"] =
#ifdef HAS_LVGL_DISPLAY
        true;
#else
        false;
#endif
    event["data"]["payload"]["capabilities"]["cardEnrollment"] =
#ifdef HAS_LVGL_DISPLAY
        true;
#else
        false;
#endif
    event["data"]["payload"]["capabilities"]["hasLeds"] =
#ifdef HAS_WS2812_LED
        true;
#else
        false;
#endif

    char json[JSON_OUTBUF_SMALL];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0)
    {
        this->logger.error("Failed to serialize firmware info");
        return;
    }
    this->websocket.sendMessage(json, n);
}

void API::onReaderAuthenticated(JsonObject data)
{
    logger.info("READER_AUTHENTICATED");

    String deviceName = data["payload"]["name"].as<String>();

    State::setApiState(true, deviceName);

    if (this->deviceNameCallback != nullptr)
    {
        this->deviceNameCallback(deviceName);
    }

    logger.info("Reader Authentication successful.");

    this->sendFirmwareInfo();
}

void API::onDeviceName(std::function<void(String)> callback)
{
    this->deviceNameCallback = callback;
}
