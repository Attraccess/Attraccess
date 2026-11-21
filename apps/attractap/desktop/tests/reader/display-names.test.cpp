#include "workflow.hpp"
#include <memory>

// ATT-1385: readers show the display name the server sends, fall back to the username, and keep the
// username as the identity. Names are cut to 79 bytes in whole UTF-8 characters.
namespace
{
// Every multi-byte UTF-8 sequence in `text` is complete.
bool wholeUtf8(const std::string &text)
{
    size_t i = 0;
    while (i < text.size()) {
        const unsigned char lead = static_cast<unsigned char>(text[i]);
        const size_t length = lead < 0x80 ? 1 : lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 0;
        if (length == 0 || i + length > text.size()) return false;
        for (size_t j = 1; j < length; ++j)
            if ((static_cast<unsigned char>(text[i + j]) & 0xC0) != 0x80) return false;
        i += length;
    }
    return true;
}

// About 200 characters, the most the server sends. Byte 79 starts an "Ä", so the cut to the 80-byte
// display-name buffers (79 bytes and the terminator) lands inside it and must drop it whole.
std::string longDisplayName()
{
    std::string name = "Maximiliane ";
    while (name.size() < 78) name += "Mustermann-";
    name.resize(78);
    name += "\xC3\x84rger\xC3\xBC\xC3\x9F";
    while (name.size() < 199) name += " \xC3\x96lm\xC3\xBCller";
    return name;
}

const std::string LONG_NAME = longDisplayName();
const std::string LONG_NAME_CUT = LONG_NAME.substr(0, 78);

lv_obj_t *labelContaining(lv_obj_t *root, const std::string &part)
{
    if (!root) return nullptr;
    if (lv_obj_check_type(root, &lv_label_class) && std::strstr(lv_label_get_text(root), part.c_str())) return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = labelContaining(lv_obj_get_child(root, i), part)) return found;
    return nullptr;
}

// The label that shows the long name after `before`: whole characters, a prefix of the cut name (LVGL
// may shorten it further with dots), never past the 79-byte cut.
void expectLongNameShown(lv_obj_t *root, const std::string &before = "")
{
    auto *shown = labelContaining(root, before + LONG_NAME.substr(0, 3));
    if (!shown) throw std::runtime_error("Missing label with the long display name");
    std::string text = lv_label_get_text(shown);
    assert(wholeUtf8(text));
    text = text.substr(text.find(before) + before.size());
    if (text.size() >= 3 && text.compare(text.size() - 3, 3, "...") == 0) text.resize(text.size() - 3);
    assert(text.size() <= LONG_NAME_CUT.size());
    assert(LONG_NAME_CUT.compare(0, text.size(), text) == 0);
}

struct Parsed
{
    API::CardAuthenticationDetailsResponse card;
    std::pair<std::string, std::string> reset, enroll;
    API::ResourceList list;
    API::SupervisionRequestResult request;
    API::SupervisionStartCommand start;
    API::SupervisorCardAuthenticationResponse supervisorCard;
    API::SupervisionResolvedResult resolved;
    API::MassIntroductionStartCommand massStart;
    API::MassIntroductionResult massResult;
};

std::string quoted(const std::string &text) { return "\"" + text + "\""; }
}

void testDisplayNameParsing()
{
    Server server;
    API api{server};
    api.setup();
    auto parsed = std::make_unique<Parsed>();
    api.setCardAuthenticationDetailsResponseCallback([&](API::CardAuthenticationDetailsResponse value) { parsed->card = value; });
    api.setResetNfcCardCallback([&](std::string username, std::string shown) { parsed->reset = {username, shown}; });
    api.setEnrollNewCardGetAvailableKeyNoCallback([&](std::string username, std::string shown) { parsed->enroll = {username, shown}; });
    api.setResourceListUpdateCallback([&](const API::ResourceList &value) { parsed->list = value; });
    api.setSupervisionRequestResultCallback([&](API::SupervisionRequestResult value) { parsed->request = value; });
    api.setSupervisionStartCallback([&](API::SupervisionStartCommand value) { parsed->start = value; });
    api.setSupervisorCardAuthenticationResponseCallback([&](API::SupervisorCardAuthenticationResponse value) { parsed->supervisorCard = value; });
    api.setSupervisionResolvedCallback([&](API::SupervisionResolvedResult value) { parsed->resolved = value; });
    api.setMassIntroductionStartCallback([&](const API::MassIntroductionStartCommand &value) { parsed->massStart = value; });
    api.setMassIntroductionResultCallback([&](const API::MassIntroductionResult &value) { parsed->massResult = value; });
    const auto deliver = [&](const char *type, const std::string &payload) { server.push(type, payload); server.loop(); };
    assert(LONG_NAME.size() > 190 && LONG_NAME_CUT.size() == 78 && wholeUtf8(LONG_NAME) && wholeUtf8(LONG_NAME_CUT));

    // Card authentication, card reset and enrollment: the display name, else the username; the username stays.
    deliver("CARD_AUTHENTICATION_DATA", R"({"username":"ada","displayName":"Ada Lovelace"})");
    assert(parsed->card.username == "ada" && parsed->card.displayName == "Ada Lovelace");
    deliver("CARD_AUTHENTICATION_DATA", R"({"username":"ada"})");
    assert(parsed->card.displayName == "ada");
    deliver("CARD_AUTHENTICATION_DATA", R"({"username":"ada","displayName":""})");
    assert(parsed->card.displayName == "ada");
    deliver("CARD_AUTHENTICATION_DATA", "{\"username\":\"ada\",\"displayName\":" + quoted(LONG_NAME) + "}");
    assert(parsed->card.username == "ada" && parsed->card.displayName == LONG_NAME_CUT);
    for (const char *type : {"RESET_NFC_CARD", "ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO"}) {
        auto &target = std::strcmp(type, "RESET_NFC_CARD") == 0 ? parsed->reset : parsed->enroll;
        deliver(type, R"({"username":"ada","displayName":"Ada Lovelace"})");
        assert(target.first == "ada" && target.second == "Ada Lovelace");
        deliver(type, R"({"username":"ada"})");
        assert(target.first == "ada" && target.second == "ada");
        deliver(type, "{\"username\":\"ada\",\"displayName\":" + quoted(LONG_NAME) + "}");
        assert(target.first == "ada" && target.second == LONG_NAME_CUT);
    }

    // RESOURCE_LIST: the signed-in user, session users and introducers.
    JsonDocument list;
    list["messageId"] = 1;
    list["authenticatedUsername"] = "ada";
    list["authenticatedDisplayName"] = LONG_NAME;
    auto resources = list["resources"].to<JsonArray>();
    auto withNames = resources.add<JsonObject>();
    withNames["id"] = 1;
    withNames["name"] = "Lasercutter";
    withNames["activeUsageSession"]["id"] = 7;
    withNames["activeUsageSession"]["user"]["username"] = "bob";
    withNames["activeUsageSession"]["user"]["displayName"] = "Bob Builder";
    withNames["activeUsageSession"]["startTime"] = "2026-01-01T10:00:00Z";
    auto sessions = withNames["activeUsageSessions"].to<JsonArray>();
    auto first = sessions.add<JsonObject>();
    first["id"] = 7;
    first["user"]["username"] = "bob";
    first["user"]["displayName"] = LONG_NAME;
    auto second = sessions.add<JsonObject>();
    second["id"] = 8;
    second["user"]["username"] = "cy";
    for (const char *name : {"ina", "joe", "kim"}) withNames["introducers"].add(name);
    for (const std::string &name : {std::string("Ina Tutor"), std::string(), LONG_NAME}) withNames["introducerDisplayNames"].add(name);
    auto mismatched = resources.add<JsonObject>();
    mismatched["id"] = 2;
    mismatched["name"] = "CNC Fräse";
    mismatched["activeUsageSession"]["id"] = 9;
    mismatched["activeUsageSession"]["user"]["username"] = "dora";
    mismatched["activeUsageSession"]["startTime"] = "2026-01-01T10:00:00Z";
    for (const char *name : {"ina", "joe"}) mismatched["introducers"].add(name);
    mismatched["introducerDisplayNames"].add("Ina Tutor");
    auto older = resources.add<JsonObject>();
    older["id"] = 3;
    older["name"] = "Werkstatttür";
    older["introducers"].add("ina");
    std::string payload;
    serializeJson(list, payload);
    deliver("RESOURCE_LIST", payload);
    const auto &parsedList = parsed->list;
    assert(parsedList.count == 3);
    assert(std::string(parsedList.authenticatedUsername) == "ada" && std::string(parsedList.authenticatedDisplayName) == LONG_NAME_CUT);
    const auto &laser = parsedList.items[0];
    assert(std::string(laser.activeUser) == "bob" && std::string(laser.activeUserDisplayName) == "Bob Builder");
    assert(laser.activeSessions.size() == 2);
    assert(std::string(laser.activeSessions[0].username) == "bob" && std::string(laser.activeSessions[0].displayName) == LONG_NAME_CUT);
    assert(std::string(laser.activeSessions[1].username) == "cy" && std::string(laser.activeSessions[1].displayName) == "cy");
    assert((laser.introducers == std::vector<std::string>{"ina", "joe", "kim"}));
    assert((laser.introducerDisplayNames == std::vector<std::string>{"Ina Tutor", "joe", LONG_NAME_CUT}));
    // Lists of another length cannot be matched up: the screen shows the usernames.
    assert(std::string(parsedList.items[1].activeUserDisplayName) == "dora");
    assert(parsedList.items[1].introducers.size() == 2 && parsedList.items[1].introducerDisplayNames.empty());
    assert(parsedList.items[2].introducers.size() == 1 && parsedList.items[2].introducerDisplayNames.empty());
    list["messageId"] = 2;
    list.remove("authenticatedDisplayName");
    payload.clear();
    serializeJson(list, payload);
    deliver("RESOURCE_LIST", payload);
    assert(std::string(parsed->list.authenticatedDisplayName) == "ada");

    // Supervision: supervisor list, requester, supervisor card and resolution.
    deliver("SUPERVISION_REQUEST", "{\"success\":true,\"supervisorNames\":[\"ina\",\"joe\",\"kim\"],"
                                   "\"supervisorDisplayNames\":[\"Ina Tutor\",\"\"," + quoted(LONG_NAME) + "]}");
    assert(parsed->request.success && parsed->request.supervisorCount == 3);
    assert(parsed->request.supervisorNames[2] == "kim");
    assert(parsed->request.supervisorDisplayNames[0] == "Ina Tutor" && parsed->request.supervisorDisplayNames[1] == "joe" &&
           parsed->request.supervisorDisplayNames[2] == LONG_NAME_CUT);
    deliver("SUPERVISION_REQUEST", R"({"success":true,"supervisorNames":["ina"]})");
    assert(parsed->request.supervisorCount == 1 && parsed->request.supervisorDisplayNames[0] == "ina");
    deliver("SUPERVISION_START", "{\"resourceId\":1,\"timeoutMs\":30000,\"requesterUsername\":\"ada\",\"requesterDisplayName\":" + quoted(LONG_NAME) + "}");
    assert(parsed->start.requesterUsername == "ada" && parsed->start.requesterDisplayName == LONG_NAME_CUT);
    deliver("SUPERVISION_START", R"({"resourceId":1,"timeoutMs":30000,"requesterUsername":"ada"})");
    assert(parsed->start.requesterDisplayName == "ada");
    deliver("SUPERVISOR_CARD_AUTHENTICATION_DATA", R"({"username":"ina","displayName":"Ina Tutor"})");
    assert(parsed->supervisorCard.username == "ina" && parsed->supervisorCard.displayName == "Ina Tutor");
    deliver("SUPERVISOR_CARD_AUTHENTICATION_DATA", R"({"username":"ina"})");
    assert(parsed->supervisorCard.displayName == "ina");
    deliver("SUPERVISION_RESOLVED", R"({"success":true,"supervisorUsername":"ina","supervisorDisplayName":"Ina Tutor"})");
    assert(parsed->resolved.supervisorUsername == "ina" && parsed->resolved.supervisorDisplayName == "Ina Tutor");
    deliver("SUPERVISION_RESOLVED", R"({"success":true,"supervisorUsername":"ina"})");
    assert(parsed->resolved.supervisorDisplayName == "ina");

    // Mass introduction: the introducer and each participant.
    deliver("MASS_INTRODUCTION_START", "{\"sessionId\":\"s\",\"targetName\":\"Lasercutter\",\"introducerUsername\":\"robin\","
                                       "\"introducerDisplayName\":" + quoted(LONG_NAME) + "}");
    assert(parsed->massStart.introducerUsername == "robin" && parsed->massStart.introducerDisplayName == LONG_NAME_CUT);
    deliver("MASS_INTRODUCTION_START", R"({"sessionId":"s","targetName":"Lasercutter","introducerUsername":"robin"})");
    assert(parsed->massStart.introducerDisplayName == "robin");
    deliver("MASS_INTRODUCTION_RESULT", R"({"sessionId":"s","success":true,"username":"alex","displayName":"Alex Beispiel"})");
    assert(parsed->massResult.username == "alex" && parsed->massResult.displayName == "Alex Beispiel");
    deliver("MASS_INTRODUCTION_RESULT", R"({"sessionId":"s","success":true,"username":"alex"})");
    assert(parsed->massResult.displayName == "alex");
    std::cout << "PASS display-name fields parse with username fallback and UTF-8-safe cuts" << std::endl;
}

void ReaderWorkflow::testDisplayNames()
{
    const auto signOut = [&] {
        if (lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden"))) click("Abmelden");
        list(false);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    };

    // Signed in: the header shows the display name, the list stays personalised by the username.
    username = "ada";
    displayName = "Ada Lovelace";
    active = true;
    login();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    requireLabel(lv_screen_active(), "Ada Lovelace");
    assert(!label(lv_screen_active(), "ada"));
    assert(label(lv_screen_active(), "Stop")); // the own session, found by the username
    display.capture(output, "display-name-list");
    click("Lasercutter");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    requireLabel(lv_screen_active(), "Ada Lovelace");
    requireLabel(lv_screen_active(), "Sitzung beenden");
    display.capture(output, "display-name-details");

    // The session summary thanks the display name.
    click("Sitzung beenden");
    const auto stopId = server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
    server.push("STOP_RESOURCE_USAGE_SESSION",
                "{\"requestId\":" + std::to_string(stopId) + R"(,"success":true,"durationSeconds":60,"endedOwnSession":true})");
    pump();
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    requireLabel(lv_screen_active(), "Danke, Ada Lovelace!");
    display.touch = {1, 1, true}; pump(); display.touch.pressed = false; pump();
    active = false;
    signOut();
    std::cout << "PASS the signed-in display name on list, details and session summary" << std::endl;

    // Introducers by display name; lists that do not match up show the usernames.
    login();
    introducers = {"ina", "joe"};
    introducerDisplayNames = {"Ina Tutor", "Joe Doe"};
    list();
    click("CNC Fräse");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    requireLabel(lv_screen_active(), "Ina Tutor\nJoe Doe");
    display.capture(output, "display-name-introducers");
    introducerDisplayNames = {"Ina Tutor"};
    list();
    requireLabel(lv_screen_active(), "ina\njoe");
    click(LV_SYMBOL_LEFT);

    // Reader-started supervision: the requester and the supervisors by display name.
    supervised = true;
    list();
    click("Aufsicht");
    assert(lv_screen_active() == Display::supervisionScreen.getScreen());
    requireLabel(lv_screen_active(), "Ada Lovelace");
    server.push("SUPERVISION_REQUEST", R"({"success":true,"supervisorNames":["ina","joe"],"supervisorDisplayNames":["Ina Tutor","Joe Doe"]})");
    pump();
    if (!labelContaining(lv_screen_active(), "Ina Tutor, Joe Doe")) throw std::runtime_error("Missing supervisor display names");
    display.capture(output, "display-name-supervision");
    pump(1100); click("Abbrechen");
    supervised = false;
    list();
    signOut();
    std::cout << "PASS introducers and supervisors by display name, usernames for an older server" << std::endl;

    // Web-started supervision, card reset and enrollment name the user by display name, else the username.
    server.push("SUPERVISION_START", R"({"resourceId":1,"timeoutMs":30000,"requesterUsername":"bob","requesterDisplayName":"Bob Builder"})");
    pump();
    assert(lv_screen_active() == Display::supervisionScreen.getScreen());
    requireLabel(lv_screen_active(), "Bob Builder");
    pump(1100); click("Abbrechen"); pump(300);
    list(false);
    for (const char *flow : {"RESET_NFC_CARD", "ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO"}) {
        const bool reset = std::strcmp(flow, "RESET_NFC_CARD") == 0;
        for (const char *payload : {R"({"username":"ada","displayName":"Ada Lovelace"})", R"({"username":"ada"})"}) {
            server.push(flow, payload);
            pump();
            // The screen is created when it is first shown.
            assert(lv_screen_active() == (reset ? Display::resetScreen.getScreen() : Display::enrollmentScreen.getScreen()));
            requireLabel(lv_screen_active(), std::strstr(payload, "displayName") ? "Ada Lovelace" : "ada");
            click("Abbrechen");
            pump(300);
            list(false);
            assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        }
    }
    std::cout << "PASS web supervision, card reset and enrollment by display name" << std::endl;

    // A 200-character name with umlauts is cut in whole characters and fits the layout; the username
    // still identifies the own session.
    displayName = LONG_NAME;
    active = true;
    login();
    expectLongNameShown(lv_screen_active());
    assert(label(lv_screen_active(), "Stop"));
    display.capture(output, "display-name-long-list");
    click("Lasercutter");
    expectLongNameShown(lv_screen_active());
    requireLabel(lv_screen_active(), "Sitzung beenden");
    display.capture(output, "display-name-long-details");
    click(LV_SYMBOL_LEFT);
    signOut();

    // Someone else's session on the lock screen: their display name, cut the same way.
    activeUser = "bob";
    activeUserDisplayName = LONG_NAME;
    list(false);
    click("Lasercutter");
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    expectLongNameShown(lv_screen_active(), "In Verwendung: ");
    display.capture(output, "display-name-long-lockscreen");
    activeUserDisplayName = "Bob Builder";
    list(false);
    // The lock screen's status line is narrow: "Bob Builder" ends in dots, "Bob" tells it from "bob".
    if (!labelContaining(lv_screen_active(), "In Verwendung: Bob")) throw std::runtime_error("Missing other user's display name");
    activeUserDisplayName.clear();
    list(false);
    requireLabel(lv_screen_active(), "In Verwendung: bob");
    std::cout << "PASS long display names stay whole UTF-8 and fit; the username stays the identity" << std::endl;

    activeUser.clear();
    active = false;
    username = "Alex";
    displayName.clear();
    introducers.clear();
    introducerDisplayNames.clear();
}
