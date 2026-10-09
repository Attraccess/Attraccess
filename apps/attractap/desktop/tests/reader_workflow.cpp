#include "application/application.hpp"
#include "profile_store.hpp"
#include "virtual_rfid.hpp"
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

lv_obj_t *requireLabel(lv_obj_t *root, const char *text) {
    auto *found = label(root, text);
    if (!found)
        throw std::runtime_error(std::string("Missing label: ") + text +
                                 "; active language: " + State::getActiveLanguage());
    return found;
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
    auto setQuality = [](State::NetworkQuality quality) {
        State::setNetworkQualityState(quality, 0, 0, 0, 0, 0, 0, 20, 20, 0, 0, 0, 0);
    };
    setQuality(State::NETWORK_QUALITY_GOOD);
    auto pump = [&](uint32_t duration = 60) {
        const auto end = millis() + duration;
        unsigned iterations = 0;
        // Display refresh precedes API processing in the application loop.
        // Always allow the following tick to render received state, even if
        // a loaded host consumed the entire wall-clock interval in one tick.
        do {
            application.loop(); lv_timer_handler();
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
            ++iterations;
        } while (iterations < 2 || static_cast<int32_t>(end - millis()) > 0);
    };
    auto click = [&](const char *text, bool popup = false) {
        auto *found = label(popup ? lv_layer_top() : lv_screen_active(), text);
        if (!found) throw std::runtime_error(std::string("Missing button: ") + text);
        // Screen transitions can leave controls disabled until their animation finishes.
        const auto readyDeadline = millis() + 2000;
        while (lv_obj_has_state(lv_obj_get_parent(found), LV_STATE_DISABLED) &&
               static_cast<int32_t>(readyDeadline - millis()) > 0) {
            pump();
            found = label(popup ? lv_layer_top() : lv_screen_active(), text);
            if (!found) throw std::runtime_error(std::string("Button disappeared: ") + text);
        }
        if (lv_obj_has_state(lv_obj_get_parent(found), LV_STATE_DISABLED))
            throw std::runtime_error(std::string("Button stayed disabled: ") + text);
        lv_obj_send_event(lv_obj_get_parent(found), LV_EVENT_PRESSED, nullptr);
        lv_obj_send_event(lv_obj_get_parent(found), LV_EVENT_RELEASED, nullptr);
        lv_obj_send_event(lv_obj_get_parent(found), LV_EVENT_CLICKED, nullptr);
        pump();
    };
    unsigned listVersion = 0;
    std::string username = "Alex";
    bool active = false, supervised = false;
    uint32_t activeUsageId = 99;
    std::string longDescription =
        "RFI 5-2 · Angstrom Engineering · Åmod · evaporation tool with a long description that must remain readable in details. ";
    while (longDescription.size() < 600)
        longDescription += "Operating notes, preparation, ventilation, and cleaning instructions remain available to the reader. ";
    longDescription += "Final inspection and shutdown steps.";
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
            if (id == 1) r["description"] = longDescription;
            r["type"] = id == 3 ? "door" : "machine";
            r["isHealthy"] = true;
            if (signedIn) { r["hasIntroduction"] = id != 2; r["requiresSupervisor"] = id == 1 && supervised; }
            if (id == 1 && active) {
                r["activeUsageSession"]["id"] = activeUsageId;
                r["activeUsageSession"]["user"]["username"] = username;
                char startTime[32];
                const auto start = time(nullptr) - 1426;
                std::strftime(startTime, sizeof(startTime), "%Y-%m-%dT%H:%M:%SZ", gmtime(&start));
                r["activeUsageSession"]["startTime"] = startTime;
            }
        }
        std::string payload; serializeJson(doc, payload); server.push("RESOURCE_LIST", payload);
        pump();
    };
    lv_obj_t *drawerSettingsBeforeLogin = nullptr;
    std::string userLocale = "de";
    auto login = [&](bool refresh = true) {
        nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
        if (drawerSettingsBeforeLogin) {
            assert(!lv_obj_is_visible(requireLabel(lv_layer_top(), FirmwareI18n::messageText(FirmwareI18n::Message::Maintenance, State::getActiveLanguage()))));
            lv_obj_send_event(drawerSettingsBeforeLogin, LV_EVENT_CLICKED, nullptr);
            pump();
            assert(lv_screen_active() == Display::resourceListScreen.getScreen());
            drawerSettingsBeforeLogin = nullptr;
        }
        server.push("CARD_AUTHENTICATION_DATA", "{\"username\":\"" + username + "\",\"language\":\"" + userLocale + R"(","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true,"requiresSupervisor":)" + (supervised ? "true}" : "false}"));
        pump(250); nfc.setPresent(0, false);
        if (refresh) list();
        server.push("PROJECTS_OF_USER", R"({"page":1,"limit":10,"total":1,"projects":[{"id":42,"name":"Werkstattprojekt"}]})");
        pump();
    };
    list(false, true);
    // Wait for the boot delay and screen animation to complete on loaded runners.
    const auto bootDeadline = millis() + 10000;
    while (lv_screen_active() != Display::resourceListScreen.getScreen() &&
           static_cast<int32_t>(bootDeadline - millis()) > 0)
        pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    auto *networkBadge = lv_obj_get_parent(label(lv_layer_top(), "OK NET"));
    assert(lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    setQuality(State::NETWORK_QUALITY_DEGRADED); pump();
    assert(label(lv_layer_top(), "! NET") && !lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    display.capture(output, "01a-net-degraded");
    setQuality(State::NETWORK_QUALITY_OFFLINE); pump();
    assert(label(lv_layer_top(), "x NET") && !lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    display.capture(output, "01b-net-offline");
    setQuality(State::NETWORK_QUALITY_GOOD); pump();
    assert(label(lv_layer_top(), "OK NET") && lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    auto *listName = label(lv_screen_active(), "Lasercutter");
    assert(listName);
    auto *listDescription = lv_obj_get_child(lv_obj_get_parent(listName), 1);
    assert(lv_obj_check_type(listDescription, &lv_label_class));
    assert(std::strlen(lv_label_get_text(listDescription)) < longDescription.size());
    lv_obj_update_layout(lv_screen_active());
    lv_area_t nameBounds, descriptionBounds, rowBounds;
    lv_obj_get_coords(listName, &nameBounds);
    lv_obj_get_coords(listDescription, &descriptionBounds);
    lv_obj_get_coords(lv_obj_get_parent(lv_obj_get_parent(listName)), &rowBounds);
    assert(nameBounds.y2 < descriptionBounds.y1);
    assert(descriptionBounds.y2 <= rowBounds.y2);
    assert(lv_obj_get_height(listDescription) <= 20);
    display.capture(output, "01-single-resource-list");
    list(false);
    // A drawer opened before scanning must close as soon as authentication begins.
    display.touch = {240, 10, true}; pump();
    display.touch = {240, 140, true}; pump();
    display.touch.pressed = false; pump();
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), FirmwareI18n::messageText(FirmwareI18n::Message::Maintenance, State::getActiveLanguage()))));
    drawerSettingsBeforeLogin = lv_obj_get_parent(label(lv_layer_top(), FirmwareI18n::messageText(FirmwareI18n::Message::Settings, State::getActiveLanguage())));
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
    assert(!lv_obj_is_visible(requireLabel(lv_layer_top(), FirmwareI18n::messageText(FirmwareI18n::Message::Maintenance, State::getActiveLanguage()))));
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
    auto *fullDescription = label(lv_screen_active(), longDescription.c_str());
    assert(fullDescription);
    lv_obj_update_layout(lv_screen_active());
    assert(lv_label_get_long_mode(fullDescription) == LV_LABEL_LONG_SCROLL);
    assert(lv_obj_get_height(fullDescription) == 28);
    lv_area_t fullDescriptionBounds;
    lv_obj_get_coords(fullDescription, &fullDescriptionBounds);
    assert(server.count("RESOURCE_USAGE_STATS") == 1);
    const auto statsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    assert(server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["resourceId"].as<uint32_t>() == 1);
    auto stats = [&](uint32_t request, uint32_t usage, const char *values) {
        server.push("RESOURCE_USAGE_STATS", "{\"resourceId\":1,\"requestId\":" + std::to_string(request) +
            ",\"usage\":{\"id\":" + std::to_string(usage) + "," + values + "}}");
        pump();
    };
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    display.capture(output, "05c-usage-stats-waiting");
    stats(statsRequest, 99,
          "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"9007199254740993.125\",\"creditsPerUnit\":9007199254740991,\"formattedRate\":\"90.071.992.547.409,91 EUR\"}]");
    assert(label(lv_screen_active(), "Heartbeats: 9007199254740993.125\n90.071.992.547.409,91 EUR / Wert"));
    stats(statsRequest, 99,
          "\"meters\":[{\"name\":\"Heartbeats\",\"value\":null,\"creditsPerUnit\":0,\"formattedRate\":\"0,00 EUR\"}]");
    assert(label(lv_screen_active(), "Heartbeats: Warte auf Messwert\n0,00 EUR / Wert"));
    stats(statsRequest, 99,
          "\"meters\":[{\"name\":\"Energy (kWh)\",\"value\":\"0.125\",\"creditsPerUnit\":30,\"formattedRate\":\"0,30 EUR\"},"
          "{\"name\":\"Heartbeats\",\"value\":\"0\",\"creditsPerUnit\":0,\"formattedRate\":\"0,00 EUR\"}],\"operatingDurationMs\":123000,\"isOperating\":true");
    assert(label(lv_screen_active(), "Energy (kWh): 0.125\n0,30 EUR / Wert\nHeartbeats: 0\n0,00 EUR / Wert"));
    display.capture(output, "05f-usage-stats-captured-rates");
    stats(statsRequest, 99, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"0.125\"}],\"operatingDurationMs\":123000,\"isOperating\":true");
    assert(label(lv_screen_active(), "Heartbeats: 0.125"));
    assert(label(lv_screen_active(), "00:02:03 · Läuft"));
    display.capture(output, "05d-usage-stats-running");
    // Replies for earlier requests or another usage cannot overwrite the displayed reading.
    stats(statsRequest - 1, 99, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"9\"}]");
    stats(statsRequest, 100, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"9\"}]");
    assert(label(lv_screen_active(), "Heartbeats: 0.125"));
    stats(statsRequest, 99, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"0\"}],\"operatingDurationMs\":0,\"isOperating\":false");
    assert(label(lv_screen_active(), "Heartbeats: 0"));
    assert(label(lv_screen_active(), "00:00:00 · Leerlauf"));
    display.capture(output, "05e-usage-stats-idle");
    stats(statsRequest, 99, "\"meters\":[],\"operatingDurationMs\":null,\"isOperating\":null");
    assert(label(lv_screen_active(), "Keine Daten"));
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    stats(statsRequest, 99, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"0.125\"}],\"operatingDurationMs\":123000,\"isOperating\":true");
    display.capture(output, "05-details-running");
    const auto beforeMarquee = display.pixels;
    pump(1200);
    display.capture(output, "05a-details-marquee");
    bool marqueeMoved = false;
    for (int y = fullDescriptionBounds.y1; y <= fullDescriptionBounds.y2; ++y)
        for (int x = fullDescriptionBounds.x1; x <= fullDescriptionBounds.x2; ++x)
            marqueeMoved |= beforeMarquee[y * 480 + x] != display.pixels[y * 480 + x];
    assert(marqueeMoved);
    lv_obj_send_event(lv_screen_active(), LV_EVENT_PRESSED, nullptr);
    const auto pollsBefore = server.count("RESOURCE_USAGE_STATS");
    pump(10000);
    assert(server.count("RESOURCE_USAGE_STATS") > pollsBefore);
    const auto latestStatsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    stats(latestStatsRequest, 99, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"0.250\"}],\"operatingDurationMs\":130000,\"isOperating\":false");
    assert(label(lv_screen_active(), "Heartbeats: 0.250"));
    // Changing sessions clears A's cached reading before B's reply arrives.
    activeUsageId = 100; list();
    const auto replacementStatsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    assert(replacementStatsRequest != latestStatsRequest);
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    stats(latestStatsRequest, 99, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"9\"}]");
    assert(label(lv_screen_active(), "Warte auf Messwert"));
    stats(replacementStatsRequest, 100, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"0.500\"}]");
    stats(latestStatsRequest, 99, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"9\"}]");
    server.push("RESOURCE_USAGE_STATS", "{\"resourceId\":1,\"requestId\":" + std::to_string(latestStatsRequest) + ",\"usage\":null}");
    pump();
    assert(label(lv_screen_active(), "Heartbeats: 0.500"));
    // Ending a session while its lookup is outstanding keeps the panel hidden.
    activeUsageId = 101; list();
    const auto endingStatsRequest = server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>();
    active = false; list();
    stats(endingStatsRequest, 101, "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"9\"}]");
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Warte auf Messwert")));
    active = true; activeUsageId = 99; list();
    stats(server.last("RESOURCE_USAGE_STATS")["data"]["payload"]["requestId"].as<uint32_t>(), 99,
          "\"meters\":[{\"name\":\"Heartbeats\",\"value\":\"0.250\"}],\"operatingDurationMs\":130000,\"isOperating\":false");
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
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":false,"errors":[{"fieldId":9,"code":"REQUIRED_FIELD","message":"Server diagnostic %s"}]})"); pump();
    auto *serverError = requireLabel(lv_layer_top(), "Pflichtfeld");
    assert(!label(lv_layer_top(), "Server diagnostic %s"));
    State::setUserLanguage(true, "en"); pump();
    assert(label(lv_layer_top(), "Required field") == serverError);
    assert(label(lv_layer_top(), "Sichtprüfung *") && label(lv_layer_top(), "OK"));
    display.capture(output, "form-server-error-english");
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_layer_top(), "Pflichtfeld") == serverError);
    display.capture(output, "form-server-error-german");
    // Known unknown-field validation errors still use the localized catalog.
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":false,"errors":[{"fieldId":9,"code":"UNKNOWN_FIELD","message":"Unknown field #9."}]})"); pump();
    assert(label(lv_layer_top(), "Eingabe ungültig.") == serverError);
    assert(!label(lv_layer_top(), "Unknown field #9."));
    display.capture(output, "form-unknown-field-german");
    State::setUserLanguage(true, "en"); pump();
    assert(label(lv_layer_top(), "Invalid input.") == serverError);
    display.capture(output, "form-unknown-field-english");
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_layer_top(), "Eingabe ungültig.") == serverError);
    // Unknown identifiers and old servers without a code use English fallback.
    for (const auto *error : {R"({"fieldId":9,"code":"FUTURE_ERROR","message":"Unbekannter Fehler"})", R"({"fieldId":9,"message":"Alte Diagnose"})"}) {
        server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", std::string(R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":false,"errors":[)") + error + "]}"); pump();
        assert(label(lv_layer_top(), "Invalid input.") == serverError);
        assert(!label(lv_layer_top(), "Unbekannter Fehler") && !label(lv_layer_top(), "Alte Diagnose"));
    }
    click("Absenden", true);
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":true})"); pump();
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeForm + 2);
    // Holding the original touch/card must not dismiss the new summary.
    display.touch = {240, 400, true}; pump();
    nfc.setPresent(0, true); pump();
    active = false; list(); // Broadcast may arrive before the committed stop reply.
    server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true,"durationSeconds":1426,"endedOwnSession":true,"billingSummary":{"amount":1250,"total":"12,50 EUR"}})"); pump();
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    assert(label(lv_screen_active(), "Danke, Alex!"));
    assert(label(lv_screen_active(), "00:23:46"));
    assert(label(lv_screen_active(), "12,50 EUR"));
    assert(!label(lv_layer_top(), "Gesamtkosten dieser Sitzung"));
    assert(!label(lv_screen_active(), "Nutzung beendet"));
    active = false; list();
    server.push("PROJECTS_OF_USER", R"({"page":1,"limit":10,"total":0,"projects":[]})"); pump();
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    setQuality(State::NETWORK_QUALITY_DEGRADED); pump();
    assert(lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    display.capture(output, "session-summary-billed");
    // The merged summary retains the authenticated user's locale and live bindings.
    auto *summaryGreeting = requireLabel(lv_screen_active(), "Danke, Alex!");
    State::setUserLanguage(true, "en"); pump();
    assert(State::getApiState().userAuthenticated);
    assert(label(lv_screen_active(), "Thank you, Alex!") == summaryGreeting);
    assert(label(lv_screen_active(), "Duration"));
    assert(label(lv_screen_active(), "Charged"));
    assert(label(lv_screen_active(), "See you soon!"));
    assert(label(lv_screen_active(), "00:23:46"));
    assert(label(lv_screen_active(), "12,50 EUR"));
    display.capture(output, "session-summary-billed-english");
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_screen_active(), "Danke, Alex!") == summaryGreeting);
    assert(label(lv_screen_active(), "Dauer"));
    assert(label(lv_screen_active(), "Abgerechnet"));
    assert(label(lv_screen_active(), "Bis bald!"));
    pump(300);
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    display.touch.pressed = false; nfc.setPresent(0, false); pump();
    const auto authBeforeSummaryCard = server.count("REQUEST_CARD_AUTHENTICATION_DATA");
    nfc.setPresent(0, true); pump(); nfc.setPresent(0, false);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count("REQUEST_CARD_AUTHENTICATION_DATA") == authBeforeSummaryCard);
    assert(!lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    setQuality(State::NETWORK_QUALITY_GOOD); pump();
    assert(!label(lv_screen_active(), "Alex") || !lv_obj_is_visible(label(lv_screen_active(), "Alex")));
    login();
    // A separately running usage is unaffected by reader logout.
    active = true; list();
    const auto stopsBeforeLogout = server.count("STOP_RESOURCE_USAGE_SESSION");
    click("Abmelden");
    assert(!label(lv_screen_active(), "Alex") || !lv_obj_is_visible(requireLabel(lv_screen_active(), "Alex")));
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
    assert(label(lv_layer_top(), "Something went wrong. Please try again."));
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
    click("Stop"); server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true,"billingSummary":{"amount":0,"total":"0,00 EUR"}})"); pump();
    assert(!label(lv_layer_top(), "Gesamtkosten dieser Sitzung"));
    active = false; list(true, false, false);
    const auto refreshId = server.last("REQUEST_RESOURCE_LIST")["data"]["payload"]["requestId"].as<uint32_t>();
    server.push("RESOURCE_LIST", "{\"revision\":" + std::to_string(listVersion - 1) + ",\"requestId\":" + std::to_string(refreshId) + ",\"resources\":[]}"); pump();
    assert(label(lv_screen_active(), "Start"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Status wird geladen")));
    active = true; list();
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); list(false); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden")));
    display.capture(output, "12-reconnected-signed-out");
    // Both the personalized identity and usage owner retain all 32 characters.
    username = "abcdefghijklmnopqrstuvwxyz012345";
    login();
    assert(label(lv_screen_active(), "Stop"));
    click("Stop"); server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    active = false; list();
    assert(label(lv_screen_active(), "Start"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Status wird geladen")));
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
    // Real API parser, NFC verification, application callbacks and display loop.
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":"en-US"})"); pump();
    assert(State::getActiveLanguage() == "en" && !State::getApiState().userAuthenticated);
    assert(label(lv_screen_active(), "Tap RFID card or open a resource"));
    assert(label(lv_layer_top(), "Attractap vdesktop"));
    // Finish the preceding journey's screen retirement before testing new
    // overlays. Writing capture files must not decide when that cleanup runs.
    pump(1100);
    display.capture(output, "i18n-default-english");
    const auto defaultLanguage = [&](const char *language) {
        server.push("READER_LANGUAGE", std::string("{\"language\":\"") + language + "\"}");
        pump(0); // Exercise API-to-display settling without relying on elapsed time.
    };
    // Exercise the API parser and application error callback, then refresh the popup.
    server.push("BILLING_TOPUP", R"({"error":"CARD_NOT_ACTIVE"})");
    pump();
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Card is inactive")));
    defaultLanguage("de");
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Karte ist nicht aktiv")));
    display.capture(output, "i18n-popup-german");
    Display::hidePopup();
    server.push("BILLING_TOPUP", R"({"error":"CARD_NOT_ACTIVE"})"); pump();
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Karte ist nicht aktiv")));
    defaultLanguage("en");
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Card is inactive")));
    display.capture(output, "i18n-popup-english");
    Display::hidePopup();
    server.push("BILLING_TOPUP", R"({"error":"UNKNOWN_READER_ERROR"})"); pump();
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Something went wrong. Please try again.")));
    defaultLanguage("de");
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Something went wrong. Please try again.")));
    defaultLanguage("en");
    Display::hidePopup();
    // A real driver touch sequence opens the maintenance drawer.
    display.touch = {240, 10, true}; pump();
    display.touch = {240, 150, true}; pump();
    display.touch.pressed = false; pump();
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Maintenance")));
    defaultLanguage("de");
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Wartung")));
    display.capture(output, "i18n-drawer-german");
    defaultLanguage("en");
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Maintenance")));
    display.capture(output, "i18n-drawer-english");
    click("Reboot", true);
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Reboot device?")));
    defaultLanguage("de");
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Gerät neu starten?")));
    for (const char *caption : {"Gerät neu starten?", "Das Lesegerät wird jetzt neu gestartet."}) {
        lv_font_glyph_dsc_t glyph{};
        const auto *font = lv_obj_get_style_text_font(requireLabel(lv_layer_top(), caption), LV_PART_MAIN);
        assert(lv_font_get_glyph_dsc(font, &glyph, 0x00E4, 0) && !glyph.is_placeholder);
    }
    display.capture(output, "i18n-reboot-german");
    defaultLanguage("en");
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Reboot device?")));
    display.capture(output, "i18n-reboot-english");
    click("Cancel", true);
    assert(!label(lv_layer_top(), "Reboot device?"));
    // Display-module fixtures keep dialogs open while real API locale messages
    // drive the normal display loop. Authentication itself is exercised below.
    {
        ResourceDetailsScreen dialogs;
        API::ResourceBrief resource{};
        resource.id = 1; resource.isHealthy = true;
        std::strcpy(resource.name, "Maintenance");
        dialogs.setResourceAndUsageDetails(resource);
        dialogs.setUserDetails({"Fixture user", true, true, true, false});
        Display::transitionToScreen(&dialogs);
        API::ProjectsOfUserResponse projects{};
        projects.page = 2; projects.limit = 10; projects.total = 50; projects.count = 1;
        projects.items[0] = {42, "Maintenance %s"};
        dialogs.setProjects(projects);
        auto *projectButton = lv_obj_get_parent(label(dialogs.getScreen(), "Choose project"));
        lv_obj_send_event(projectButton, LV_EVENT_CLICKED, nullptr);
        const auto refreshDialogs = [&](const char *language) {
            server.push("READER_LANGUAGE", std::string("{\"language\":\"") + language + "\"}");
            api.loop(); Display::loop(); lv_timer_handler();
        };
        refreshDialogs("de");
        assert(label(lv_layer_top(), "Seite 2 von 5"));
        assert(label(lv_layer_top(), "Maintenance %s"));
        display.capture(output, "i18n-project-dialog-german");
        refreshDialogs("en");
        assert(label(lv_layer_top(), "Page 2 of 5"));
        assert(label(lv_layer_top(), "Maintenance %s"));
        display.capture(output, "i18n-project-dialog-english");
        auto *closeProject = lv_obj_get_parent(label(lv_layer_top(), LV_SYMBOL_CLOSE));
        lv_obj_send_event(closeProject, LV_EVENT_CLICKED, nullptr);
        API::ResourceUsageFormRequest request{};
        request.resourceId = 1; request.action = API::ResourceUsageFormActionType::START;
        request.resourceName = "Maintenance"; request.formCount = 1;
        request.forms[0] = {1, "Notes %s", 1};
        dialogs.showFormsModal(request);
        API::ResourceUsageFormFieldsPage page{};
        page.formId = 1; page.fieldCount = 1;
        page.fields[0].id = 5; page.fields[0].name = "Maintenance";
        page.fields[0].type = API::ResourceUsageFormFieldType::TEXT;
        page.fields[0].isRequired = true;
        dialogs.renderFormField(page, false, true, 2, 3);
        auto *submit = lv_obj_get_parent(label(lv_layer_top(), "Submit"));
        lv_obj_send_event(submit, LV_EVENT_CLICKED, nullptr);
        refreshDialogs("de");
        assert(label(lv_layer_top(), "Pflichtfeld"));
        display.capture(output, "i18n-form-dialog-german");
        refreshDialogs("en");
        assert(label(lv_layer_top(), "Required field"));
        assert(label(lv_layer_top(), "Please complete before starting\nMaintenance - Notes %s"));
        display.capture(output, "i18n-form-dialog-english");
        dialogs.hideFormsModal();
        Display::transitionToScreen(&Display::resourceListScreen);
        pump(1100); // Retire the fixture through the production screen router.
        dialogs.destroy();
    }
    userLocale = "de_AT"; login();
    assert(State::getActiveLanguage() == "de" && State::getApiState().userAuthenticated);
    server.push("READER_LANGUAGE", R"({"language":"de-!!!"})"); pump();
    assert(State::getApiState().defaultLanguage == "en" && State::getActiveLanguage() == "de");
    click("Abmelden");
    assert(State::getActiveLanguage() == "en" && label(lv_screen_active(), "Tap RFID card or open a resource"));
    for (const auto *malformed : {"de-u-12", "de-t-12", "de-US-u-ca-ca-12"}) {
        defaultLanguage("de");
        defaultLanguage(malformed);
        assert(State::getApiState().defaultLanguage == "en" && State::getActiveLanguage() == "en");
        assert(label(lv_screen_active(), "Tap RFID card or open a resource"));
    }
    userLocale = "en-US"; username = "Robin"; login();
    assert(State::getActiveLanguage() == "en");
    server.push("READER_LANGUAGE", R"({"language":"de"})"); pump();
    assert(State::getActiveLanguage() == "en");
    display.capture(output, "i18n-user-english-default-german");
    Display::resourceListScreen.setSessionTimeoutPaused(true);
    pump();
    auto *pausedLabel = requireLabel(lv_screen_active(), "Paused");
    assert(FirmwareI18n::isLocalizedLabel(pausedLabel));
    display.capture(output, "i18n-paused-english");
    // Change the active user locale without rebuilding the header.
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_screen_active(), "Pausiert") == pausedLabel);
    display.capture(output, "i18n-paused-german");
    State::setUserLanguage(true, "en"); pump();
    assert(label(lv_screen_active(), "Paused") == pausedLabel);
    Display::resourceListScreen.setSessionTimeoutPaused(false);
    pump();
    assert(!FirmwareI18n::isLocalizedLabel(pausedLabel));
    const std::string countdown = lv_label_get_text(pausedLabel);
    assert(countdown.ends_with(" s") && std::stoi(countdown) <= 30);
    assert(!label(lv_screen_active(), "Paused") && !label(lv_screen_active(), "Pausiert"));
    click("Sign out");
    assert(State::getActiveLanguage() == "de");
    username = "Alex"; userLocale = ""; login();
    assert(State::getApiState().userAuthenticated && State::getActiveLanguage() == "en");
    click("Sign out");
    // Resource-first authentication uses the verified cardholder locale.
    list(false); click("Lasercutter"); userLocale = "en"; login(false);
    assert(State::getActiveLanguage() == "en" && lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), "Choose project"));
    display.capture(output, "i18n-resource-first-english");
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(!State::getApiState().userAuthenticated && State::getActiveLanguage() == "de");
    State::setWebsocketState(true, "reader.test", 80, false);
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":"en"})"); list(false); pump();
    assert(State::getActiveLanguage() == "en");
    // A failed NFC verification cannot activate the advertised language.
    nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
    server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Wrong card","language":"de","keyNo":0,"key":"11111111111111111111111111111111"})"); pump();
    assert(!State::getApiState().userAuthenticated && State::getActiveLanguage() == "en");
    assert(label(lv_layer_top(), "Sign-in failed"));
    display.capture(output, "i18n-failed-verification-default");
    Display::hidePopup(); nfc.setPresent(0, false); pump();
    server.push("READER_LANGUAGE", R"({"language":"de"})"); pump();
    // API rejection clears the session and keeps the most recent default.
    userLocale = "en"; login();
    server.push("READER_UNAUTHORIZED", R"({"message":"PLEASE_REREGISTER"})"); pump();
    assert(!State::getApiState().authenticated && !State::getApiState().userAuthenticated);
    assert(State::getActiveLanguage() == "de");
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":""})"); list(false); pump();
    assert(State::getActiveLanguage() == "en");
    // A rolled-back server omits the additive language field entirely.
    server.push("READER_AUTHENTICATED", R"({"name":"Legacy server"})"); list(false); pump();
    assert(State::getApiState().authenticated && State::getActiveLanguage() == "en");
    Settings::saveNetworkConfig("Maintenance %s", "test-password");
    Display::transitionToScreen(&Display::connectionConfigurationScreen);
    Display::loop();
    assert(label(lv_screen_active(), "Device"));
    display.capture(output, "i18n-configuration-pin-english");
    // The PIN prompt is covered separately; inspect the actual configuration
    // controls after unlocking, including retained data and the selected tab.
    Display::connectionConfigurationScreen.disablePinLock();
    auto *configurationTabs = lv_obj_get_child(lv_screen_active(), 0);
    assert(lv_obj_check_type(configurationTabs, &lv_tabview_class));
    const auto captureConfiguration = [&](const char *language) {
        for (uint32_t tab = 0; tab < 3; ++tab) {
            lv_tabview_set_active(configurationTabs, tab, LV_ANIM_OFF);
            Display::loop();
            const std::string name = std::string("i18n-configuration-") + language + "-" + std::to_string(tab);
            display.capture(output, name.c_str());
        }
    };
    captureConfiguration("english");
    assert(lv_tabview_get_tab_active(configurationTabs) == 2);
    server.push("READER_LANGUAGE", R"({"language":"de"})"); api.loop(); Display::loop();
    assert(label(lv_screen_active(), "Gerät"));
    assert(label(lv_screen_active(), "Maintenance %s"));
    assert(lv_tabview_get_tab_active(configurationTabs) == 2);
    captureConfiguration("german");
    server.push("READER_LANGUAGE", R"({"language":"en"})"); api.loop(); Display::loop();
    assert(label(lv_screen_active(), "Device"));
    assert(label(lv_screen_active(), "Maintenance %s"));
    assert(lv_tabview_get_tab_active(configurationTabs) == 2);
    captureConfiguration("english");
    server.push("READER_LANGUAGE", R"({"language":"de"})"); api.loop(); Display::loop();
    Display::transitionToScreen(&Display::resourceListScreen); pump();
    userLocale = "de"; username = "Alex"; list(false);
    // Own-session summary works from both list and details and survives duplicate replies.
    supervised = false;
    active = true; login();
    auto stopReply = [&](const std::string &metadata, bool stale = false) {
        auto id = server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
        server.push("STOP_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(stale ? id + 100 : id) + "," + metadata + "}");
        pump();
    };
    click("Lasercutter"); click("Sitzung beenden");
    stopReply(R"("success":true,"durationSeconds":360000,"endedOwnSession":true)", true);
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    stopReply(R"("success":true,"durationSeconds":360000,"endedOwnSession":true,"billingSummary":{"amount":0,"total":"0,00 EUR"})");
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    assert(label(lv_screen_active(), "100:00:00"));
    assert(!label(lv_screen_active(), "Abgerechnet"));
    assert(lv_obj_get_x(label(lv_screen_active(), "Dauer")) == 140);
    display.capture(output, "session-summary-unbilled");
    stopReply(R"("success":true,"durationSeconds":1,"endedOwnSession":true)");
    assert(label(lv_screen_active(), "100:00:00"));
    const auto stopsAtSummary = server.count("STOP_RESOURCE_USAGE_SESSION");
    pump(3000); assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    pump(600); assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsAtSummary);
    login(); click("Stop");
    stopReply(R"("success":true,"durationSeconds":0,"endedOwnSession":true)");
    assert(label(lv_screen_active(), "00:00:00"));
    display.touch = {1, 1, true}; pump(); display.touch.pressed = false; pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    // Incorrect metadata and another owner's stop retain the legacy completion flow.
    for (const auto &metadata : {
        R"("success":true,"durationSeconds":-1,"endedOwnSession":true,"billingSummary":{"amount":1250,"total":"12,50 EUR"})",
        R"("success":true,"durationSeconds":1.5,"endedOwnSession":true)",
        R"("success":true,"durationSeconds":"1","endedOwnSession":true)",
        R"("success":true,"durationSeconds":4294967296,"endedOwnSession":true)",
        R"("success":true,"durationSeconds":1,"endedOwnSession":"true")",
        R"("success":true,"durationSeconds":1,"endedOwnSession":false)",
        R"("success":true)",
        R"("error":"Stop denied","durationSeconds":1,"endedOwnSession":true)"}) {
        login(); click("Stop"); stopReply(metadata); list();
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(label(lv_screen_active(), "Alex"));
        if (std::string(metadata).find("billingSummary") != std::string::npos)
            assert(label(lv_layer_top(), "12,50 EUR"));
        Display::hidePopup(); click("Abmelden");
    }
    username = "abcdefghijklmnopqrstuvwxyz012345";
    login(); click("Stop");
    stopReply(R"("success":true,"durationSeconds":1426,"endedOwnSession":true,"billingSummary":{"amount":1234567890,"total":"12.345.678.901,23 EUR"})");
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    display.capture(output, "session-summary-long-values");
    lv_obj_t *greeting = nullptr;
    for (uint32_t i = 0; i < lv_obj_get_child_count(lv_screen_active()); ++i) {
        auto *child = lv_obj_get_child(lv_screen_active(), i);
        if (lv_obj_check_type(child, &lv_label_class) &&
            std::strncmp(lv_label_get_text(child), "Danke, ", 7) == 0) greeting = child;
    }
    assert(greeting);
    lv_area_t greetingBounds, durationBounds, chargeBounds, farewellBounds;
    lv_obj_get_coords(greeting, &greetingBounds);
    lv_obj_get_coords(label(lv_screen_active(), "Dauer"), &durationBounds);
    lv_obj_get_coords(label(lv_screen_active(), "12.345.678.901,23 EUR"), &chargeBounds);
    lv_obj_get_coords(label(lv_screen_active(), "Bis bald!"), &farewellBounds);
    assert(greetingBounds.y2 < durationBounds.y1);
    assert(chargeBounds.y2 < farewellBounds.y1 && chargeBounds.x2 < 480);

    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen());
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(!label(lv_screen_active(), "Danke, abcdefghijklmnopqrstuvwxyz012345!"));
    username = "Alex";
    login();
    if (timeouts) {
        server.push("READER_LANGUAGE", R"({"language":"en"})"); pump();
        login();
        const auto stopsBeforeTimeout = server.count("STOP_RESOURCE_USAGE_SESSION");
        pump(31050);
        assert(!State::getApiState().userAuthenticated && State::getActiveLanguage() == "en");
        assert(label(lv_screen_active(), "Tap RFID card or open a resource"));
        server.push("READER_LANGUAGE", R"({"language":"de"})"); pump();
        assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeTimeout);
        std::cout << "PASS idle login expiry preserves running usage" << std::endl;
        active = false; login(); click("Start");
        pump(31050);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(label(lv_screen_active(), "Pausiert"));
        // An unconfirmed action gets a fresh 30-second status-refresh window.
        pump(30500);
        assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden")));
        assert(label(lv_screen_active(), "Status wird geladen"));
        assert(label(lv_layer_top(), "Aktion nicht bestätigt"));
        Display::hidePopup(); active = true; list();
        assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden")));
        std::cout << "PASS action pauses the real 30-second login timeout" << std::endl;
        click("Abmelden");
        nfc.setPresent(0, true); pump(); nfc.setPresent(0, false); pump();
        // The waiting card-key request also rejects a competing web approval.
        server.push("SUPERVISION_START", R"({"resourceId":1,"requesterName":"Robin","timeoutMs":30000})"); pump();
        assert(lv_screen_active() != Display::supervisionScreen.getScreen());
        server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Alex","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})"); pump();
        pump(31050);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden")));
        assert(label(lv_layer_top(), "Anmeldung fehlgeschlagen"));
        std::cout << "PASS lifted card authentication expires and recovers" << std::endl;
    }
    std::filesystem::remove_all(storage);
    std::cout << "PASS ATT-880 production application journeys\n";
}
