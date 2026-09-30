// Only linked with -DATTRACTAP_HIL=ON. Drives public production API methods on
// ESP32 and reports typed callback results; it never claims to read/write a card.
#include "api/api.hpp"
#include <cstdio>
extern API api;

template <typename Fill>
static void report(const char *type, Fill fill)
{
    JsonDocument doc;
    fill(doc);
    std::string json;
    serializeJson(doc, json);
    printf("HIL %s %s\n", type, json.c_str());
}

static void installCallbacks()
{
    api.setActionResultCallback([](const API::ActionResult &r) {
        report("action", [&](JsonDocument &d) { d["type"] = r.type; d["success"] = r.success; d["requestId"] = r.requestId; });
    });
    api.setCardAuthenticationDetailsResponseCallback([](API::CardAuthenticationDetailsResponse r) {
        report("card", [&](JsonDocument &d) { d["username"] = r.username; d["keyNo"] = r.keyNo; d["keyLen"] = r.keyLen; d["requiresSupervisor"] = r.requiresSupervisor; d["error"] = r.error; });
    });
    api.setSupervisorCardAuthenticationResponseCallback([](API::SupervisorCardAuthenticationResponse r) {
        report("supervisor", [&](JsonDocument &d) { d["username"] = r.username; d["keyNo"] = r.keyNo; d["keyLen"] = r.keyLen; d["error"] = r.error; });
    });
    api.setSupervisionRequestResultCallback([](API::SupervisionRequestResult r) {
        report("supervision", [&](JsonDocument &d) { d["success"] = r.success; d["timeoutMs"] = r.timeoutMs; d["count"] = r.supervisorCount; d["name"] = r.supervisorNames[0]; });
    });
    api.setSupervisionResolvedCallback([](API::SupervisionResolvedResult r) {
        report("resolved", [&](JsonDocument &d) { d["success"] = r.success; d["username"] = r.supervisorUsername; });
    });
    api.setEnrollNewCardGetAvailableKeyNoCallback([](std::string username) {
        report("enroll-ready", [&](JsonDocument &d) { d["username"] = username; });
    });
    api.setEnrollNewCardCallback([](uint8_t keyNo, std::string key) {
        report("enroll-key", [&](JsonDocument &d) { d["keyNo"] = keyNo; d["key"] = key; });
    });
    api.setResetNfcCardCallback([](std::string username, uint8_t keyNo, std::string key) {
        report("reset-key", [&](JsonDocument &d) { d["username"] = username; d["keyNo"] = keyNo; d["key"] = key; });
    });
    api.setResourceListUpdateCallback([](const API::ResourceList &r) {
        report("resources", [&](JsonDocument &d) { d["count"] = r.count; if (r.count) { d["id"] = r.items[0].id; d["name"] = r.items[0].name; d["active"] = r.items[0].hasActiveUsage; } });
    });
    api.setProjectsOfUserResponseCallback([](const API::ProjectsOfUserResponse &r) {
        report("projects", [&](JsonDocument &d) { d["page"] = r.page; d["count"] = r.count; if (r.count) { d["id"] = r.items[0].id; d["name"] = r.items[0].name; } });
    });
    api.setResourceFormsRequestCallback([](const API::ResourceUsageFormRequest &r) {
        report("form-request", [&](JsonDocument &d) { d["resourceId"] = r.resourceId; d["count"] = r.formCount; d["formId"] = r.forms[0].id; });
    });
    api.setResourceFormFieldsCallback([](const API::ResourceUsageFormFieldsPage &r) {
        report("form-fields", [&](JsonDocument &d) { d["offset"] = r.offset; d["count"] = r.fieldCount; if (r.fieldCount) { d["id"] = r.fields[0].id; d["name"] = r.fields[0].name; d["type"] = (int)r.fields[0].type; } });
    });
    api.setResourceFormPageResultCallback([](const API::ResourceUsageFormPageResult &r) {
        report("form-result", [&](JsonDocument &d) { d["offset"] = r.offset; d["valid"] = r.valid; d["errors"] = r.errorCount; });
    });
}

bool handleHilCommand(const std::string &topic, JsonObject p)
{
    // A deterministic UID represents API input, not an emulated NFC transaction.
    uint8_t uid[] = {0x04, 0x11, 0x22, 0x33};
    const uint32_t resource = p["resourceId"] | 7u;
    if (topic == "hil.enable") installCallbacks();
    else if (topic == "hil.start") api.startResourceUsageSession(resource, 3);
    else if (topic == "hil.stop") api.stopResourceUsageSession(resource);
    else if (topic == "hil.lock") api.lockDoor(resource);
    else if (topic == "hil.unlock") api.unlockDoor(resource);
    else if (topic == "hil.unlatch") api.unlatchDoor(resource);
    else if (topic == "hil.card") api.requestCardAuthenticationData(uid, sizeof(uid), resource);
    else if (topic == "hil.supervision") api.requestSupervision(resource);
    else if (topic == "hil.supervisor") api.requestSupervisorCardAuthenticationData(uid, sizeof(uid), resource);
    else if (topic == "hil.confirm-supervisor") api.confirmSupervisorCardAuth(resource);
    else if (topic == "hil.enroll-key") api.sendEnrollNewCardAvailableKeyNo(uid, sizeof(uid), 1);
    else if (topic == "hil.enroll-cancel") api.sendEnrollNewCardCancel();
    else if (topic == "hil.reset-cancel") api.sendResetNfcCardCancel();
    else if (topic == "hil.resources") api.requestResourceList();
    else if (topic == "hil.projects") api.requestProjectsOfUser(1);
    else if (topic == "hil.billing") api.requestBillingTopup(500);
    else if (topic == "hil.fields") api.requestFormFields(resource, API::ResourceUsageFormActionType::START, 9, p["offset"] | 0u, 1);
    else if (topic == "hil.submit") {
        API::FormPageSubmission page;
        page.formId = 9;
        page.offset = p["offset"] | 0u;
        page.answerCount = 1;
        page.answers[0].fieldId = p["fieldId"] | 11u;
        page.answers[0].stringValue = "HIL answer";
        api.submitFormPage(resource, API::ResourceUsageFormActionType::START, page);
    }
    else return false;
    return true;
}
