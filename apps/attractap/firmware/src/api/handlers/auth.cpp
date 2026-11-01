#include "../../state/language.hpp"
// Reader registration, authentication, and device-name handshake handlers
// FEATURE: api-auth

#include "../api.hpp"
#include "../../clock/wall_clock.hpp"
#include "../../display/ui/ui_capabilities.hpp"
#ifdef ESP_PLATFORM
#include "esp_system.h"
#endif
#include <cmath>
#include <functional>
#include <limits>
#include <string>

// Same names as READER_CRASH_REPORT so the server can classify panic-class resets.
#ifdef ESP_PLATFORM
static const char *resetReasonName(esp_reset_reason_t reason)
{
    switch (reason)
    {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXT";
    case ESP_RST_SW: return "SW";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
#ifdef ESP_RST_CPU_LOCKUP
    case ESP_RST_CPU_LOCKUP: return "CPU_LOCKUP";
#endif
    default: return "UNKNOWN";
    }
}
#else
static const char *resetReasonName(int) { return "POWERON"; } // the simulator always starts cold
#endif

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

    // The token is gone for good: the reader can only come back through pairing.
    this->transport.startPairing("");
}

void API::onStartPairing(JsonObject data)
{
    const char *ticket = data["payload"]["ticket"] | "";
    if (ticket[0] == '\0')
    {
        logger.error("READER_START_PAIRING without a ticket");
        return;
    }
    logger.info("Admin started pairing this reader");
    this->transport.startPairing(ticket);
}

bool API::isRegistered()
{
    return (Settings::getAttraccessAuthConfig().apiKey.length() > 0);
}

void API::sendAuthenticationRequest()
{
    // A paired reader is authenticated by its TLS session; a token must never travel inside it.
    if (this->transport.authenticatesReader())
    {
        return;
    }
    if (!this->isRegistered())
    {
        // Open registration is gone: a reader without credentials pairs instead.
        logger.info("No reader credentials, requesting pairing");
        this->transport.startPairing("");
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

    ui::VariantTraits traits{};
#ifdef HAS_LVGL_DISPLAY
    traits.hasDisplay = true;
    traits.touch = true;
    traits.displayWidth = 480;
    traits.displayHeight = 480;
#endif
#ifdef HAS_WS2812_LED
    traits.hasLeds = true;
    traits.cardConfirm = true;
#endif
#ifdef BEEPER_PIN
    traits.hasBeeper = true;
#endif
    ui::fillCapabilitiesUi(event["data"]["payload"]["capabilities"]["ui"].to<JsonObject>(), traits);
    event["data"]["payload"]["resetReason"] = resetReasonName(
#ifdef ESP_PLATFORM
        esp_reset_reason()
#else
        0
#endif
    );

    // The ui block makes this message ~730 B; 256 B would be truncated silently.
    char json[JSON_OUTBUF_AUTH];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0 || n >= sizeof(json))
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
