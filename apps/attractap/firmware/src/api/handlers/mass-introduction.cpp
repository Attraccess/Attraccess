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
