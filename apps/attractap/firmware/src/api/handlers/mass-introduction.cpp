// Mass introduction (ATT-1151) wire messages: scan-screen arming and per-card verification
// FEATURE: api-mass-introduction

#include "../api.hpp"
#include <cstring>
#include <string>

namespace
{
std::string stringField(JsonObject payload, const char *key)
{
    return payload[key].is<const char *>() ? payload[key].as<std::string>() : std::string("");
}
}

void API::requestMassIntroductionCardAuthenticationData(const char *sessionId, const uint8_t *uid, uint8_t uidLength)
{
    this->logger.info("Requesting mass introduction card authentication data");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["sessionId"] = sessionId;
    payload["uid"] = hexToString(uid, uidLength);
    this->sendMessage("REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA", payload);
}

void API::confirmMassIntroductionCardAuth(const char *sessionId, const uint8_t *uid, uint8_t uidLength)
{
    this->logger.info("Confirming mass introduction card authentication");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["sessionId"] = sessionId;
    payload["uid"] = hexToString(uid, uidLength);
    this->sendMessage("MASS_INTRODUCTION_CARD_AUTH_CONFIRMED", payload);
}

void API::cancelMassIntroduction(const char *sessionId)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["sessionId"] = sessionId;
    this->sendMessage("MASS_INTRODUCTION_CANCEL", payload);
}

void API::setMassIntroductionStartCallback(std::function<void(const MassIntroductionStartCommand &)> callback)
{
    this->massIntroductionStartCallback = callback;
}

void API::setMassIntroductionCardAuthenticationCallback(
    std::function<void(const MassIntroductionCardAuthenticationResponse &)> callback)
{
    this->massIntroductionCardAuthenticationCallback = callback;
}

void API::setMassIntroductionResultCallback(std::function<void(const MassIntroductionResult &)> callback)
{
    this->massIntroductionResultCallback = callback;
}

void API::setMassIntroductionEndCallback(std::function<void(const MassIntroductionEnd &)> callback)
{
    this->massIntroductionEndCallback = callback;
}

void API::onMassIntroductionStart(JsonObject data)
{
    if (this->massIntroductionStartCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    MassIntroductionStartCommand command;
    command.sessionId = stringField(payload, "sessionId");
    command.targetName = stringField(payload, "targetName");
    command.introducerUsername = stringField(payload, "introducerUsername");
    command.remainingMs = payload["remainingMs"].is<uint32_t>() ? payload["remainingMs"].as<uint32_t>() : 0;
    this->massIntroductionStartCallback(command);
}

void API::onMassIntroductionCardAuthenticationData(JsonObject data)
{
    if (this->massIntroductionCardAuthenticationCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    MassIntroductionCardAuthenticationResponse response;
    response.sessionId = stringField(payload, "sessionId");
    response.error = stringField(payload, "error");
    response.username = stringField(payload, "username");
    response.keyNo = payload["keyNo"].is<uint8_t>() ? payload["keyNo"].as<uint8_t>() : 0;

    // Same key encoding as the supervisor card flow: 16 bytes as 32 hex characters.
    const std::string keyHex = stringField(payload, "key");
    if (keyHex.length() == 32 && stringToHexArray(keyHex, response.keyBytes, 16))
    {
        response.keyLen = 16;
    }
    else if (response.error.empty())
    {
        response.error = keyHex.empty() ? "KEY_NOT_SET" : "Invalid key";
    }
    this->massIntroductionCardAuthenticationCallback(response);
}

void API::onMassIntroductionResult(JsonObject data)
{
    if (this->massIntroductionResultCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    MassIntroductionResult result;
    result.sessionId = stringField(payload, "sessionId");
    result.error = stringField(payload, "error");
    result.success = result.error.empty() && payload["success"].is<bool>() && payload["success"].as<bool>();
    result.username = stringField(payload, "username");
    result.alreadyIntroduced = payload["alreadyIntroduced"].is<bool>() && payload["alreadyIntroduced"].as<bool>();
    result.participantCount =
        payload["participantCount"].is<uint32_t>() ? payload["participantCount"].as<uint32_t>() : 0;
    this->massIntroductionResultCallback(result);
}

void API::onMassIntroductionEnd(JsonObject data)
{
    if (this->massIntroductionEndCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    MassIntroductionEnd end;
    end.sessionId = stringField(payload, "sessionId");
    end.reason = stringField(payload, "reason");
    this->massIntroductionEndCallback(end);
}
