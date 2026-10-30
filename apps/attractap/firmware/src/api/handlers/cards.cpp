// Card authentication data exchange and new-card enrollment protocol handlers
// FEATURE: api-card-auth

#include "../api.hpp"
#include <functional>
#include <cstring>
#include <string>

void API::sendCardDetected(const char *purpose, const uint8_t *uid, uint8_t uidLength, uint32_t resourceId,
                           const char *sessionId)
{
    if (this->cardConversationStartCallback != nullptr)
    {
        this->cardConversationStartCallback();
    }
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["purpose"] = purpose;
    payload["uid"] = hexToString(const_cast<uint8_t *>(uid), uidLength);
    if (resourceId != 0)
    {
        payload["resourceId"] = resourceId;
    }
    if (sessionId != nullptr)
    {
        payload["sessionId"] = sessionId;
    }
    this->sendMessage("CARD_DETECTED", payload);
}

void API::sendCardApduResponse(const char *conversationId, uint32_t seq, const uint8_t *response, uint8_t length)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["conversationId"] = conversationId;
    payload["seq"] = seq;
    payload["response"] = hexToString(const_cast<uint8_t *>(response), length);
    this->sendMessage("CARD_APDU_RESPONSE", payload);
}

void API::sendCardRemoved(const char *conversationId)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["conversationId"] = conversationId;
    this->sendMessage("CARD_REMOVED", payload);
}

void API::sendReaderSessionEnded()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage("READER_SESSION_ENDED", payload);
}

void API::setCardApduCallback(
    std::function<void(const char *conversationId, uint32_t seq, const uint8_t *apdu, uint8_t length)> callback)
{
    this->cardApduCallback = callback;
}

void API::setCardConversationStartCallback(std::function<void()> callback)
{
    this->cardConversationStartCallback = callback;
}

void API::setCardConversationEndCallback(std::function<void(const char *conversationId)> callback)
{
    this->cardConversationEndCallback = callback;
}

// Runs on the websocket task and is not ACKed: the server does not wait for one, and an extra
// message per APDU would only add latency to the tap.
void API::onCardApdu(JsonObject data)
{
    if (this->cardApduCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    const char *conversationId = payload["conversationId"].is<const char *>() ? payload["conversationId"].as<const char *>() : nullptr;
    const char *apduHex = payload["apdu"].is<const char *>() ? payload["apdu"].as<const char *>() : nullptr;
    if (conversationId == nullptr || apduHex == nullptr || !payload["seq"].is<uint32_t>())
    {
        return;
    }
    const size_t hexLength = strlen(apduHex);
    if (hexLength == 0 || hexLength % 2 != 0 || hexLength > 2 * 62)
    {
        return;
    }
    uint8_t apdu[62];
    if (!stringToHexArray(std::string(apduHex), apdu, hexLength / 2))
    {
        return;
    }
    this->cardApduCallback(conversationId, payload["seq"].as<uint32_t>(), apdu, static_cast<uint8_t>(hexLength / 2));
}

void API::onCardConversationEnd(JsonObject data)
{
    if (this->cardConversationEndCallback == nullptr)
    {
        return;
    }
    JsonObject payload = data["payload"].as<JsonObject>();
    if (payload["conversationId"].is<const char *>())
    {
        this->cardConversationEndCallback(payload["conversationId"].as<const char *>());
    }
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

    CardAuthenticationDetailsResponse response;
    response.error = error;
    response.username = username;
    response.language = payload["language"].is<const char *>() ? payload["language"].as<std::string>() : "en";
    // The server supplies a canonical fallback for older readers. New readers
    // retain its fallback status so live default changes also affect this session.
    if (payload["languageFallback"].is<bool>() && payload["languageFallback"].as<bool>()) response.language.clear();
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

void API::setEnrollNewCardGetAvailableKeyNoCallback(std::function<void(std::string username)> callback)
{
    this->enrollNewCardGetAvailableKeyNoCallback = callback;
}

void API::setEnrollNewCardSucceededCallback(std::function<void()> callback)
{
    this->enrollNewCardSucceededCallback = callback;
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

void API::setResetNfcCardCallback(std::function<void(std::string username)> callback)
{
    this->resetNfcCardCallback = callback;
}

void API::setResetNfcCardResultCallback(std::function<void(bool success, std::string error)> callback)
{
    this->resetNfcCardResultCallback = callback;
}

void API::sendResetNfcCardCancel()
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage("RESET_NFC_CARD_CANCEL", payload);
}

void API::onResetNfcCard(JsonObject data)
{
    JsonObject payload = data["payload"].as<JsonObject>();
    std::string error = payload["error"].is<const char *>() ? payload["error"].as<std::string>() : std::string("");
    if (error.length() > 0 || (payload["success"].is<bool>() && payload["success"].as<bool>()))
    {
        // The server's verdict after it reset (or failed to reset) the card through the relay.
        const bool success = error.length() == 0;
        if (!success)
        {
            this->logger.error(("Reset nfc card error from server: " + error).c_str());
        }
        if (this->resetNfcCardResultCallback != nullptr)
        {
            this->resetNfcCardResultCallback(success, error);
        }
        return;
    }

    // Arms the reset screen: the next card is reset by the server.
    if (this->resetNfcCardCallback == nullptr)
    {
        this->logger.error("Reset nfc card callback is not set");
        return;
    }
    std::string username = payload["username"].is<const char *>() ? payload["username"].as<std::string>() : std::string("");
    this->resetNfcCardCallback(username);
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
    JsonObject payload = data["payload"].as<JsonObject>();
    std::string error = payload["error"].is<const char *>() ? payload["error"].as<std::string>() : std::string("");
    if (error.length() > 0)
    {
        // The server could not confirm the card (not enrolled, nothing was recorded).
        this->logger.error(("Enroll new card error from server: " + error).c_str());
        if (this->enrollNewCardErrorCallback != nullptr)
        {
            this->enrollNewCardErrorCallback(error);
        }
        return;
    }
    if (payload["success"].is<bool>() && payload["success"].as<bool>() && this->enrollNewCardSucceededCallback != nullptr)
    {
        this->enrollNewCardSucceededCallback();
    }
}
