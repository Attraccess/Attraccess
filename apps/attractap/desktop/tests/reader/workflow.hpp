#pragma once
#include "server-fixtures.hpp"

struct ReaderProfileConfiguration
{
    explicit ReaderProfileConfiguration(ProfileStore &profile)
    {
        KVStore::setHostProfile(&profile);
        Settings::setup();
        Settings::saveAttraccessApiConfig("reader.test", 80, false);
        Settings::saveAttraccessAuthConfig("test", 880);
        Settings::setDevicePin("1234");
    }
};

struct ReaderWorkflow
{
    std::filesystem::path output;
    std::filesystem::path storage;
    ProfileStore profile;
    ReaderProfileConfiguration configuration{profile};
    Server server;
    API api{server};
    VirtualNfc nfc{profile};
    Application application{nfc, api};
    Framebuffer display;
    unsigned listVersion = 0;
    std::string username = "Alex";
    bool active = false, supervised = false;
    uint32_t activeUsageId = 99;
    std::string longDescription;
    lv_area_t fullDescriptionBounds{};
    lv_obj_t *drawerSettingsBeforeLogin = nullptr;
    lv_obj_t *networkBadge = nullptr;
    explicit ReaderWorkflow(const std::filesystem::path &output)
      : output(output),
        storage(std::filesystem::temp_directory_path() / ("att-880-reader-test-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()))),
        profile("http://reader.test", 880, storage)
    {
    Display::setup(display);
    application.setup();
    State::setWifiState(true, {}, "Test");
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader");
    longDescription =
        "RFI 5-2 · Angstrom Engineering · Åmod · evaporation tool with a long description that must remain readable in details. ";
    while (longDescription.size() < 600)
        longDescription += "Operating notes, preparation, ventilation, and cleaning instructions remain available to the reader. ";
    longDescription += "Final inspection and shutdown steps.";
      setQuality(State::NETWORK_QUALITY_GOOD);
    }
    static void setQuality(State::NetworkQuality quality) {
        State::setNetworkQualityState(quality, 0, 0, 0, 0, 0, 0, 20, 20, 0, 0, 0, 0);
    }
    void pump(uint32_t duration = 60) {
        const auto end = millis() + duration;
        do { application.loop(); lv_timer_handler(); std::this_thread::sleep_for(std::chrono::milliseconds(5)); }
        while (static_cast<int32_t>(end - millis()) > 0);
    }
    void click(const char *text, bool popup = false) {
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
    }
    void list(bool signedIn = true, bool onlyOne = false, bool correlate = true) {
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
    }
    void login(bool refresh = true) {
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
    }
    void testListAndAuthentication();
    void testSessionStart();
    void testUsageStats();
    void testFormsAndLogout();
    void testSupervisionAndCorrelation();
    void testIdentityAndPendingAuthentication();
    void testSessionSummary();
    void testTimeouts();
};
