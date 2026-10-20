#include "../../state/language.hpp"
// Reader registration, authentication, and device-name handshake handlers
// FEATURE: api-auth

#include "../api.hpp"
#include "../../platform.hpp"
#include "../../clock/wall_clock.hpp"
#include <cmath>
#include <functional>
#include <limits>
#include <string>

void API::onRegistrationData(JsonObject data)
{
    this->logger.info("Received registration response.");

    if (data["payload"].is<JsonObject>())
    {
        auto payload = data["payload"].as<JsonObject>();
        if (payload["id"].is<uint32_t>() && payload["token"].is<const char *>() &&
            payload["enrollmentVersion"] == 1 && !enrollmentCode.value().empty() &&
            enrollmentCode.value() == (payload["enrollmentCode"] | ""))
        {
            uint32_t readerId = payload["id"].as<uint32_t>();
            std::string apiKey = payload["token"].as<std::string>();

            Settings::saveAttraccessAuthConfig(apiKey, readerId);
            enrollmentCode.clear();
            State::setEnrollmentCode("");

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

    this->sendEnrollmentRequest(true);
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
        this->sendEnrollmentRequest(true);
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

void API::sendEnrollmentRequest(bool force)
{
    if (!enrollmentCode.refresh(millis(), force)) return;
    const auto code = enrollmentCode.value();
    if (code.empty()) return;
    State::setEnrollmentCode(code);
#ifndef HAS_LVGL_DISPLAY
    // Serial is local setup output. Never include this code in remote diagnostics.
    printf("Attraccess enrollment: %s\n", code.c_str());
#endif
    JsonDocument document;
    document["enrollmentCode"] = code;
    this->sendMessage("READER_REGISTER", document.as<JsonObject>());
}
