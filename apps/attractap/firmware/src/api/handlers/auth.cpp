#include "../../state/language.hpp"
// Reader registration, authentication, and device-name handshake handlers
// FEATURE: api-auth

#include "../api.hpp"
#include "../../clock/wall_clock.hpp"
#include "../../platform.hpp"
#include <cmath>
#include <functional>
#include <limits>
#include <string>
#include <utility>
#include <vector>

void API::onRegistrationData(JsonObject data)
{
    this->logger.info("Received registration response.");

    if (data["payload"].is<JsonObject>())
    {
        auto payload = data["payload"].as<JsonObject>();
        if (payload["id"].is<uint32_t>() && payload["token"].is<const char *>())
        {
            uint32_t readerId = payload["id"].as<uint32_t>();
            std::string apiKey = payload["token"].as<std::string>();

            Settings::saveAttraccessAuthConfig(apiKey, readerId);
            State::clearEnrollment(true);

            this->logger.infof("Reader registered with ID: %d", readerId);

            this->sendAuthenticationRequest();
        }
    }
}

void API::onUnauthorized(JsonObject data)
{
    std::string message = "Unknown error";
    if (data["payload"].is<JsonObject>())
    {
        JsonObject payload = data["payload"].as<JsonObject>();
        if (payload["message"].is<const char *>() && !payload["message"].isNull())
        {
            message = payload["message"].as<std::string>();
        }
    }

    logger.error(("UNAUTHORIZED: " + message).c_str());
    State::setApiState(false, "");
    Settings::clearAttraccessAuthConfig();

    this->sendRegistrationRequest();
}

// The server only creates the reader once an admin approved the code it answers with.
void API::sendRegistrationRequest()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["enrollment"]["protocol"] = 1;
#ifndef HAS_LVGL_DISPLAY
    // Without a screen the admin matches the colour pattern on the LED ring instead of reading a code.
    payload["enrollment"]["hasScreen"] = false;
#endif
    JsonObject firmware = payload["firmware"].to<JsonObject>();
    firmware["name"] = FIRMWARE_NAME;
    firmware["variant"] = FIRMWARE_VARIANT;
    firmware["version"] = FIRMWARE_VERSION;
    this->sendMessage("READER_REGISTER", payload);
}

void API::onEnrollmentCode(JsonObject data)
{
    JsonObject payload = data["payload"].as<JsonObject>();
    if (!payload["code"].is<const char *>())
    {
        return;
    }
    // The lab helper reads this line from the UART to approve readers without a screen reader.
    logger.infof("Enrollment: code=%s rotatesInMs=%u", payload["code"].as<const char *>(),
                 static_cast<unsigned>(payload["rotatesInMs"] | 30000U));
    State::setEnrollmentCode(payload["code"].as<std::string>(),
                             payload["rotatesInMs"] | 30000U,
                             payload["expiresInMs"] | 600000U);
    // Only readers without a screen get a pattern; null means the server had none left.
    if (payload.containsKey("pattern"))
    {
        std::vector<std::string> colors;
        for (JsonVariant color : payload["pattern"].as<JsonArray>())
        {
            colors.push_back(color.as<std::string>());
        }
        State::setEnrollmentPattern(std::move(colors));
    }
}

void API::onEnrollmentRejected(JsonObject data)
{
    uint32_t retryAfterMs = data["payload"]["retryAfterMs"] | 30000U;
    // Never hammer the server: wait at least 5 s, at most the request lifetime.
    if (retryAfterMs < 5000U) retryAfterMs = 5000U;
    if (retryAfterMs > 600000U) retryAfterMs = 600000U;
    logger.warnf("Enrollment request refused, retrying in %u ms", static_cast<unsigned>(retryAfterMs));
    State::setEnrollmentRejected(retryAfterMs);
    this->enrollmentRetryAt = millis() + retryAfterMs;
    this->enrollmentRetryPending = true;
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
        this->sendRegistrationRequest();
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
    this->logger.info("Sending reader authentication request");
    this->transport.sendMessage(json, n);
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
    this->transport.sendMessage(json, n);
}

void API::onReaderAuthenticated(JsonObject data)
{
    logger.info("READER_AUTHENTICATED");
    resourceListMessageCounter = resourceListRevision = 0;
    cancelResourceAction();

    std::string deviceName = data["payload"]["name"].as<std::string>();
    const char *language = data["payload"]["language"].as<const char *>();
    this->onServerTime(data["payload"]["serverTime"]);

    State::setApiState(true, deviceName, Language::supported(language ? language : "en"));
    if (language) Settings::saveDefaultLanguage(language);
    ++authenticationCount;

    if (this->deviceNameCallback != nullptr)
    {
        this->deviceNameCallback(deviceName);
    }

    logger.info("Reader Authentication successful.");

    this->sendFirmwareInfo();
    this->sendPendingCrashReport();
}

void API::onServerTime(JsonVariantConst serverTime)
{
    // Older servers omit the sample; the clock then stays hidden.
    if (!serverTime["epochMs"].is<double>() || !serverTime["utcOffsetMinutes"].is<int>())
    {
        return;
    }
    const double epochMs = serverTime["epochMs"].as<double>();
    // INT64_MAX rounds up to 2^63 as a double, so the upper bound is exclusive.
    constexpr double minEpoch = static_cast<double>(std::numeric_limits<int64_t>::min());
    if (!std::isfinite(epochMs) || epochMs < minEpoch || epochMs >= -minEpoch)
    {
        return;
    }
    WallClock::onServerTime(static_cast<int64_t>(epochMs),
                            serverTime["utcOffsetMinutes"].as<int32_t>());
}

void API::onDeviceName(std::function<void(std::string)> callback)
{
    this->deviceNameCallback = callback;
}
