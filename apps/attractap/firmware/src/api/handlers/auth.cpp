#include "../../state/language.hpp"
// Reader authentication and device-name handshake handlers
// FEATURE: api-auth

#include "../api.hpp"
#include "../../clock/wall_clock.hpp"
#include "../../platform.hpp"
#include "../../display/ui/ui_capabilities.hpp"
#include "../../ble_proxy/ble_capability.hpp"
#include "../diagnostics/reset-reason.hpp"
#include "../security/build_profile.hpp"
#ifdef ESP_PLATFORM
#include "esp_system.h"
#endif
#include <cmath>
#include <functional>
#include <limits>
#include <string>


void API::sendFirmwareInfo()
{
    this->logger.info("Requested firmware info");

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
#if defined(BEEPER_PIN) || defined(HAS_IO_EXPANDER) // touch readers drive the beeper through the IO expander
    traits.hasBeeper = true;
#endif
#ifdef ATTRACTAP_BLE_BRIDGE
    // BLE bridge: no card reader, so no card functions (and no cardRelay below); BLE only.
    traits.hasNfc = false;
#endif
#ifdef ESP_PLATFORM
    const char *resetReason = crashResetReasonToString((uint8_t)esp_reset_reason());
#else
    const char *resetReason = "POWERON"; // the simulator always starts cold
#endif
    JsonDocument event;
    char uiCaps[ui::CAPABILITIES_UI_SCRATCH];
    // Profile, release flag and secure_version are the reader's claims (ATT-1207). The server decides "secured"
    // only from the eFuse report and the paired credential of the session.
    ui::buildFirmwareInfo(event,
                          {FIRMWARE_NAME, FIRMWARE_VARIANT, FIRMWARE_VERSION, resetReason, millis(),
                           BuildProfile::name(), BuildProfile::release(), BuildProfile::secureVersion()},
                          traits, uiCaps, sizeof uiCaps);
    // This reader relays card APDUs to the server and holds no card keys (firmware 2.0.0+).
    if (traits.hasNfc) event["data"]["payload"]["capabilities"]["cardRelay"] = true;
    // CARD_DETECTED carries the card's SAK and ATQA, and the presence probe works for cards without ISO 14443-4:
    // UID-only cards (MIFARE Classic, Ultralight, NTAG21x, DESFire EV1) can be enrolled and used here.
    if (traits.hasNfc) event["data"]["payload"]["capabilities"]["uidOnlyCards"] = true;
#ifdef HAS_LVGL_DISPLAY
    // Duration input and extend controls (ATT-43): the touch readers. Others start with the server's fallback deadline.
    if (traits.hasNfc) event["data"]["payload"]["capabilities"]["sessionDuration"] = true;
    // This reader renders image form fields as a QR code for the phone (ATT-879). Readers without a display never get them.
    event["data"]["payload"]["capabilities"]["formImages"] = true;
#endif
    // Plugin BLE proxy, protocol v1 (ATT-1033). Builds without it send no `ble`: the API answers READER_UNSUPPORTED.
    char bleCaps[ble::CAPABILITY_SCRATCH];
    if (BleProxy::supported())
        this->bleProxy.fillCapability(event["data"]["payload"]["capabilities"], bleCaps, sizeof bleCaps);

    // The ui and ble blocks make this message ~1.1 KB; a smaller buffer would be truncated silently.
    char json[JSON_OUTBUF_AUTH];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0 || n >= sizeof(json))
    {
        this->logger.error("Failed to serialize firmware info");
        return;
    }
    // Sent once per authentication: a refusal under back-pressure is retried from loop(), or the server would see
    // no capabilities (no BLE) for the whole session.
    this->firmwareInfoPending = !this->transport.sendMessage(json, n);
    if (this->firmwareInfoPending)
    {
        this->firmwareInfoRetryAt = millis() + FIRMWARE_INFO_RETRY_MS;
        return;
    }
    // Explicit, not a scan of outgoing bytes: the session's eFuse report follows this message.
    this->transport.onFirmwareInfoSent();
}

void API::onReaderAuthenticated(JsonObject data)
{
    logger.info("READER_AUTHENTICATED");
    resourceListMessageCounter = resourceListRevision = 0;
    cancelResourceAction();
    // Both sides restart UI revisions at 1 after (re)authentication.
    clearUiSlots();

    std::string deviceName = data["payload"]["name"].as<std::string>();
    const char *language = data["payload"]["language"].as<const char *>();
    this->onServerTime(data["payload"]["serverTime"]);

    State::setApiState(true, deviceName, Language::supported(language ? language : "en"));
    // A new authentication is a new connection for the server: no BLE session carries over.
    this->bleProxy.linkLost();
    if (language) Settings::saveDefaultLanguage(language);
    ++authenticationCount;

    if (this->deviceNameCallback != nullptr)
    {
        this->deviceNameCallback(deviceName);
    }

    logger.info("Reader Authentication successful.");

    this->sendFirmwareInfo();
    this->crashUploader.onAuthenticated(millis());
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
