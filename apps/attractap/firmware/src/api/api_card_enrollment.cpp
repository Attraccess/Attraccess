#include "api.hpp"
#include <functional>
#include <cstring>
#include <string>

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
