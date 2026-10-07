#include "api.hpp"
#include <cstring>

void API::processIncomingMessage(const char *buf, size_t len)
{
    // Parse into persistent inboundDoc to avoid deep stack usage in websocket task (no filter; server sends only needed fields)
    inboundDoc.clear();
    auto err = deserializeJson(inboundDoc, buf, len);
    if (err)
    {
        logger.error((std::string("JSON parse error: ") + err.c_str()).c_str());
        return;
    }

    const char *topLevelEvent = inboundDoc["event"].as<const char *>();
    if (topLevelEvent && strcmp(topLevelEvent, "HEARTBEAT") == 0)
    {
        return;
    }

    const char *eventType = inboundDoc["data"]["type"].as<const char *>();
    if (!eventType)
    {
        logger.error((std::string("Missing event type, payload: ") + std::string(buf, len)).c_str());
        return;
    }

    const bool isActionResponse = strcmp(eventType, "START_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(eventType, "STOP_RESOURCE_USAGE_SESSION") == 0 || strcmp(eventType, "LOCK_DOOR") == 0 ||
        strcmp(eventType, "UNLOCK_DOOR") == 0 || strcmp(eventType, "UNLATCH_DOOR") == 0 ||
        strcmp(eventType, "TRIGGER_FLOW_BUTTON") == 0;
    const bool isActionFormRequest = strcmp(eventType, "RESOURCE_USAGE_FORM_REQUEST") == 0;
    const uint32_t requestId = inboundDoc["data"]["payload"]["requestId"] | 0u;
    // A cancelled/timed-out request must not complete a later action, even on
    // the same resource. Untagged replies remain compatible with older APIs.
    if ((isActionResponse || isActionFormRequest) && !isCurrentResourceAction(requestId)) {
        this->sendAck(eventType);
        return;
    }

    // Crash-report responses carry their own error codes (e.g. INVALID_CRASH_REPORT)
    // that must not surface as a user-facing error dialog; route them to the handler.
    bool isCrashReportEvent = strcmp(eventType, "READER_CRASH_REPORT") == 0;

    // Enrollment key-request errors (e.g. CARD_ALREADY_ENROLLED) must reach the
    // enrollment handler so it can show the in-screen message and re-arm card
    // detection. The generic interceptor would otherwise pop a generic dialog
    // and return before recovery runs, wedging the reader with detection off
    // until enrollment times out (ATT-503).
    bool isEnrollKeyRequestEvent = strcmp(eventType, "ENROLL_NEW_CARD_REQUEST_NFC_KEY") == 0;

    // Two-card supervision errors (e.g. SUPERVISOR_NOT_AUTHORIZED, NO_SUPERVISORS_AVAILABLE) are
    // recoverable in-flow: the supervision screen surfaces them and either keeps waiting or aborts
    // cleanly. Route them to the dedicated handlers instead of the generic error dialog (ATT-493).
    bool isSupervisionEvent = strcmp(eventType, "SUPERVISION_REQUEST") == 0 ||
                              strcmp(eventType, "SUPERVISION_START") == 0 ||
                              strcmp(eventType, "SUPERVISOR_CARD_AUTHENTICATION_DATA") == 0 ||
                              strcmp(eventType, "SUPERVISION_RESOLVED") == 0;

    // Early error handling: if payload.error is present and non-empty, raise error callback and stop
    // Background stats failures must not interrupt start/stop controls with a popup.
    const bool isUsageStatsEvent = strcmp(eventType, "RESOURCE_USAGE_STATS") == 0;
    if (!isUsageStatsEvent && !isCrashReportEvent && !isEnrollKeyRequestEvent && !isSupervisionEvent &&
        inboundDoc["data"]["payload"].is<JsonObject>())
    {
        JsonObject payload = inboundDoc["data"]["payload"].as<JsonObject>();
        if (payload["error"].is<const char *>())
        {
            std::string err = payload["error"].as<std::string>();
            if (err.length() > 0)
            {
                if (isActionResponse && this->actionResultCallback) {
                    this->actionResultCallback({eventType, false, requestId, err, payload["sumUpEnabled"] | false});
                    this->sendAck(eventType);
                    return;
                }
                // Special-case insufficient balance: propagate sumUpEnabled flag if present
                if (err == "INSUFFICIENT_BALANCE")
                {
                    bool sumUpEnabled = payload["sumUpEnabled"].is<bool>() ? payload["sumUpEnabled"].as<bool>() : false;
                    if (this->insufficientBalanceCallback)
                    {
                        this->insufficientBalanceCallback(sumUpEnabled);
                    }
                }
                else
                {
                    if (this->errorCallback)
                    {
                        this->errorCallback("Fehler", translateReaderError(err).c_str());
                    }
                }
                // Do not process further
                this->sendAck(eventType);
                return;
            }
        }
    }

    this->sendAck(eventType);

    dispatchIncomingEvent(eventType, requestId);
}
