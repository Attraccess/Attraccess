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

void API::cancelSupervision()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage("SUPERVISION_CANCEL", payload);
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

void API::setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback)
{
    this->cardAuthenticationDetailsResponseCallback = callback;
}

void API::setEnrollNewCardGetAvailableKeyNoCallback(std::function<void(std::string username)> callback)
{
    this->enrollNewCardGetAvailableKeyNoCallback = callback;
}

void API::setEnrollNewCardCallback(std::function<void(uint8_t keyNo, std::string key)> callback)
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

void API::sendEnrollNewCardCancel()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage("ENROLL_NEW_CARD_CANCEL", payload);
}

void API::setEnrollNewCardErrorCallback(std::function<void(std::string error)> callback)
{
    this->enrollNewCardErrorCallback = callback;
}

void API::setResetNfcCardCallback(std::function<void(std::string username, uint8_t keyNo, std::string key)> callback)
{
    this->resetNfcCardCallback = callback;
}

void API::sendResetNfcCard(bool success)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["success"] = success;
    this->sendMessage("RESET_NFC_CARD", payload);
}

void API::sendResetNfcCardCancel()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage("RESET_NFC_CARD_CANCEL", payload);
}

void API::onResetNfcCard(JsonObject data)
{
    this->logger.info("Received reset nfc card");
    if (this->resetNfcCardCallback == nullptr)
    {
        this->logger.error("Reset nfc card callback is not set");
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    if (payload["error"].is<const char *>() && payload["error"].as<std::string>().length() > 0)
    {
        this->logger.error(("Reset nfc card error from server: " + payload["error"].as<std::string>()).c_str());
        return;
    }

    // The server hands over the card's stored key material so the reader can
    // authenticate the card and write the factory key back.
    if (!(payload["key"].is<const char *>() && payload["key"].as<std::string>().length() == 32 && payload["keyNo"].is<uint8_t>()))
    {
        this->logger.info("Reset nfc card payload does not contain key material; ignoring.");
        return;
    }

    std::string username = payload["username"].is<const char *>() ? payload["username"].as<std::string>() : std::string("");
    uint8_t keyNo = payload["keyNo"].as<uint8_t>();
    std::string key = payload["key"].as<std::string>();

    this->resetNfcCardCallback(username, keyNo, key);
}

void API::onEnrollNewCardRequestNFCKeyError(JsonObject data)
{
    JsonObject payload = data["payload"].as<JsonObject>();
    std::string error = payload["error"].is<const char *>() ? payload["error"].as<std::string>() : std::string("");
    if (error.length() == 0)
    {
        return;
    }
    this->logger.error(("Enroll new card request key error from server: " + error).c_str());
    if (this->enrollNewCardErrorCallback != nullptr)
    {
        this->enrollNewCardErrorCallback(error);
    }
}

void API::onEnrollNewCardGetAvailableKeyNo(JsonObject data)
{
    this->logger.info("Received enroll new card available key no");
    if (this->enrollNewCardGetAvailableKeyNoCallback == nullptr)
    {
        this->logger.error("Enroll new card available key no callback is not set");
        return;
    }

    std::string username = data["payload"]["username"].as<std::string>();

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
    if (payload["error"].is<const char *>() && payload["error"].as<std::string>().length() > 0)
    {
        // TODO: handle enrollment errors (surface to UI, retry flow, etc.)
        this->logger.error(("Enroll new card error from server: " + payload["error"].as<std::string>()).c_str());
        return;
    }

    // Only proceed when command payload contains the key material
    if (!(payload["key"].is<const char *>() && payload["key"].as<std::string>().length() == 32 && payload["keyNo"].is<uint8_t>()))
    {
        // TODO: handle server-side completion notifications (payload.success) if needed
        this->logger.info("Enroll new card payload does not contain key material; ignoring.");
        return;
    }

    uint8_t keyNo = payload["keyNo"].as<uint8_t>();
    std::string key = payload["key"].as<std::string>();

    this->enrollNewCardCallback(keyNo, key);
}
