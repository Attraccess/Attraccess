#include "application/application.hpp"
#include "profile_store.hpp"
#include "virtual_nfc.hpp"
#include <cassert>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <queue>
#include <thread>

// The production Application, API parser, screen router and NFC verifier run
// unchanged. Only the server transport and display hardware are substituted.
class Server : public IReaderTransport {
public:
    std::vector<std::string> sent;
    std::queue<std::string> incoming;
    std::function<void(const char *, size_t)> receive;
    void setup() override {}
    void loop() override {
        while (!incoming.empty()) {
            auto message = incoming.front(); incoming.pop();
            receive(message.c_str(), message.size());
        }
    }
    bool sendMessage(const char *data, size_t size) override { sent.emplace_back(data, size); return true; }
    bool sendHeartbeat(const char *, size_t) override { return true; }
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> value) override { receive = std::move(value); }
    void enableConnectionAttempts() override {}
    void disableConnectionAttempts() override {}
    void forceReconnect(const char *) override {}
    void resetCertificateTrust() override {}
    void push(const char *type, const std::string &payload) {
        incoming.push(std::string("{\"event\":\"EVENT\",\"data\":{\"type\":\"") + type + "\",\"payload\":" + payload + "}}");
    }
    size_t count(const char *type) const {
        size_t result = 0;
        for (const auto &message : sent) {
            JsonDocument doc; assert(!deserializeJson(doc, message));
            if (doc["data"]["type"].as<std::string>() == type) ++result;
        }
        return result;
    }
    JsonDocument last(const char *type) const {
        for (auto it = sent.rbegin(); it != sent.rend(); ++it) {
            JsonDocument doc; assert(!deserializeJson(doc, *it));
            if (doc["data"]["type"].as<std::string>() == type) return doc;
        }
        throw std::runtime_error(std::string("Missing request ") + type);
    }
};

class Framebuffer : public IDisplayDriver {
public:
    std::vector<uint16_t> pixels = std::vector<uint16_t>(480 * 480);
    TouchPoint touch{};
    bool begin() override { return true; }
    uint32_t width() const override { return 480; }
    uint32_t height() const override { return 480; }
    bool readTouch(TouchPoint &point) override { point = touch; return touch.pressed; }
    void flush(const lv_area_t *area, uint8_t *data) override {
        auto *source = reinterpret_cast<uint16_t *>(data);
        for (int y = area->y1; y <= area->y2; ++y)
            for (int x = area->x1; x <= area->x2; ++x) pixels[y * 480 + x] = *source++;
    }
    void capture(const std::filesystem::path &directory, const char *name) {
        lv_obj_invalidate(lv_screen_active()); lv_refr_now(nullptr);
        if (directory.empty()) return;
        std::filesystem::create_directories(directory);
        std::ofstream file(directory / (std::string(name) + ".rgba"), std::ios::binary);
        for (uint16_t pixel : pixels) {
            const uint8_t r = (pixel >> 11) & 31, g = (pixel >> 5) & 63, b = pixel & 31;
            const uint8_t rgba[] = {uint8_t((r << 3) | (r >> 2)), uint8_t((g << 2) | (g >> 4)), uint8_t((b << 3) | (b >> 2)), 255};
            file.write(reinterpret_cast<const char *>(rgba), 4);
        }
        assert(file.good());
    }
};

lv_obj_t *label(lv_obj_t *root, const char *text) {
    if (!root) return nullptr;
    if (lv_obj_check_type(root, &lv_label_class) && std::strcmp(lv_label_get_text(root), text) == 0) return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = label(lv_obj_get_child(root, i), text)) return found;
    return nullptr;
}

int main(int argc, char **argv) {
    const bool timeouts = argc > 1 && std::string(argv[1]) == "--timeouts";
    const std::filesystem::path output = argc > 1 && !timeouts ? argv[1] : "";
    const auto storage = std::filesystem::temp_directory_path() / ("att-880-reader-test-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    ProfileStore profile("http://reader.test", 880, storage);
    KVStore::setHostProfile(&profile);
    Settings::setup();
    Settings::saveAttraccessApiConfig("reader.test", 80, false);
    Settings::saveAttraccessAuthConfig("test", 880);
    Settings::setDevicePin("1234");
    Server server;
    API api(server);
    VirtualNfc nfc(profile);
    Application application(nfc, api);
    Framebuffer display;
    Display::setup(display);
    application.setup();
    State::setWifiState(true, {}, "Test");
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader");
    State::setNetworkQualityState(State::NETWORK_QUALITY_GOOD, 0, 0, 0, 0, 0, 0, 20, 20, 0, 0, 0, 0);
    auto pump = [&](uint32_t duration = 60) {
        const auto end = millis() + duration;
        do { application.loop(); lv_timer_handler(); std::this_thread::sleep_for(std::chrono::milliseconds(5)); }
        while (static_cast<int32_t>(end - millis()) > 0);
    };
    auto click = [&](const char *text, bool popup = false) {
        auto *found = label(popup ? lv_layer_top() : lv_screen_active(), text);
        if (!found) throw std::runtime_error(std::string("Missing button: ") + text);
        assert(!lv_obj_has_state(lv_obj_get_parent(found), LV_STATE_DISABLED));
        lv_obj_send_event(lv_obj_get_parent(found), LV_EVENT_PRESSED, nullptr);
        lv_obj_send_event(lv_obj_get_parent(found), LV_EVENT_RELEASED, nullptr);
        lv_obj_send_event(lv_obj_get_parent(found), LV_EVENT_CLICKED, nullptr);
        pump();
    };
    unsigned listVersion = 0;
    std::string username = "Alex";
    bool active = false, supervised = false;
    auto list = [&](bool signedIn = true, bool onlyOne = false, bool correlate = true) {
        JsonDocument doc;
        doc["messageId"] = ++listVersion;
        doc["revision"] = listVersion;
        if (correlate && server.count("REQUEST_RESOURCE_LIST"))
            doc["requestId"] = server.last("REQUEST_RESOURCE_LIST")["data"]["payload"]["requestId"].as<uint32_t>();
        doc["authenticatedUsername"] = signedIn ? username : "";
        auto resources = doc["resources"].to<JsonArray>();
        for (int id = 1; id <= (onlyOne ? 1 : 3); ++id) {
            auto r = resources.add<JsonObject>();
            r["id"] = id;
            r["name"] = id == 1 ? "Lasercutter" : id == 2 ? "CNC Fräse" : "Werkstatttür";
            r["type"] = id == 3 ? "door" : "machine";
            r["isHealthy"] = true;
            if (signedIn) { r["hasIntroduction"] = id != 2; r["requiresSupervisor"] = id == 1 && supervised; }
            if (id == 1 && active) { r["activeUsageSession"]["user"]["username"] = username; r["activeUsageSession"]["startTime"] = "2026-09-22T07:00:00Z"; }
        }
        std::string payload; serializeJson(doc, payload); server.push("RESOURCE_LIST", payload);
        pump();
    };
    lv_obj_t *drawerSettingsBeforeLogin = nullptr;
    auto login = [&](bool refresh = true) {
        nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
        if (drawerSettingsBeforeLogin) {
            assert(!lv_obj_is_visible(label(lv_layer_top(), "Maintenance")));
            lv_obj_send_event(drawerSettingsBeforeLogin, LV_EVENT_CLICKED, nullptr);
            pump();
            assert(lv_screen_active() == Display::resourceListScreen.getScreen());
            drawerSettingsBeforeLogin = nullptr;
        }
        server.push("CARD_AUTHENTICATION_DATA", "{\"username\":\"" + username + R"(","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true,"requiresSupervisor":)" + (supervised ? "true}" : "false}"));
        pump(250); nfc.setPresent(0, false);
        if (refresh) list();
        server.push("PROJECTS_OF_USER", R"({"page":1,"limit":10,"total":1,"projects":[{"id":42,"name":"Werkstattprojekt"}]})");
        pump();
    };
    list(false, true); pump(2100);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    display.capture(output, "01-single-resource-list");
    list(false);
    // A drawer opened before scanning must close as soon as authentication begins.
    display.touch = {240, 10, true}; pump();
    display.touch = {240, 140, true}; pump();
    display.touch.pressed = false; pump();
    assert(lv_obj_is_visible(label(lv_layer_top(), "Maintenance")));
    drawerSettingsBeforeLogin = lv_obj_get_parent(label(lv_layer_top(), "Settings"));
    login();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    display.capture(output, "02-scan-first-list");
    const auto starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Start");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    assert(server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["resourceId"].as<int>() == 1);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    click("Start"); click("Abmelden"); click("CNC Fräse");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    // The passive top-edge gesture must not bypass the blocking action overlay.
    display.touch = {240, 10, true}; pump();
    display.touch = {240, 140, true}; pump();
    display.touch.pressed = false; pump();
    assert(!lv_obj_is_visible(label(lv_layer_top(), "Maintenance")));
    display.capture(output, "03-pending-start");
    server.push("START_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    assert(server.count("REQUEST_RESOURCE_LIST") > 0);
    assert(label(lv_screen_active(), "Status wird geladen"));
    // An unrelated broadcast must not release the status refresh guard.
    list(true, false, false);
    assert(label(lv_screen_active(), "Status wird geladen"));
    active = true; list();
    assert(label(lv_screen_active(), "Stop"));
    display.capture(output, "04-started-list");
    click("Lasercutter");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    display.capture(output, "05-details-running");
    auto *backButton = lv_obj_get_parent(label(lv_screen_active(), LV_SYMBOL_LEFT));
    auto *logoutButton = lv_obj_get_parent(label(lv_screen_active(), "Abmelden"));
    assert(lv_obj_get_parent(backButton) == lv_obj_get_parent(logoutButton));
    assert(lv_obj_get_child(lv_obj_get_parent(backButton), 0) == backButton);
    lv_obj_add_state(backButton, LV_STATE_PRESSED);
    lv_obj_add_state(logoutButton, LV_STATE_PRESSED);
    pump(200);
    for (auto *button : {backButton, logoutButton}) {
        lv_area_t bounds, parent; lv_obj_get_coords(button, &bounds); lv_obj_get_coords(lv_obj_get_parent(button), &parent);
        assert(bounds.y1 == 20 && bounds.y1 >= parent.y1 && bounds.y2 <= parent.y2);
        assert(lv_obj_get_style_transform_width(button, LV_PART_MAIN) == 0);
        assert(lv_obj_get_style_transform_height(button, LV_PART_MAIN) == 0);
    }
    display.capture(output, "05b-header-pressed");
    lv_obj_remove_state(backButton, LV_STATE_PRESSED);
    lv_obj_remove_state(logoutButton, LV_STATE_PRESSED);
    click(LV_SYMBOL_LEFT);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    // Going back must keep the fetched project catalogue.
    click("Lasercutter"); click("Projekt wählen");
    assert(label(lv_layer_top(), "Werkstattprojekt"));
    click("Werkstattprojekt", true); click(LV_SYMBOL_LEFT);
    click("Stop");
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["resourceId"].as<int>() == 1);
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"end","forms":[{"id":8,"name":"Check","fieldCount":1}]})");
    pump();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(server.count("RESOURCE_USAGE_FORM_GET_FIELDS") > 0);
    display.capture(output, "06-required-end-form");
    server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})");
    pump();
    display.capture(output, "06b-required-form-ready");
    click(LV_SYMBOL_CLOSE, true);
    assert(server.count("RESOURCE_USAGE_FORM_CANCEL") > 0);
    list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Stop"));
    // Complete the required end form, then wait for the resumed stop result.
    const auto stopsBeforeForm = server.count("STOP_RESOURCE_USAGE_SESSION");
    click("Stop");
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"end","forms":[{"id":8,"name":"Check","fieldCount":1}]})"); pump();
    server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})"); pump();
    click("Absenden", true);
    assert(server.count("RESOURCE_USAGE_FORM_SUBMIT_PAGE") == 1);
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":true})"); pump();
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeForm + 2);
    server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    active = false; list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Start"));
    display.capture(output, "06c-form-completed-stop");
    // A separately running usage is unaffected by reader logout.
    active = true; list();
    const auto stopsBeforeLogout = server.count("STOP_RESOURCE_USAGE_SESSION");
    click("Abmelden");
    assert(!label(lv_screen_active(), "Alex") || !lv_obj_is_visible(label(lv_screen_active(), "Alex")));
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeLogout);
    display.capture(output, "07-logout-usage-preserved");
    click("CNC Fräse");
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    display.capture(output, "08-resource-first-scan");
    login();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), "CNC Fräse"));
    display.capture(output, "09-restricted-details");
    click(LV_SYMBOL_LEFT);
    click("Öffnen");
    assert(server.last("UNLOCK_DOOR")["data"]["payload"]["resourceId"].as<int>() == 3);
    server.push("UNLOCK_DOOR", R"({"error":"Denied by test"})"); pump(); list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_layer_top(), "Denied by test"));
    display.capture(output, "10-action-error");
    Display::hidePopup();
    active = false; supervised = true; list(); click("Aufsicht");
    assert(lv_screen_active() == Display::supervisionScreen.getScreen());
    assert(server.last("SUPERVISION_REQUEST")["data"]["payload"]["resourceId"].as<int>() == 1);
    display.capture(output, "11-supervisor-request");
    pump(1100); click("Abbrechen"); list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    supervised = false; list();
    const uint32_t oldRequestId = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
    click("Start");
    const uint32_t currentRequestId = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
    assert(oldRequestId != currentRequestId);
    assert(server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["projectId"].isNull());
    const auto refreshesBefore = server.count("REQUEST_RESOURCE_LIST");
    server.push("START_RESOURCE_USAGE_SESSION", "{\"success\":true,\"requestId\":" + std::to_string(oldRequestId) + "}");
    server.push("START_RESOURCE_USAGE_SESSION", "{\"error\":\"Stale failure\",\"requestId\":" + std::to_string(oldRequestId) + "}");
    server.push("RESOURCE_USAGE_FORM_REQUEST", "{\"resourceId\":1,\"action\":\"start\",\"requestId\":" + std::to_string(oldRequestId) + ",\"forms\":[{\"id\":8,\"fieldCount\":1}]}");
    pump();
    assert(server.count("REQUEST_RESOURCE_LIST") == refreshesBefore);
    assert(!label(lv_layer_top(), "Stale failure"));
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Starte Sitzung"));
    server.push("START_RESOURCE_USAGE_SESSION", "{\"success\":true,\"requestId\":" + std::to_string(currentRequestId) + "}");
    pump(); active = true; list();
    // A delayed pre-action snapshot cannot overwrite the completed usage.
    server.push("RESOURCE_LIST", R"({"revision":1,"authenticatedUsername":"Alex","resources":[]})"); pump();
    assert(label(lv_screen_active(), "Stop"));
    // A newer broadcast can overtake the matching refresh without trapping input.
    click("Stop"); server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    active = false; list(true, false, false);
    const auto refreshId = server.last("REQUEST_RESOURCE_LIST")["data"]["payload"]["requestId"].as<uint32_t>();
    server.push("RESOURCE_LIST", "{\"revision\":" + std::to_string(listVersion - 1) + ",\"requestId\":" + std::to_string(refreshId) + ",\"resources\":[]}"); pump();
    assert(label(lv_screen_active(), "Start"));
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Status wird geladen")));
    active = true; list();
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); list(false); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
    display.capture(output, "12-reconnected-signed-out");
    // Both the personalized identity and usage owner retain all 32 characters.
    username = "abcdefghijklmnopqrstuvwxyz012345";
    login();
    assert(label(lv_screen_active(), "Stop"));
    click("Stop"); server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    active = false; list();
    assert(label(lv_screen_active(), "Start"));
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Status wird geladen")));
    click("Abmelden"); username = "Alex"; active = true; list(false);
    login(); click("Abmelden");
    login(false);
    assert(label(lv_screen_active(), "Laden ..."));
    assert(!label(lv_screen_active(), "Stop"));
    list(); assert(label(lv_screen_active(), "Stop")); click("Abmelden");
    // Resource-first supervision works before the background list arrives.
    active = false; supervised = true; list(false); click("Lasercutter"); login(false);
    const auto unsupervisedStarts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Ressource verwenden");
    assert(lv_screen_active() == Display::supervisionScreen.getScreen());
    assert(server.count("START_RESOURCE_USAGE_SESSION") == unsupervisedStarts);
    pump(1100); click("Abbrechen"); list(); click(LV_SYMBOL_LEFT); click("Abmelden");
    supervised = false; active = true; list(false);
    if (timeouts) {
        login();
        const auto stopsBeforeTimeout = server.count("STOP_RESOURCE_USAGE_SESSION");
        pump(31050);
        assert(!lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeTimeout);
        std::cout << "PASS idle login expiry preserves running usage" << std::endl;
        active = false; login(); click("Start");
        pump(31050);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(label(lv_screen_active(), "Pausiert"));
        // An unconfirmed action gets a fresh 30-second status-refresh window.
        pump(30500);
        assert(lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        assert(label(lv_screen_active(), "Status wird geladen"));
        assert(label(lv_layer_top(), "Aktion nicht bestätigt"));
        Display::hidePopup(); active = true; list();
        assert(lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        std::cout << "PASS action pauses the real 30-second login timeout" << std::endl;
        click("Abmelden");
        nfc.setPresent(0, true); pump(); nfc.setPresent(0, false); pump();
        // The waiting card-key request also rejects a competing web approval.
        server.push("SUPERVISION_START", R"({"resourceId":1,"requesterName":"Robin","timeoutMs":30000})"); pump();
        assert(lv_screen_active() != Display::supervisionScreen.getScreen());
        server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Alex","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})"); pump();
        pump(31050);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(!lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        assert(label(lv_layer_top(), "Anmeldung fehlgeschlagen"));
        std::cout << "PASS lifted card authentication expires and recovers" << std::endl;
    }
    std::filesystem::remove_all(storage);
    std::cout << "PASS ATT-880 production application journeys\n";
}
