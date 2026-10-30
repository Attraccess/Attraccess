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
            State::clearEnrollment();
            this->enrollmentRetryPending = false;

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
bool API::sendRegistrationRequest()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["enrollment"]["protocol"] = 1;
    if (this->sendMessage("READER_REGISTER", payload))
    {
        return true;
    }
    // The socket can stay up while a send fails; nothing else would ask again, so re-arm.
    logger.warn("Registration request could not be sent, trying again");
    this->scheduleEnrollmentRetry(ENROLLMENT_MIN_RETRY_MS);
    return false;
}

void API::scheduleEnrollmentRetry(uint32_t delayMs)
{
    // Publish the deadline before the flag the main loop checks first.
    this->enrollmentRetryAt = millis() + delayMs;
    this->enrollmentRetryPending = true;
}

void API::onEnrollmentCode(JsonObject data)
{
    JsonObject payload = data["payload"].as<JsonObject>();
    if (!payload["code"].is<const char *>())
    {
        return;
    }
    // A live request needs no retry; asking again would only hit the one-pending-per-connection limit.
    this->enrollmentRetryPending = false;
    const uint32_t rotatesInMs = payload["rotatesInMs"] | ENROLLMENT_CODE_ROTATION_MS;
    // The lab helper reads this line from the UART to approve readers without a screen.
    logger.infof("%s%s rotatesInMs=%u", ENROLLMENT_LOG_MARKER, payload["code"].as<const char *>(),
                 static_cast<unsigned>(rotatesInMs));
    State::setEnrollmentCode(payload["code"].as<std::string>(),
                             rotatesInMs,
                             payload["expiresInMs"] | ENROLLMENT_REQUEST_TTL_MS);
}

void API::onEnrollmentRejected(JsonObject data)
{
    uint32_t retryAfterMs = data["payload"]["retryAfterMs"] | ENROLLMENT_DEFAULT_RETRY_MS;
    // Never hammer the server: wait at least the minimum, at most the request lifetime.
    if (retryAfterMs < ENROLLMENT_MIN_RETRY_MS) retryAfterMs = ENROLLMENT_MIN_RETRY_MS;
    if (retryAfterMs > ENROLLMENT_REQUEST_TTL_MS) retryAfterMs = ENROLLMENT_REQUEST_TTL_MS;
    logger.warnf("Enrollment request refused, retrying in %u ms", static_cast<unsigned>(retryAfterMs));
    State::setEnrollmentRejected(retryAfterMs);
    this->scheduleEnrollmentRetry(retryAfterMs);
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
