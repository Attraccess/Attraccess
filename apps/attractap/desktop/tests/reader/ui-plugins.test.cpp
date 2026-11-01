#include "workflow.hpp"

// ATT-1187: plugin slots, host-owned steps, block reasons and the post-stop question on a touch reader.
// Time jumps use hostAdvanceMillis instead of real waits.
namespace {
std::string slotPayload(int resource, const char *slot, unsigned revision, const std::string &tree,
                        const char *key = "res", const char *extra = "") {
    return std::string("{\"resourceId\":") + std::to_string(resource) + ",\"slot\":\"" + slot + "\",\"revision\":" +
           std::to_string(revision) + ",\"owner\":\"reservations\",\"key\":\"" + key + "\",\"serverNowMs\":1000000" + extra +
           ",\"tree\":" + tree + "}";
}
std::string stepPayload(uint32_t requestId, const char *stepId, const char *kind, int resource, int ttlMs,
                        const std::string &title, const std::string &extra = "") {
    return "{\"requestId\":" + std::to_string(requestId) + ",\"stepId\":\"" + stepId + "\",\"kind\":\"" + kind +
           "\",\"resourceId\":" + std::to_string(resource) + ",\"serverNowMs\":1000000,\"expiresAtMs\":" +
           std::to_string(1000000 + ttlMs) + ",\"title\":\"" + title + "\",\"body\":\"Moechten Sie trotzdem starten?\"" + extra + "}";
}
bool labelStartsWith(lv_obj_t *root, const char *prefix) {
    if (!root) return false;
    if (lv_obj_check_type(root, &lv_label_class) && std::strncmp(lv_label_get_text(root), prefix, std::strlen(prefix)) == 0)
        return true;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (labelStartsWith(lv_obj_get_child(root, i), prefix)) return true;
    return false;
}
const char *STEP_A = "aaaaaaaaaaaaaaaaaaaaaa";
const char *STEP_B = "bbbbbbbbbbbbbbbbbbbbbb";
const char *STEP_C = "cccccccccccccccccccccc";
}

void ReaderWorkflow::testUiPlugins()
{
    list(false);
    // Wait for the boot delay and screen animation to complete on loaded runners.
    const auto bootDeadline = millis() + 10000;
    while (lv_screen_active() != Display::resourceListScreen.getScreen() &&
           static_cast<int32_t>(bootDeadline - millis()) > 0)
        pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    login();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    // --- Slots on the list ---------------------------------------------------------------------
    server.push("UI_SLOT_UPDATE", slotPayload(1, "resourceList.row.status", 1, R"({"t":"badge","text":"Frei bis 14:00","tone":"success"})"), 11);
    pump();
    assert(label(lv_screen_active(), "Frei bis 14:00"));
    assert(server.last("ACK_UI_SLOT_UPDATE")["data"]["messageId"].as<uint32_t>() == 11);
    // A stale revision is still acked (with its own id) and changes nothing.
    server.push("UI_SLOT_UPDATE", slotPayload(1, "resourceList.row.status", 1, R"({"t":"badge","text":"Alt"})"), 12);
    pump();
    assert(!label(lv_screen_active(), "Alt") && server.last("ACK_UI_SLOT_UPDATE")["data"]["messageId"].as<uint32_t>() == 12);
    // Hostile payloads only drop their own slot, and the ack still echoes the id.
    server.push("UI_SLOT_UPDATE", slotPayload(2, "resourceList.row.status", 1, R"({"t":"text","text":"Maintenance"})", "spoof"), 13);
    server.push("UI_SLOT_UPDATE", slotPayload(2, "resourceList.row.status", 2, R"({"t":"image","src":"x"})", "unknown"), 14);
    server.push("UI_SLOT_UPDATE", "\"garbage\"", 15);
    pump();
    assert(server.last("ACK_UI_SLOT_UPDATE")["data"]["messageId"].as<uint32_t>() == 15);
    assert(label(lv_screen_active(), "Frei bis 14:00"));
    assert(server.count("UI_RENDER_REPORT") >= 3);
    // Core status always wins over the plugin line.
    active = true; list();
    assert(!label(lv_screen_active(), "Frei bis 14:00"));
    active = false; list();
    assert(label(lv_screen_active(), "Frei bis 14:00"));

    // --- Slots on details ------------------------------------------------------------------------
    click("Lasercutter");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    server.push("UI_SLOT_UPDATE", slotPayload(1, "resource.details.header", 1,
        R"({"t":"row","gap":8,"c":[{"t":"icon","name":"warning","tone":"warning"},{"t":"text","text":"Reserviert 14:00 - 16:00"}]})"), 21);
    server.push("UI_SLOT_UPDATE", slotPayload(1, "resource.details.body", 1,
        R"({"t":"col","c":[{"t":"countdown","toMs":1090000},{"t":"progress","value":50}]})", "cd"), 22);
    pump();
    assert(label(lv_screen_active(), "Reserviert 14:00 - 16:00"));
    assert(label(lv_screen_active(), "1:30")); // 90 s, counted down locally
    hostAdvanceMillis(10000); pump(1100); // stays under the 30 s sign-in timeout
    assert(!label(lv_screen_active(), "1:30") && labelStartsWith(lv_screen_active(), "1:1"));
    // Slot expiry is server-time based and needs no message.
    server.push("UI_SLOT_UPDATE", slotPayload(1, "resource.details.header", 2, R"({"t":"text","text":"Nur kurz"})", "res", ",\"expiresAtMs\":1005000"), 23);
    pump();
    assert(label(lv_screen_active(), "Nur kurz"));
    hostAdvanceMillis(6000); pump(1100);
    assert(!label(lv_screen_active(), "Nur kurz"));
    // Reconnect clears every slot; revision 1 is accepted again afterwards.
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":"de"})"); pump();
    assert(!label(lv_screen_active(), "Reserviert 14:00 - 16:00"));
    server.push("UI_SLOT_UPDATE", slotPayload(1, "resource.details.header", 1, R"({"t":"text","text":"Wieder da"})"), 31);
    pump();
    assert(label(lv_screen_active(), "Wieder da"));
    std::cout << "PASS plugin slots render, expire, reset and ack with message ids" << std::endl;
    list(); // the server resends the list after authentication
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());

    // --- Confirm step -------------------------------------------------------------------------------
    auto startRequestId = [&] { return server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>(); };
    auto starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Ressource verwenden");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    const auto firstRequest = startRequestId();
    server.push("UI_STEP_REQUEST", stepPayload(firstRequest, STEP_A, "confirm", 1, 120000, "Reserviert ab 14:00"), 41);
    pump();
    assert(label(lv_layer_top(), "Reserviert ab 14:00") && label(lv_layer_top(), "Abbrechen"));
    assert(server.last("ACK_UI_STEP_REQUEST")["data"]["messageId"].as<uint32_t>() == 41);
    // A duplicate (lost ACK) neither reopens nor restarts the step.
    server.push("UI_STEP_REQUEST", stepPayload(firstRequest, STEP_A, "confirm", 1, 120000, "Reserviert ab 14:00"), 41);
    pump();
    // Open for longer than the 60 s action watchdog: no "action not confirmed" popup, still open.
    hostAdvanceMillis(70000); pump();
    assert(label(lv_layer_top(), "Reserviert ab 14:00") && !label(lv_layer_top(), "Aktion nicht bestätigt"));
    click("Start", true);
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 2);
    auto retryDoc = server.last("START_RESOURCE_USAGE_SESSION");
    JsonVariant retry = retryDoc["data"]["payload"];
    assert(retry["stepId"].as<std::string>() == STEP_A && retry["requestId"].as<uint32_t>() != firstRequest);
    assert(!retry["choice"].is<const char *>());
    assert(!label(lv_layer_top(), "Reserviert ab 14:00"));
    // The sign-in timeout still resumes after the step: the START's pause ends with the result.
    server.push("START_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();

    // --- Cancel -------------------------------------------------------------------------------------
    active = false; list(); click("Lasercutter");
    starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Ressource verwenden");
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), STEP_B, "confirm", 1, 60000, "Zweite Frage"), 42);
    pump();
    click(LV_SYMBOL_CLOSE, true);
    auto resultDoc = server.last("UI_STEP_RESULT");
    JsonVariant result = resultDoc["data"]["payload"];
    assert(result["stepId"].as<std::string>() == STEP_B && result["action"].as<std::string>() == "cancel");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    assert(!label(lv_layer_top(), "Zweite Frage") && !label(lv_layer_top(), "Aktion fehlgeschlagen"));
    pump(300);

    // --- Choose + stale step -----------------------------------------------------------------------
    list(); click("Lasercutter");
    click("Ressource verwenden");
    const auto chooseRequest = startRequestId();
    server.push("UI_STEP_REQUEST", stepPayload(chooseRequest + 5, STEP_C, "choose", 1, 60000, "Stale Frage",
        R"(,"choices":[{"id":"a","label":"Option A"}])"));
    pump();
    assert(!label(lv_layer_top(), "Stale Frage")); // answers an older START: dropped
    server.push("UI_STEP_REQUEST", stepPayload(chooseRequest, STEP_C, "choose", 1, 60000, "Welche Variante?",
        R"(,"choices":[{"id":"short","label":"Kurz"},{"id":"long","label":"Lang"}])"));
    pump();
    assert(label(lv_layer_top(), "Kurz") && label(lv_layer_top(), "Lang"));
    click("Lang", true);
    retryDoc = server.last("START_RESOURCE_USAGE_SESSION");
    retry = retryDoc["data"]["payload"];
    assert(retry["stepId"].as<std::string>() == STEP_C && retry["choice"].as<std::string>() == "long");

    // --- Expiry starts nothing ---------------------------------------------------------------------
    server.push("START_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    active = false; list(); click("Lasercutter");
    starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Ressource verwenden");
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), "dddddddddddddddddddddd", "confirm", 1, 10000, "Laeuft ab"));
    pump();
    assert(label(lv_layer_top(), "Laeuft ab"));
    hostAdvanceMillis(11000); pump();
    assert(!label(lv_layer_top(), "Laeuft ab") && server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    // A cancel from the server closes it too.
    pump(300); list(); click("Lasercutter"); click("Ressource verwenden");
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), "eeeeeeeeeeeeeeeeeeeeee", "confirm", 1, 60000, "Wird abgebrochen"));
    pump();
    assert(label(lv_layer_top(), "Wird abgebrochen"));
    server.push("UI_STEP_CANCEL", R"({"stepId":"eeeeeeeeeeeeeeeeeeeeee"})"); pump();
    assert(!label(lv_layer_top(), "Wird abgebrochen"));
    std::cout << "PASS plugin steps confirm, choose, cancel and expire" << std::endl;

    // --- Block shows only the plugin's reason ------------------------------------------------------
    pump(300); list(); click("Lasercutter"); click("Ressource verwenden");
    server.push("START_RESOURCE_USAGE_SESSION", "{\"error\":\"START_BLOCKED\",\"requestId\":" + std::to_string(startRequestId()) +
        R"(,"reason":{"code":"RESERVED","title":"Reserviert","body":"Bis 16:00 von Anna M."}})");
    pump();
    assert(label(lv_layer_top(), "Reserviert") && label(lv_layer_top(), "Bis 16:00 von Anna M."));
    assert(!label(lv_layer_top(), "Aktion fehlgeschlagen") && !label(lv_layer_top(), "Action failed"));
    Display::hidePopup();
    std::cout << "PASS blocked start shows exactly the plugin reason" << std::endl;

    // --- Post-stop question holds the session summary ---------------------------------------------
    active = true; list();
    click("Sitzung beenden");
    server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true,"durationSeconds":60,"endedOwnSession":true})"); pump();
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    server.push("UI_STEP_REQUEST", stepPayload(0, "ffffffffffffffffffffff", "choose", 1, 15000, "Restzeit freigeben?",
        R"(,"choices":[{"id":"keep","label":"Behalten"},{"id":"free","label":"Freigeben"}])"), 51);
    pump();
    assert(label(lv_layer_top(), "Restzeit freigeben?"));
    hostAdvanceMillis(5000); pump(300); // past the 3.5 s auto-dismiss
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen() && label(lv_layer_top(), "Freigeben"));
    click("Freigeben", true);
    resultDoc = server.last("UI_STEP_RESULT");
    result = resultDoc["data"]["payload"];
    assert(result["stepId"].as<std::string>() == "ffffffffffffffffffffff" && result["action"].as<std::string>() == "free");
    pump(300);
    assert(lv_screen_active() != Display::sessionSummaryScreen.getScreen()); // dismissal resumes once answered
    assert(server.count("CARD_SESSION_ENDED") == 0 || !server.last("CARD_SESSION_ENDED")["data"]["payload"]["cardSessionId"].isNull());
    std::cout << "PASS post-stop question survives the summary auto-dismiss" << std::endl;
    // --- A step outlives the watchdog, then the sign-in timeout resumes ----------------------------
    hostAdvanceMillis(40000); pump(1100); // the old session times out normally
    assert(!State::getApiState().userAuthenticated);
    Display::hidePopup(); active = false; list(); login();
    click("Lasercutter"); click("Ressource verwenden");
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), "gggggggggggggggggggggg", "confirm", 1, 120000, "Lange Frage"));
    pump();
    assert(label(lv_layer_top(), "Lange Frage"));
    hostAdvanceMillis(65000); pump(1100); // past the 60 s action watchdog and the 30 s sign-in timeout
    assert(State::getApiState().userAuthenticated && label(lv_layer_top(), "Lange Frage"));
    assert(!label(lv_layer_top(), "Aktion nicht bestätigt"));
    click(LV_SYMBOL_CLOSE, true);
    pump(300);
    assert(State::getApiState().userAuthenticated); // closing the step does not sign out at once
    hostAdvanceMillis(31000); pump(1100);
    assert(!State::getApiState().userAuthenticated); // the sign-in timeout runs again
    std::cout << "PASS a long step survives the watchdog and the sign-in timeout resumes" << std::endl;
}
