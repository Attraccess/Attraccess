#include "api.hpp"

void API::triggerFlowButton(uint32_t resourceId, const char *buttonId)
{
    this->logger.info("Triggering flow button");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["buttonId"] = buttonId ? buttonId : "";
    this->sendMessage("TRIGGER_FLOW_BUTTON", payload);
}

void API::requestBillingTopup(uint32_t amountCents)
{
    this->logger.info("Requesting billing top-up");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["amountCents"] = amountCents;
    this->sendMessage("BILLING_REQUEST_TOPUP", payload);
}

void API::setResourceListUpdateCallback(std::function<void(const ResourceList &)> callback)
{
    this->resourceListUpdateCallback = callback;
}

void API::requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId)
{
    this->logger.info("Requesting card authentication data");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["uid"] = hexToString(uid, uidLength);
    payload["resourceId"] = resourceId;
    this->sendMessage("REQUEST_CARD_AUTHENTICATION_DATA", payload);
}

void API::setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback)
{
    this->cardAuthenticationDetailsResponseCallback = callback;
}

void API::startResourceUsageSession(uint32_t resourceId, uint32_t projectId, const FormSubmissionList *formSubmissions)
{
    this->logger.info("Starting resource usage session");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    if (projectId != 0)
    {
        payload["projectId"] = projectId;
    }
    this->serializeFormSubmissions(payload, formSubmissions);
    this->sendMessage("START_RESOURCE_USAGE_SESSION", payload);
}

void API::stopResourceUsageSession(uint32_t resourceId, const FormSubmissionList *formSubmissions)
{
    this->logger.info("Stopping resource usage session");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->serializeFormSubmissions(payload, formSubmissions);
    this->sendMessage("STOP_RESOURCE_USAGE_SESSION", payload);
}

void API::lockDoor(uint32_t resourceId)
{
    this->logger.info("Locking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("LOCK_DOOR", payload);
}

void API::unlockDoor(uint32_t resourceId)
{
    this->logger.info("Unlocking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("UNLOCK_DOOR", payload);
}

void API::unlatchDoor(uint32_t resourceId)
{
    this->logger.info("Unlatching door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("UNLATCH_DOOR", payload);
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

void API::onDeviceName(std::function<void(String)> callback)
{
    this->deviceNameCallback = callback;
}

void API::disableConnectionAttempts()
{
    this->websocket.disableConnectionAttempts();
    this->loopIsEnabled = false;
}

void API::enableConnectionAttempts()
{
    this->websocket.enableConnectionAttempts();
}

void API::requestProjectsOfUser(uint32_t page)
{
    this->logger.info("Requesting projects of user");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["page"] = page;
    payload["limit"] = MAX_PROJECTS_PER_PAGE;
    this->lastRequestedProjectsOfUserPage = page;
    this->sendMessage("PROJECTS_OF_USER", payload);
}

void API::setProjectsOfUserResponseCallback(std::function<void(const ProjectsOfUserResponse &)> callback)
{
    this->projectsOfUserResponseCallback = callback;
}

void API::setResourceFormsRequestCallback(std::function<void(const ResourceUsageFormRequest &)> callback)
{
    this->resourceFormsRequestCallback = callback;
}
