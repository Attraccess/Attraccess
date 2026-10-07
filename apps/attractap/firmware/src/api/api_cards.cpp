// Card authentication data exchange and new-card enrollment protocol handlers
// FEATURE: api-card-auth

#include "api.hpp"
#include <functional>
#include <cstring>
#include <string>

void API::requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId)
{
    this->logger.info("Requesting card authentication data");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["uid"] = hexToString(uid, uidLength);
    payload["resourceId"] = resourceId;
    this->sendMessage("REQUEST_CARD_AUTHENTICATION_DATA", payload);
}

void API::onCardAuthenticationDetailsResponse(JsonObject data)
{
    this->logger.info("Received card authentication details response");
    if (this->cardAuthenticationDetailsResponseCallback == nullptr)
    {
        this->logger.error("Card authentication details response callback is not set");
        return;
    }
    // Extract fields safely and emit typed values
    JsonObject payload = data["payload"].as<JsonObject>();
    std::string error = payload["error"].is<const char *>() ? payload["error"].as<std::string>() : std::string("");
    std::string username = payload["username"].is<const char *>() ? payload["username"].as<std::string>() : std::string("");
    uint8_t keyNo = payload["keyNo"].is<uint8_t>() ? payload["keyNo"].as<uint8_t>() : 0;
    std::string keyHex = payload["key"].is<const char *>() ? payload["key"].as<std::string>() : std::string("");

    uint8_t keyBytes[16];
    uint8_t keyLen = 0;
    if (keyHex.length() == 32)
    {
        if (stringToHexArray(keyHex, keyBytes, 16))
        {
            keyLen = 16;
        }
        else
        {
            error = "Invalid hex key";
        }
    }
    else if (keyHex.length() > 0)
    {
        error = "Invalid key length";
    }

    CardAuthenticationDetailsResponse response;
    response.keyNo = keyNo;
    if (keyLen == 16)
    {
        memcpy(response.keyBytes, keyBytes, 16);
    }
    else
    {
        memset(response.keyBytes, 0, 16);
    }
    response.keyLen = keyLen;
    response.error = error;
    response.username = username;
    response.canManageResource = payload["canManageResource"].is<bool>() ? payload["canManageResource"].as<bool>() : false;
    response.hasIntroduction = payload["hasIntroduction"].is<bool>() ? payload["hasIntroduction"].as<bool>() : false;
    response.isIntroducer = payload["isIntroducer"].is<bool>() ? payload["isIntroducer"].as<bool>() : false;
    response.supervisionMode = payload["supervisionMode"].is<const char *>() ? payload["supervisionMode"].as<std::string>() : std::string("");
    response.requiresSupervisor = payload["requiresSupervisor"].is<bool>() ? payload["requiresSupervisor"].as<bool>() : false;
    this->cardAuthenticationDetailsResponseCallback(response);
}

// --- Two-card supervision (ATT-493) ----------------------------------------------------------


void API::setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback)
{
    this->cardAuthenticationDetailsResponseCallback = callback;
}
