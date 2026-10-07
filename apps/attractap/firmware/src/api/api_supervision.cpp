#include "api.hpp"
#include <functional>
#include <cstring>
#include <string>

void API::requestSupervision(uint32_t resourceId)
{
    this->logger.info("Requesting supervision");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("SUPERVISION_REQUEST", payload);
}

void API::requestSupervisorCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId)
{
    this->logger.info("Requesting supervisor card authentication data");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["uid"] = hexToString(uid, uidLength);
    payload["resourceId"] = resourceId;
    this->sendMessage("REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA", payload);
}

void API::confirmSupervisorCardAuth(uint32_t resourceId)
{
    this->logger.info("Confirming supervisor card authentication");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("SUPERVISOR_CARD_AUTH_CONFIRMED", payload);
}

void API::cancelSupervision()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage("SUPERVISION_CANCEL", payload);
}

void API::setSupervisionStartCallback(std::function<void(SupervisionStartCommand)> callback)
{
    this->supervisionStartCallback = callback;
}

void API::onSupervisionStart(JsonObject data)
{
    if (this->supervisionStartCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    SupervisionStartCommand command;
    command.resourceId = payload["resourceId"].is<uint32_t>() ? payload["resourceId"].as<uint32_t>() : 0;
    command.timeoutMs = payload["timeoutMs"].is<uint32_t>() ? payload["timeoutMs"].as<uint32_t>() : 0;
    command.requesterUsername = payload["requesterUsername"].is<const char *>()
                                    ? payload["requesterUsername"].as<std::string>()
                                    : std::string("");
    this->supervisionStartCallback(command);
}

void API::setSupervisionRequestResultCallback(std::function<void(SupervisionRequestResult)> callback)
{
    this->supervisionRequestResultCallback = callback;
}

void API::setSupervisorCardAuthenticationResponseCallback(std::function<void(SupervisorCardAuthenticationResponse)> callback)
{
    this->supervisorCardAuthenticationResponseCallback = callback;
}

void API::setSupervisionResolvedCallback(std::function<void(SupervisionResolvedResult)> callback)
{
    this->supervisionResolvedCallback = callback;
}

void API::onSupervisionRequestResult(JsonObject data)
{
    if (this->supervisionRequestResultCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    SupervisionRequestResult result;
    result.error = payload["error"].is<const char *>() ? payload["error"].as<std::string>() : std::string("");
    result.success = result.error.length() == 0 && payload["success"].is<bool>() ? payload["success"].as<bool>() : false;
    result.timeoutMs = payload["timeoutMs"].is<uint32_t>() ? payload["timeoutMs"].as<uint32_t>() : 0;
    if (payload["supervisorNames"].is<JsonArray>())
    {
        JsonArray names = payload["supervisorNames"].as<JsonArray>();
        for (JsonVariant name : names)
        {
            if (result.supervisorCount >= MAX_INTRODUCERS)
            {
                break;
            }
            result.supervisorNames[result.supervisorCount++] = name.as<std::string>();
        }
    }
    this->supervisionRequestResultCallback(result);
}

void API::onSupervisorCardAuthenticationData(JsonObject data)
{
    if (this->supervisorCardAuthenticationResponseCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    SupervisorCardAuthenticationResponse response;
    response.error = payload["error"].is<const char *>() ? payload["error"].as<std::string>() : std::string("");
    response.username = payload["username"].is<const char *>() ? payload["username"].as<std::string>() : std::string("");
    response.keyNo = payload["keyNo"].is<uint8_t>() ? payload["keyNo"].as<uint8_t>() : 0;

    std::string keyHex = payload["key"].is<const char *>() ? payload["key"].as<std::string>() : std::string("");
    if (keyHex.length() == 32)
    {
        uint8_t keyBytes[16];
        if (stringToHexArray(keyHex, keyBytes, 16))
        {
            memcpy(response.keyBytes, keyBytes, 16);
            response.keyLen = 16;
        }
        else if (response.error.length() == 0)
        {
            response.error = "Invalid hex key";
        }
    }
    else if (keyHex.length() > 0 && response.error.length() == 0)
    {
        response.error = "Invalid key length";
    }

    this->supervisorCardAuthenticationResponseCallback(response);
}

void API::onSupervisionResolved(JsonObject data)
{
    if (this->supervisionResolvedCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    SupervisionResolvedResult result;
    result.success = payload["success"].is<bool>() ? payload["success"].as<bool>() : false;
    result.error = payload["error"].is<const char *>() ? payload["error"].as<std::string>() : std::string("");
    result.supervisorUsername = payload["supervisorUsername"].is<const char *>() ? payload["supervisorUsername"].as<std::string>() : std::string("");
    this->supervisionResolvedCallback(result);
}
