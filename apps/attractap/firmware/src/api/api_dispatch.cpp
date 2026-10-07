#include "api.hpp"
#include <cstring>

void API::dispatchIncomingEvent(const char *eventType, uint32_t requestId)
{
    if (strcmp(eventType, "READER_REGISTER") == 0)
    {
        this->onRegistrationData(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_UNAUTHORIZED") == 0)
    {
        this->onUnauthorized(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_AUTHENTICATED") == 0)
    {
        this->onReaderAuthenticated(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_REQUEST_AUTHENTICATION") == 0)
    {
        this->sendAuthenticationRequest();
    }
    else if (strcmp(eventType, "RESOURCE_USAGE_STATS") == 0)
    {
        this->onUsageStats(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESOURCE_LIST") == 0)
    {
        this->onResourceList(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "CARD_AUTHENTICATION_DATA") == 0)
    {
        this->onCardAuthenticationDetailsResponse(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "SUPERVISION_REQUEST") == 0)
    {
        this->onSupervisionRequestResult(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "SUPERVISION_START") == 0)
    {
        this->onSupervisionStart(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "SUPERVISOR_CARD_AUTHENTICATION_DATA") == 0)
    {
        this->onSupervisorCardAuthenticationData(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "SUPERVISION_RESOLVED") == 0)
    {
        this->onSupervisionResolved(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO") == 0)
    {
        this->onEnrollNewCardGetAvailableKeyNo(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "ENROLL_NEW_CARD") == 0)
    {
        this->onEnrollNewCard(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "ENROLL_NEW_CARD_REQUEST_NFC_KEY") == 0)
    {
        // The server only sends us this event to report an error; the happy
        // path responds with ENROLL_NEW_CARD instead.
        this->onEnrollNewCardRequestNFCKeyError(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESET_NFC_CARD") == 0)
    {
        this->onResetNfcCard(inboundDoc["data"].as<JsonObject>());
    }
    else if (
        strcmp(eventType, "START_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(eventType, "STOP_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(eventType, "LOCK_DOOR") == 0 ||
        strcmp(eventType, "UNLOCK_DOOR") == 0 ||
        strcmp(eventType, "UNLATCH_DOOR") == 0 ||
        strcmp(eventType, "TRIGGER_FLOW_BUTTON") == 0)
    {
        // Generic action result handling
        bool success = false;
        if (inboundDoc["data"]["payload"].is<JsonObject>())
        {
            JsonObject payload = inboundDoc["data"]["payload"].as<JsonObject>();
            if (payload["success"].is<bool>())
            {
                success = payload["success"].as<bool>();
            }
        }
        if (this->actionResultCallback)
        {
            ActionResult result{eventType, success, requestId, {}, false};
            JsonObject summary = inboundDoc["data"]["payload"]["billingSummary"].as<JsonObject>();
            if (success && strcmp(eventType, "STOP_RESOURCE_USAGE_SESSION") == 0 &&
                summary["amount"].is<int64_t>() && summary["amount"].as<int64_t>() != 0 &&
                summary["total"].is<const char *>())
                result.billingTotal = summary["total"].as<std::string>();
            this->actionResultCallback(result);
        }
    }
    else if (strcmp(eventType, "READER_FIRMWARE_UPDATE_REQUIRED") == 0)
    {
#ifdef ATTRACTAP_HOST
        // The simulator deliberately cannot alter firmware, flash, or boot state.
        logger.error("Firmware updates are unsupported by the desktop simulator");
        if (this->errorCallback)
            this->errorCallback("Firmware update", "Firmware updates are not available in the desktop simulator.");
#else
        // Initialize OTA from metadata and request first chunk
        JsonObject fw = inboundDoc["data"]["payload"]["available"].as<JsonObject>();
        if (fw.isNull())
        {
            logger.error("Firmware update required event missing available firmware payload");
            return;
        }
        this->firmware.begin(fw);
#endif
    }
    else if (strcmp(eventType, "PROJECTS_OF_USER") == 0)
    {
        this->onProjectsOfUserResponse(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_CRASH_REPORT") == 0)
    {
        this->onCrashReportResponse(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESOURCE_USAGE_FORM_REQUEST") == 0)
    {
        this->onResourceUsageFormRequest(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESOURCE_USAGE_FORM_FIELDS") == 0)
    {
        this->onResourceUsageFormFields(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESOURCE_USAGE_FORM_PAGE_RESULT") == 0)
    {
        this->onResourceUsageFormPageResult(inboundDoc["data"].as<JsonObject>());
    }
    else
    {
        logger.error((std::string("Unknown event type: ") + eventType).c_str());
    }
}
