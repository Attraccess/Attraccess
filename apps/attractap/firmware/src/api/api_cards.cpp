// Card authentication data exchange and new-card enrollment protocol handlers
// FEATURE: api-card-auth

#include "api.hpp"

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
    String error = payload["error"].is<String>() ? payload["error"].as<String>() : String("");
    String username = payload["username"].is<String>() ? payload["username"].as<String>() : String("");
    uint8_t keyNo = payload["keyNo"].is<uint8_t>() ? payload["keyNo"].as<uint8_t>() : 0;
    String keyHex = payload["key"].is<String>() ? payload["key"].as<String>() : String("");

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
    this->cardAuthenticationDetailsResponseCallback(response);
}

void API::setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback)
{
    this->cardAuthenticationDetailsResponseCallback = callback;
}

void API::setEnrollNewCardGetAvailableKeyNoCallback(std::function<void(String username)> callback)
{
    this->enrollNewCardGetAvailableKeyNoCallback = callback;
}

void API::setEnrollNewCardCallback(std::function<void(uint8_t keyNo, String key)> callback)
{
    this->enrollNewCardCallback = callback;
}

void API::sendEnrollNewCardAvailableKeyNo(uint8_t *uid, uint8_t uidLength, uint8_t keyNo)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["keyNo"] = keyNo;
    payload["uid"] = hexToString(uid, uidLength);
    // Respond with the client-to-server request event so the server can generate the key
    this->sendMessage("ENROLL_NEW_CARD_REQUEST_NFC_KEY", payload);
}

void API::sendEnrollNewCard(bool success)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["success"] = success;
    this->sendMessage("ENROLL_NEW_CARD", payload);
}

void API::onEnrollNewCardGetAvailableKeyNo(JsonObject data)
{
    this->logger.info("Received enroll new card available key no");
    if (this->enrollNewCardGetAvailableKeyNoCallback == nullptr)
    {
        this->logger.error("Enroll new card available key no callback is not set");
        return;
    }

    String username = data["payload"]["username"].as<String>();

    this->enrollNewCardGetAvailableKeyNoCallback(username);
}

void API::onEnrollNewCard(JsonObject data)
{
    this->logger.info("Received enroll new card");
    if (this->enrollNewCardCallback == nullptr)
    {
        this->logger.error("Enroll new card callback is not set");
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    if (payload["error"].is<String>() && payload["error"].as<String>().length() > 0)
    {
        // TODO: handle enrollment errors (surface to UI, retry flow, etc.)
        this->logger.error(("Enroll new card error from server: " + payload["error"].as<String>()).c_str());
        return;
    }

    // Only proceed when command payload contains the key material
    if (!(payload["key"].is<String>() && payload["key"].as<String>().length() == 32 && payload["keyNo"].is<uint8_t>()))
    {
        // TODO: handle server-side completion notifications (payload.success) if needed
        this->logger.info("Enroll new card payload does not contain key material; ignoring.");
        return;
    }

    uint8_t keyNo = payload["keyNo"].as<uint8_t>();
    String key = payload["key"].as<String>();

    this->enrollNewCardCallback(keyNo, key);
}
