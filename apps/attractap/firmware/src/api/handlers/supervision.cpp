#include "../api.hpp"
#include "display-name.hpp"
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
    command.requesterDisplayName = displayNameOr(payload["requesterDisplayName"], command.requesterUsername);
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
    // Display names come in the same order; an older server sends none, then the usernames are shown.
    for (uint8_t i = 0; i < result.supervisorCount; ++i)
    {
        result.supervisorDisplayNames[i] = displayNameOr(payload["supervisorDisplayNames"][i], result.supervisorNames[i]);
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
    response.displayName = displayNameOr(payload["displayName"], response.username);

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
    result.supervisorDisplayName = displayNameOr(payload["supervisorDisplayName"], result.supervisorUsername);
    this->supervisionResolvedCallback(result);
}
