#include "workflow.hpp"

#include <set>

// ATT-1187: plugin slots, host-owned steps, block reasons and the post-stop question on a touch reader.
// Runs on the test clock (hostFreezeMillis): millis() and LVGL ticks only move with pump() and hostAdvanceMillis().
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
int countLabels(lv_obj_t *root, const char *text) {
    if (!root) return 0;
    int n = lv_obj_check_type(root, &lv_label_class) && std::strcmp(lv_label_get_text(root), text) == 0;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i) n += countLabels(lv_obj_get_child(root, i), text);
    return n;
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
    hostFreezeMillis();
    cardSessionId = "cs-1";
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
    // Skips are reported with owner and revision; successful renders are not reported.
    assert(server.count("UI_RENDER_REPORT") == 3);
    auto report = server.last("UI_RENDER_REPORT");
    assert(report["data"]["payload"]["status"] == "skipped" && report["data"]["payload"]["reason"] == "invalid-shape");
    for (const auto &message : server.sent) {
        JsonDocument doc; deserializeJson(doc, message);
        if (doc["data"]["type"] != "UI_RENDER_REPORT" || doc["data"]["payload"]["key"] != "spoof") continue;
        assert(doc["data"]["payload"]["owner"] == "reservations" && doc["data"]["payload"]["revision"] == 1 &&
               doc["data"]["payload"]["resourceId"] == 2 && doc["data"]["payload"]["reason"] == "core-string-spoof");
    }
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
    // Slot changes of other resources leave the details screen as built (no full rebuild).
    lv_obj_add_flag(label(lv_screen_active(), "Reserviert 14:00 - 16:00"), LV_OBJ_FLAG_USER_1);
    server.push("UI_SLOT_UPDATE", slotPayload(2, "resourceList.row.status", 1, R"({"t":"badge","text":"Andere"})", "other"), 24);
    server.push("UI_SLOT_UPDATE", slotPayload(2, "resource.details.body", 1, R"({"t":"text","text":"Fremd"})", "other"), 25);
    pump();
    assert(lv_obj_has_flag(label(lv_screen_active(), "Reserviert 14:00 - 16:00"), LV_OBJ_FLAG_USER_1));
    assert(!label(lv_screen_active(), "Fremd"));
    // Two plugins may use the same key: the second one's revision 1 is not stale.
    server.push("UI_SLOT_UPDATE", R"({"resourceId":1,"slot":"resource.details.header","revision":1,"owner":"other-plugin",)"
        R"("key":"res","serverNowMs":1000000,"tree":{"t":"text","text":"Zweites Plugin"}})", 26);
    pump();
    assert(label(lv_screen_active(), "Zweites Plugin") && label(lv_screen_active(), "Reserviert 14:00 - 16:00"));
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
    // A burst of hostile updates: every ack still goes out (paced), reports never push acks out of the queue.
    for (uint32_t id = 100; id < 130; ++id)
        server.push("UI_SLOT_UPDATE", slotPayload(1, "resource.details.body", id, R"({"t":"image"})", "burst"), id);
    const auto reportsBefore = server.count("UI_RENDER_REPORT");
    pump(1500);
    std::set<uint32_t> acked;
    for (const auto &message : server.sent) {
        JsonDocument doc; deserializeJson(doc, message);
        if (doc["data"]["type"] == "ACK_UI_SLOT_UPDATE") acked.insert(doc["data"]["messageId"].as<uint32_t>());
    }
    for (uint32_t id = 100; id < 130; ++id) assert(acked.count(id));
    assert(server.count("UI_RENDER_REPORT") > reportsBefore && server.count("UI_RENDER_REPORT") <= reportsBefore + 8);
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
    // A duplicate (lost ACK) is acked again but neither reopens nor restarts the step.
    const auto stepAcks = server.count("ACK_UI_STEP_REQUEST");
    server.push("UI_STEP_REQUEST", stepPayload(firstRequest, STEP_A, "confirm", 1, 120000, "Reserviert ab 14:00"), 43);
    pump();
    assert(server.count("ACK_UI_STEP_REQUEST") == stepAcks + 1);
    assert(server.last("ACK_UI_STEP_REQUEST")["data"]["messageId"].as<uint32_t>() == 43);
    assert(countLabels(lv_layer_top(), "Reserviert ab 14:00") == 1);
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
    // A resend 6 s later does not restart the 10 s timer.
    hostAdvanceMillis(6000); pump();
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), "dddddddddddddddddddddd", "confirm", 1, 10000, "Laeuft ab"));
    pump();
    assert(countLabels(lv_layer_top(), "Laeuft ab") == 1);
    hostAdvanceMillis(4500); pump();
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
    const auto ended = server.count("CARD_SESSION_ENDED");
    click("Freigeben", true);
    resultDoc = server.last("UI_STEP_RESULT");
    result = resultDoc["data"]["payload"];
    assert(result["stepId"].as<std::string>() == "ffffffffffffffffffffff" && result["action"].as<std::string>() == "free");
    // Once answered, the summary gets its full 3.5 s; the answering touch does not dismiss it.
    pump(300);
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen() && server.count("CARD_SESSION_ENDED") == ended);
    hostAdvanceMillis(3600); pump(300);
    assert(lv_screen_active() != Display::sessionSummaryScreen.getScreen() && !State::getApiState().userAuthenticated);
    // Signing out (the summary's dismissal) ends the card session on the server.
    assert(server.count("CARD_SESSION_ENDED") == ended + 1);
    assert(server.last("CARD_SESSION_ENDED")["data"]["payload"]["cardSessionId"] == "cs-1");
    std::cout << "PASS post-stop question survives the summary auto-dismiss" << std::endl;
    // --- A step outlives the watchdog, then the sign-in timeout resumes ----------------------------
    Display::hidePopup(); active = false; cardSessionId = "cs-2"; list(); login();
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
    assert(server.last("CARD_SESSION_ENDED")["data"]["payload"]["cardSessionId"] == "cs-2");
    std::cout << "PASS a long step survives the watchdog and the sign-in timeout resumes" << std::endl;

    // --- A post-stop question expires on the reader too ------------------------------------------
    Display::hidePopup(); active = true; cardSessionId = "cs-3"; list(); login();
    click("Lasercutter"); click("Sitzung beenden");
    server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true,"durationSeconds":60,"endedOwnSession":true})"); pump();
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    server.push("UI_STEP_REQUEST", stepPayload(0, "hhhhhhhhhhhhhhhhhhhhhh", "choose", 1, 15000, "Noch etwas?",
        R"(,"choices":[{"id":"keep","label":"Behalten"},{"id":"free","label":"Freigeben"}])"));
    pump();
    assert(label(lv_layer_top(), "Noch etwas?"));
    hostAdvanceMillis(15100); pump(300);
    assert(!label(lv_layer_top(), "Noch etwas?") && lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    hostAdvanceMillis(3600); pump(300);
    assert(lv_screen_active() != Display::sessionSummaryScreen.getScreen());
    assert(server.last("CARD_SESSION_ENDED")["data"]["payload"]["cardSessionId"] == "cs-3");
    std::cout << "PASS a post-stop question expires and the summary then dismisses" << std::endl;

    // --- Signing out ends the card session; a disconnect closes the step and starts nothing ---------
    active = false; cardSessionId = "cs-4"; list(); login();
    const auto endedBeforeSignOut = server.count("CARD_SESSION_ENDED");
    click("Abmelden");
    assert(server.count("CARD_SESSION_ENDED") == endedBeforeSignOut + 1 &&
           server.last("CARD_SESSION_ENDED")["data"]["payload"]["cardSessionId"] == "cs-4");
    cardSessionId = "cs-5"; list(); login();
    click("Lasercutter"); click("Ressource verwenden");
    starts = server.count("START_RESOURCE_USAGE_SESSION");
    const auto results = server.count("UI_STEP_RESULT");
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), "iiiiiiiiiiiiiiiiiiiiii", "confirm", 1, 60000, "Verbindung weg"));
    pump();
    assert(label(lv_layer_top(), "Verbindung weg"));
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen() && !label(lv_layer_top(), "Verbindung weg"));
    State::setWebsocketState(true, "reader.test", 80, false);
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":"de"})"); list(false); pump(300);
    assert(!label(lv_layer_top(), "Verbindung weg"));
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts && server.count("UI_STEP_RESULT") == results);
    std::cout << "PASS a disconnect closes the step and starts nothing" << std::endl;

    // --- A step the reader cannot use is cancelled at once, so the server releases the START -------
    cardSessionId = "cs-6"; list(); login();
    click("Lasercutter"); click("Ressource verwenden");
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), "jjjjjjjjjjjjjjjjjjjjjj", "confirm", 2, 60000, "Falsche Ressource"));
    pump();
    assert(!label(lv_layer_top(), "Falsche Ressource"));
    resultDoc = server.last("UI_STEP_RESULT");
    assert(resultDoc["data"]["payload"]["stepId"] == "jjjjjjjjjjjjjjjjjjjjjj" && resultDoc["data"]["payload"]["action"] == "cancel");
    assert(label(lv_layer_top(), "Aktion fehlgeschlagen")); // the pending start ends now, not after the watchdog
    Display::hidePopup(); list(); // the reader refreshes the resource after a failed start
    starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Ressource verwenden");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    server.push("UI_STEP_REQUEST", stepPayload(startRequestId(), "kkkkkkkkkkkkkkkkkkkkkk", "confirm", 1, 60000, "x",
        R"(,"tone":"warning","actions":[{"role":"confirm","label":"This label is far too long for a button"}])"));
    pump();
    resultDoc = server.last("UI_STEP_RESULT");
    assert(resultDoc["data"]["payload"]["stepId"] == "kkkkkkkkkkkkkkkkkkkkkk" && resultDoc["data"]["payload"]["action"] == "cancel");
    Display::hidePopup(); pump();
    std::cout << "PASS an unusable step is cancelled at once" << std::endl;
}
