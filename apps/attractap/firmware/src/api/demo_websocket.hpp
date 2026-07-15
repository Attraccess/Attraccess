#pragma once

#ifdef DEMO_MODE

#include <functional>
#include <string>
#include <queue>
#include "../logger/logger.hpp"
#include "../demo/demo_store.hpp"
#include "../utils.hpp"

class DemoWebsocket
{
public:
    DemoWebsocket() : _logger("DemoWebsocket") {}

    void setup();
    void loop();
    void sendMessage(const std::string &message);
    void sendMessage(const char *message, size_t length);
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> callback);

    void enableConnectionAttempts() {}
    void disableConnectionAttempts() {}
    void resetCertificateTrust() {}

private:
    Logger _logger;
    std::function<void(const char *, size_t)> _messageCallback;

    bool _initDone = false;
    // Messages queued to be delivered to the API on the next loop() call.
    std::queue<std::string> _inbound;

    void enqueue(const std::string &msg);
    void processOutbound(const char *data, size_t len);
    void handleClientMessage(const std::string &type, const std::string &rawPayload);
    void respondAuthenticated();
    void respondResourceList();
    void respondCardAuth(const std::string &uidHex, uint32_t resourceId);
    void respondActionSuccess(const std::string &type);
};

#endif // DEMO_MODE
