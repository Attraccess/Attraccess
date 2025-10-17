#pragma once

#include <ArduinoJson.h>
#include "../settings/settings.hpp"
#include "state/state.hpp"
#include "../logger/logger.hpp"
#include "../websocket/websocket.hpp"
#include "../utils.hpp"

class API
{
public:
    API() : logger("API") {}

    void setup();
    void loop();
    void processIncomingMessages(String message);
    void setResourceListUpdateCallback(std::function<void(JsonArray)> callback);
    void requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength);
    void setCardAuthenticationDetailsResponseCallback(std::function<void(uint8_t, const uint8_t *, uint8_t, String)> callback);

    void setEnrollNewCardGetAvailableKeyNoCallback(std::function<bool(String username, uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo)> callback);
    void setEnrollNewCardCallback(std::function<bool(uint8_t keyNo, String key)> callback);

    void sendEnrollNewCardAvailableKeyNo(uint8_t *uid, uint8_t uidLength, uint8_t keyNo);
    void sendEnrollNewCard(bool success);

    void startResourceUsageSession(uint32_t resourceId);
    void stopResourceUsageSession(uint32_t resourceId);
    void lockDoor(uint32_t resourceId);
    void unlockDoor(uint32_t resourceId);
    void unlatchDoor(uint32_t resourceId);

    void onDeviceName(std::function<void(String)> callback);

private:
    Logger logger;
    Websocket websocket;

    void updateSateInfo();

    bool loopIsEnabled = false;

    unsigned long heartbeat_sent_at = 0;
    bool isRegistered();

    std::function<void(JsonArray)> resourceListUpdateCallback;
    // (keyNo, keyBytes, keyLen, error). error is empty when no error
    std::function<void(uint8_t, const uint8_t *, uint8_t, String)> cardAuthenticationDetailsResponseCallback;

    std::function<void(String)> deviceNameCallback;

    void sendAck(const char *type);
    void sendMessage(const char *type);
    void sendMessage(const char *type, JsonObject payload);
    void sendHeartbeat();

    void onRegistrationData(JsonObject data);
    void onUnauthorized(JsonObject data);
    void sendAuthenticationRequest();
    void onReaderAuthenticated(JsonObject data);
    void sendFirmwareInfo();
    void onResourceList(JsonObject data);
    void onCardAuthenticationDetailsResponse(JsonObject data);

    std::function<bool(String username, uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo)> enrollNewCardGetAvailableKeyNoCallback;
    std::function<bool(uint8_t keyNo, String key)> enrollNewCardCallback;

    void onEnrollNewCardGetAvailableKeyNo(JsonObject data);
    void onEnrollNewCard(JsonObject data);
};