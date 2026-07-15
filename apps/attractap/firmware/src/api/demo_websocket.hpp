#pragma once

#ifdef DEMO_MODE

#include <functional>
#include <string>
#include <queue>
#include <map>
#include <ctime>
#include <ArduinoJson.h>
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

    // ---- In-memory demo "server" state (survives until reboot) ----
    struct DemoSession
    {
        bool active = false;
        std::string user; // display name of the owner
        time_t startEpoch = 0;
    };
    DemoSession _sessions[DemoStore::RESOURCE_COUNT];

    // Context of the most recently authenticated card, so START/STOP can be
    // attributed to "the current user".
    std::string _currentUser = "Demo";
    bool _currentCanManage = false;

    // Resource lists are only accepted by the client when messageId strictly
    // increases; bump this on every push.
    uint32_t _resourceListMsgId = 0;

    // Draft answers for the CNC start form (fieldId -> value), like the real
    // server's per-socket form draft. Cleared once the session starts.
    std::map<uint32_t, std::string> _cncDraft;

    void enqueue(const std::string &msg);
    void processOutbound(const char *data, size_t len);
    void handleClientMessage(const std::string &type, const std::string &rawPayload);
    void respondAuthenticated();
    void respondResourceList();
    void respondCardAuth(const std::string &uidHex, uint32_t resourceId);
    void respondActionSuccess(const std::string &type);

    void respondProjects(uint32_t page);
    void handleStartSession(uint32_t resourceId, uint32_t projectId, bool forceTakeOver);
    void handleStopSession(uint32_t resourceId);
    void respondFormRequest(uint32_t resourceId);
    void respondFormFields(uint32_t resourceId, const char *action, uint32_t formId, uint32_t offset);
    void respondFormPageResult(JsonObjectConst data);
    int sessionIndexForResource(uint32_t resourceId);
    bool cncFormComplete() const;
};

#endif // DEMO_MODE
