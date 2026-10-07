#include "serialCommandHandler.hpp"

#ifndef ATTRACTAP_HOST

#include <ArduinoJson.h>
#include <lwip/inet.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "../settings/settings.hpp"
#include "../network/wifi/wifi.hpp"
#include "../state/state.hpp"
#include "../utils.hpp"
#include "platform.hpp"

void SerialCommandHandler::handleCommand(const std::string &topic, const std::string &payload)
{
    bool hasPin = pinIsSet();

    StaticJsonDocument<512> payloadDoc;
    JsonObject payloadObj;
    if (payload.length() > 0)
    {
        auto err = deserializeJson(payloadDoc, payload);
        if (err)
        {
            sendErrorResponse(topic, "INVALID_PAYLOAD");
            return;
        }
        payloadObj = payloadDoc.as<JsonObject>();
    }
    else
    {
        payloadObj = payloadDoc.to<JsonObject>(); // empty object
    }

    if (topic == "debug.crash")
    {
        logger.error("debug.crash received - forcing panic for crash-report e2e test (ATT-474)");
        fflush(stdout);
        abort();
        return;
    }

    if (topic == "auth.status.get")
    {
        DynamicJsonDocument resp(64);
        resp["pinIsSet"] = hasPin;

        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (topic == "auth.code.set")
    {
        const char *newCode = payloadObj["newCode"].is<const char *>() ? payloadObj["newCode"].as<const char *>() : nullptr;
        const char *currentCode = payloadObj["currentCode"].is<const char *>() ? payloadObj["currentCode"].as<const char *>() : nullptr;

        if (!validateNewCode(newCode))
        {
            sendErrorResponse(topic, "INVALID_NEW_CODE");
            return;
        }

        if (hasPin)
        {
            std::string authError;
            if (!ensureAuthorized(currentCode, authError))
            {
                sendErrorResponse(topic, authError.c_str());
                return;
            }
        }

        Settings::setDevicePin(std::string(newCode));

        DynamicJsonDocument resp(64);
        resp["success"] = true;
        resp["pinIsSet"] = true;
        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (!hasPin)
    {
        sendErrorResponse(topic, "PIN_NOT_SET");
        return;
    }

    const char *authCode = payloadObj["authCode"].is<const char *>() ? payloadObj["authCode"].as<const char *>() : nullptr;
    std::string authError;
    if (!ensureAuthorized(authCode, authError))
    {
        sendErrorResponse(topic, authError.c_str());
        return;
    }

    handleAuthorizedCommand(topic, payloadObj);
}
#endif
