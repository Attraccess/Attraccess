#include "render_harness.hpp"
#include "display/shared/sessionOccupancy.hpp"

namespace {
API::ResourceBrief machine(const char *name, uint16_t limit, uint16_t active)
{
    API::ResourceBrief resource{};
    resource.id = 1;
    std::strcpy(resource.name, name);
    resource.isHealthy = true;
    resource.accessKnown = true;
    resource.hasIntroduction = true;
    resource.maxParallelSessions = limit;
    resource.activeSessionCount = active;
    resource.canStart = active < limit;
    return resource;
}

void addSession(API::ResourceBrief &resource, uint32_t id, const char *user, bool own)
{
    API::ActiveSession session{};
    session.id = id;
    std::strcpy(session.username, user);
    resource.activeSessions.push_back(session);
    if (own) {
        resource.hasOwnUsage = true;
        resource.ownUsageId = id;
    }
    if (own || !resource.hasOwnUsage) {
        resource.hasActiveUsage = true;
        resource.activeUsageId = id;
        std::strcpy(resource.activeUser, user);
    }
}

bool hidden(lv_obj_t *label)
{
    for (auto *object = label; object; object = lv_obj_get_parent(object))
        if (lv_obj_has_flag(object, LV_OBJ_FLAG_HIDDEN)) return true;
    return false;
}

// The rendered text must not be cut by the label: the widest rendered line fits the label's content width.
bool labelFits(lv_obj_t *line)
{
    lv_obj_update_layout(line);
    lv_point_t size{};
    const std::string text = lv_label_get_text(line);
    lv_text_get_size(&size, text.c_str(), lv_obj_get_style_text_font(line, LV_PART_MAIN), 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
    // LV_LABEL_LONG_DOT rewrites the label's text in place: a cut line is short but ends in dots.
    const bool cutByLabel = text.size() >= 3 && text.compare(text.size() - 3, 3, "...") == 0;
    return size.x <= lv_obj_get_content_width(line) && !cutByLabel;
}

// The first label whose text ends in `tail`.
lv_obj_t *labelEndingWith(lv_obj_t *root, const std::string &tail)
{
    lv_obj_update_layout(root);
    if (lv_obj_check_type(root, &lv_label_class)) {
        const std::string text = lv_label_get_text(root);
        if (text.size() >= tail.size() && text.compare(text.size() - tail.size(), tail.size(), tail) == 0) return root;
    }
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = labelEndingWith(lv_obj_get_child(root, i), tail)) return found;
    return nullptr;
}
}

void testParallelSessionPolicy()
{
    auto resource = machine("Printer", 3, 2);
    addSession(resource, 7, "Robin", false);
    addSession(resource, 8, "Sam", false);
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Start, "A free slot offers Start without takeover");
    resource.allowTakeOver = true;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Start, "Parallel machines never take over");
    resource.canStart = false;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::None, "A user who cannot start gets no quick action");
    resource.activeSessionCount = 3;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::None, "A full machine offers no start");
    addSession(resource, 9, "Alex", true);
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Stop, "Own session on a parallel machine offers Stop");
    auto single = machine("Mill", 1, 1);
    addSession(single, 5, "Robin", false);
    single.canStart = false;
    single.allowTakeOver = true;
    expect(resourceListAction(single, "Alex") == ResourceListAction::Takeover, "Limit 1 keeps takeover");
    single.allowTakeOver = false;
    expect(resourceListAction(single, "Alex") == ResourceListAction::None, "Limit 1 keeps blocking foreign sessions");
    expect(!single.isMultiSession(), "Limit 1 with one session keeps the single-session UI");

    // A limit lowered to 1 while two sessions run keeps the parallel UI: no takeover, no start.
    auto lowered = machine("Lowered", 1, 2);
    addSession(lowered, 5, "Robin", false);
    addSession(lowered, 6, "Sam", false);
    lowered.canStart = false;
    lowered.allowTakeOver = true;
    expect(lowered.isMultiSession(), "Lowered limit with two sessions uses the parallel UI");
    expect(SessionOccupancy::level(lowered) == SessionOccupancy::Level::Full, "Over-capacity reads as full");
    expect(resourceListAction(lowered, "Alex") == ResourceListAction::None, "Lowered limit offers no takeover or start");
    lowered.type = 1;
    expect(!lowered.isMultiSession(), "Doors never use the parallel UI");

    // A personalised list decides ownership by its own-session info, not by the shown name.
    auto named = machine("Named", 3, 1);
    addSession(named, 5, "Alex", false);
    expect(!named.hasOwnUsage && resourceListAction(named, "Alex") != ResourceListAction::Stop,
           "A matching name without an own session is not ownership");
    expect(named.isOwnedBy("Alex", false), "Unpersonalised lists fall back to the shown name");
    named.hasOwnUsage = true;
    named.ownUsageId = 5;
    expect(resourceListAction(named, "Alex") == ResourceListAction::Stop, "The own session offers Stop");
}

void testParallelSessionList(Renderer &renderer)
{
    ResourceListScreen list;
    API::ResourceList resources{};
    resources.count = 4;
    std::strcpy(resources.authenticatedUsername, "Alex");
    const char *names[] = {"Printer", "Full printer", "Own printer", "Mill"};
    for (int i = 0; i < 4; ++i) {
        resources.items[i] = machine(names[i], i == 3 ? 1 : 3, 0);
        resources.items[i].id = i + 1;
    }
    resources.items[0].activeSessionCount = 2;
    addSession(resources.items[0], 10, "Robin", false);
    addSession(resources.items[0], 11, "Sam", false);
    resources.items[1].activeSessionCount = 3;
    resources.items[1].canStart = false;
    for (uint32_t id = 20; id < 23; ++id) addSession(resources.items[1], id, "Robin", false);
    resources.items[2].activeSessionCount = 1;
    resources.items[2].canStart = false;
    addSession(resources.items[2], 30, "Alex", true);
    resources.items[3].activeSessionCount = 1;
    resources.items[3].canStart = false;
    addSession(resources.items[3], 40, "Robin", false);
    list.setResourceList(resources);
    list.setAuthenticatedUser("Alex");
    list.init();
    ScreenGuard guard(list.getScreen(), &list);
    requireObject(guard.root, &lv_label_class, "Robin, Sam \u00B7 2/3");
    requireObject(guard.root, &lv_label_class, "Robin, Robin, Robin \u00B7 Voll");
    requireObject(guard.root, &lv_label_class, "Du \u00B7 1/3");
    requireObject(guard.root, &lv_label_class, "In Verwendung: Robin");
    requireObject(guard.root, &lv_label_class, "Stop");
    renderer.capture("parallel-sessions-list");
    uint32_t acted = 0;
    ResourceListAction action = ResourceListAction::None;
    list.setActionCallback([&](const auto &resource, auto value) { acted = resource.id; action = value; });
    lv_obj_send_event(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Start")), LV_EVENT_CLICKED, nullptr);
    expect(acted == 1 && action == ResourceListAction::Start, "Busy parallel machine still starts");
    acted = 0;
    auto *fullRow = lv_obj_get_parent(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Full printer")));
    expect(!lv_obj_has_flag(lv_obj_get_child(fullRow, 1), LV_OBJ_FLAG_CLICKABLE), "Full machine row cannot start");
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(guard.root, &lv_label_class, "Robin, Sam \u00B7 2/3");
    requireObject(guard.root, &lv_label_class, "Robin, Robin, Robin \u00B7 Full");
    requireObject(guard.root, &lv_label_class, "You \u00B7 1/3");
    requireObject(guard.root, &lv_label_class, "In use: Robin");
    renderer.capture("parallel-sessions-list-english");
}

void testParallelSessionDetails(Renderer &renderer)
{
    API::ResourceBrief resource = machine("Printer", 3, 2);
    addSession(resource, 7, "Robin", false);
    addSession(resource, 8, "Sam", false);
    ResourceDetailsScreen details;
    ResourceDetailsScreen::ButtonClickEventData clicked{};
    unsigned clicks = 0;
    details.setButtonClickCallback([&](ResourceDetailsScreen::ButtonClickEventData event) { clicked = event; ++clicks; });
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Alex", false, true, true, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    settle();
    requireObject(guard.root, &lv_label_class, "In Verwendung 2/3");
    expect(!hidden(requireObject(guard.root, &lv_label_class, "Ressource verwenden")), "A free slot shows Start");
    auto *endRobin = requireObject(guard.root, &lv_label_class, "Sitzung von Robin beenden");
    requireObject(guard.root, &lv_label_class, "Sitzung von Sam beenden");
    expect(!hidden(endRobin), "Introducers see the session picker");
    renderer.capture("parallel-sessions-details-picker");
    lv_obj_send_event(lv_obj_get_parent(endRobin), LV_EVENT_CLICKED, nullptr);
    expect(clicks == 1 && clicked.buttonClickType == ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION && clicked.usageId == 7,
           "Picker force-stops exactly the chosen session");
    details.hideActionProgress();

    // Ordinary users get no picker and cannot start on a full machine.
    resource.activeSessionCount = 3;
    resource.canStart = false;
    addSession(resource, 9, "Kim", false);
    details.setUserDetails({"Alex", false, true, false, false});
    details.setResourceAndUsageDetails(resource);
    settle();
    requireObject(guard.root, &lv_label_class, "Voll");
    expect(hidden(requireObject(guard.root, &lv_label_class, "Ressource verwenden")), "A full machine hides Start");
    expect(!findObject(guard.root, &lv_label_class, "Sitzung von Robin beenden") ||
               hidden(findObject(guard.root, &lv_label_class, "Sitzung von Robin beenden")),
           "Ordinary users get no session picker");
    expect(!findObject(guard.root, &lv_label_class, "Fremde Sitzung beenden") ||
               hidden(findObject(guard.root, &lv_label_class, "Fremde Sitzung beenden")),
           "Parallel machines have no single force-stop button");

    // Own session: Stop for oneself without usageId, plus own-session panel.
    API::ResourceBrief own = machine("Printer", 3, 2);
    addSession(own, 7, "Robin", false);
    addSession(own, 9, "Alex", true);
    own.canStart = false; // the server withholds a second start from the same person
    details.setUserDetails({"Alex", false, true, false, false});
    details.setResourceAndUsageDetails(own);
    settle();
    requireObject(guard.root, &lv_label_class, "Von dir verwendet");
    auto *end = requireObject(guard.root, &lv_label_class, "Sitzung beenden");
    expect(!hidden(end), "Own session shows Stop");
    expect(hidden(requireObject(guard.root, &lv_label_class, "Ressource verwenden")), "Own session hides Start");
    lv_obj_send_event(lv_obj_get_parent(end), LV_EVENT_CLICKED, nullptr);
    expect(clicks == 2 && clicked.usageId == 0, "Stopping oneself never names a session");
    details.hideActionProgress();
    renderer.capture("parallel-sessions-details-own");
}

void testSingleSessionDetailsUnchanged()
{
    API::ResourceBrief resource = machine("Mill", 1, 1);
    addSession(resource, 5, "Robin", false);
    resource.canStart = false;
    ResourceDetailsScreen details;
    ResourceDetailsScreen::ButtonClickEventData clicked{};
    clicked.usageId = 123;
    details.setButtonClickCallback([&](ResourceDetailsScreen::ButtonClickEventData event) { clicked = event; });
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Alex", true, true, true, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    settle();
    auto *forceStop = requireObject(guard.root, &lv_label_class, "Fremde Sitzung beenden");
    expect(!hidden(forceStop), "Limit 1 keeps the force-stop button");
    expect(!findObject(guard.root, &lv_label_class, "In Verwendung 1/1"), "Limit 1 shows no k/N occupancy");
    expect(hidden(requireObject(guard.root, &lv_label_class, "Ressource verwenden")), "Limit 1 hides Start while foreign session runs");
    lv_obj_send_event(lv_obj_get_parent(forceStop), LV_EVENT_CLICKED, nullptr);
    expect(clicked.usageId == 5, "Limit 1 force-stop names the session on screen");
    details.hideActionProgress();

    // Own session at limit 1 stops without a usageId.
    API::ResourceBrief own = machine("Mill", 1, 1);
    addSession(own, 6, "Alex", true);
    own.canStart = false;
    details.setUserDetails({"Alex", true, true, true, false, false, true});
    details.setResourceAndUsageDetails(own);
    settle();
    auto *stopOwn = requireObject(guard.root, &lv_label_class, "Sitzung beenden");
    expect(!hidden(stopOwn), "Limit 1 owner sees Stop");
    lv_obj_send_event(lv_obj_get_parent(stopOwn), LV_EVENT_CLICKED, nullptr);
    expect(clicked.usageId == 0, "Limit 1 own stop sends no usageId");
}

void testLoweredLimitDetails(Renderer &renderer)
{
    // The limit was lowered to 1 while Robin and Sam were both using the machine.
    API::ResourceBrief resource = machine("Mill", 1, 2);
    addSession(resource, 5, "Robin", false);
    addSession(resource, 6, "Sam", false);
    resource.canStart = false;
    resource.allowTakeOver = true;
    ResourceDetailsScreen details;
    ResourceDetailsScreen::ButtonClickEventData clicked{};
    unsigned clicks = 0;
    details.setButtonClickCallback([&](ResourceDetailsScreen::ButtonClickEventData event) { clicked = event; ++clicks; });
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Alex", true, true, true, false, false, true});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    settle();
    requireObject(guard.root, &lv_label_class, "Voll");
    expect(hidden(requireObject(guard.root, &lv_label_class, "Ressource verwenden")), "No start or takeover over capacity");
    expect(!findObject(guard.root, &lv_label_class, "Fremde Sitzung beenden") ||
               hidden(findObject(guard.root, &lv_label_class, "Fremde Sitzung beenden")),
           "No single force-stop that could hit the wrong session");
    requireObject(guard.root, &lv_label_class, "Andere Sitzung beenden:");
    requireObject(guard.root, &lv_label_class, "Sitzung von Robin beenden");
    auto *endSam = requireObject(guard.root, &lv_label_class, "Sitzung von Sam beenden");
    renderer.capture("parallel-sessions-lowered-limit");
    lv_obj_send_event(lv_obj_get_parent(endSam), LV_EVENT_CLICKED, nullptr);
    expect(clicks == 1 && clicked.buttonClickType == ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION && clicked.usageId == 6,
           "Each session can be ended by its usageId");
}

void testPickerForCanEndOtherSessions()
{
    API::ResourceBrief resource = machine("Printer", 3, 2);
    addSession(resource, 7, "Robin", false);
    addSession(resource, 8, "Sam", false);
    ResourceDetailsScreen details;
    details.setResourceAndUsageDetails(resource);
    // Neither introducer nor resource manager, but the server lets this card end other sessions.
    details.setUserDetails({"Alex", false, true, false, false, true, true});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    settle();
    expect(!hidden(requireObject(guard.root, &lv_label_class, "Sitzung von Robin beenden")),
           "canEndOtherSessions alone shows the picker");
    details.setUserDetails({"Alex", false, true, false, false, false, true});
    settle();
    expect(!findObject(guard.root, &lv_label_class, "Sitzung von Robin beenden") ||
               hidden(findObject(guard.root, &lv_label_class, "Sitzung von Robin beenden")),
           "Without the permission there is no picker");
}

void testDetailsOwnershipFromOwnSession()
{
    // A personalised list without an own session: a matching shown name is not ownership.
    API::ResourceBrief resource = machine("Printer", 3, 1);
    addSession(resource, 7, "Alex", false);
    ResourceDetailsScreen details;
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Alex", false, true, false, false, false, true});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    settle();
    requireObject(guard.root, &lv_label_class, "In Verwendung 1/3");
    expect(hidden(requireObject(guard.root, &lv_label_class, "Sitzung beenden")), "No Stop without an own session");
    resource.hasOwnUsage = true;
    resource.ownUsageId = 7;
    details.setResourceAndUsageDetails(resource);
    settle();
    requireObject(guard.root, &lv_label_class, "Von dir verwendet");
    expect(!hidden(requireObject(guard.root, &lv_label_class, "Sitzung beenden")), "The own session shows Stop");
}

void testParallelSessionLockscreen(Renderer &renderer)
{
    Lockscreen lock;
    lock.setResourceName("Printer");
    lock.init();
    ScreenGuard guard(lock.getScreen(), &lock);
    auto resource = machine("Printer", 3, 1);
    addSession(resource, 1, "Robin", false);
    lock.setUsageInfo(resource);
    requireObject(guard.root, &lv_label_class, "Robin \u00B7 1/3");
    renderer.capture("parallel-sessions-lockscreen");
    resource.activeSessionCount = 3;
    lock.setUsageInfo(resource);
    requireObject(guard.root, &lv_label_class, "Robin +2 \u00B7 Voll");
    addSession(resource, 2, "Alex", false);
    resource.activeSessionCount = 2;
    lock.setUsageInfo(resource);
    requireObject(guard.root, &lv_label_class, "Robin, Alex \u00B7 2/3");
    // Long names on a full machine: whole names that fit the lock screen's narrower line, then +N and "Voll"/"Full".
    resource.maxParallelSessions = 6;
    resource.activeSessionCount = 6;
    resource.activeSessions.clear();
    for (const char *user : {"Maximiliane", "Konstantin", "Bartholomaeus", "Wolfgang", "Annabelle", "Sebastian"})
        addSession(resource, 10 + resource.activeSessions.size(), user, false);
    lock.setUsageInfo(resource);
    for (const char *language : {"de", "en"}) {
        FirmwareI18n::refreshTree(guard.root, language);
        auto *usage = labelEndingWith(guard.root, std::string(language) == "en" ? "\u00B7 Full" : "\u00B7 Voll");
        expect(usage != nullptr, std::string("The lock screen reads full (") + language + ")");
        if (!usage) continue;
        const std::string text = lv_label_get_text(usage);
        expect(text == std::string("Maximiliane +5 \u00B7 ") + (std::string(language) == "en" ? "Full" : "Voll"),
               "The lock screen lists the whole names that fit, then +N: " + text);
        expect(labelFits(usage), "The lock screen users line fits its label: " + text);
    }
    renderer.capture("parallel-sessions-lockscreen-crowd");
    FirmwareI18n::refreshTree(guard.root, "de");
    resource.activeSessions.clear(); // no names from an older API: the count caption stays
    resource.maxParallelSessions = 3;
    resource.activeSessionCount = 3;
    lock.setUsageInfo(resource);
    requireObject(guard.root, &lv_label_class, "Voll");
    resource.activeSessionCount = 0;
    resource.hasActiveUsage = false;
    lock.setUsageInfo(resource);
    requireObject(guard.root, &lv_label_class, "Verfügbar");
}

namespace {
// The text of the row's second line (the muted 14 px label of the details half) for the named resource.
std::string rowStatusLine(lv_obj_t *root, const char *resourceName)
{
    auto *row = lv_obj_get_parent(lv_obj_get_parent(requireObject(root, &lv_label_class, resourceName)));
    auto *details = lv_obj_get_child(row, 0);
    auto *line = lv_obj_get_child(details, 1);
    return lv_label_get_text(line);
}

// Whether the row's second line is shown uncut.
bool rowLineFits(lv_obj_t *root, const char *resourceName)
{
    auto *row = lv_obj_get_parent(lv_obj_get_parent(requireObject(root, &lv_label_class, resourceName)));
    return labelFits(lv_obj_get_child(lv_obj_get_child(row, 0), 1));
}
}

void testParallelSessionUsers(Renderer &renderer)
{
    API::ResourceList resources{};
    resources.count = 6;
    std::strcpy(resources.authenticatedUsername, "Sam");
    const char *names[] = {"Alex and Sam", "Own", "Crowd", "Twenty", "No names", "Lowered"};
    for (int i = 0; i < 6; ++i) {
        resources.items[i] = machine(names[i], 3, 0);
        resources.items[i].id = i + 1;
    }
    resources.items[0].activeSessionCount = 2;
    addSession(resources.items[0], 10, "Alex", false);
    addSession(resources.items[0], 11, "Sam", false);
    // Personalised for Sam: the own session comes first as "you" although the server listed it last.
    resources.items[1].activeSessionCount = 2;
    resources.items[1].canStart = false;
    addSession(resources.items[1], 20, "Alex", false);
    addSession(resources.items[1], 21, "Sam", true);
    // Long names: only whole names fit, the rest is counted.
    resources.items[2].maxParallelSessions = 8;
    resources.items[2].activeSessionCount = 6;
    for (const char *user : {"Maximiliane", "Konstantin", "Bartholomaeus", "Wolfgang", "Annabelle", "Sebastian"})
        addSession(resources.items[2], 30 + resources.items[2].activeSessions.size(), user, false);
    // The server caps the list at 16: the count stays exact.
    resources.items[3].maxParallelSessions = 40;
    resources.items[3].activeSessionCount = 20;
    for (int i = 0; i < 16; ++i) addSession(resources.items[3], 50 + i, "Alex", false);
    // Sessions without names (older API): the plain count.
    resources.items[4].activeSessionCount = 2;
    resources.items[4].hasActiveUsage = true;
    std::strcpy(resources.items[4].activeUser, "Robin");
    // A limit lowered while several sessions run.
    resources.items[5].maxParallelSessions = 1;
    resources.items[5].activeSessionCount = 2;
    resources.items[5].canStart = false;
    addSession(resources.items[5], 70, "Robin", false);
    addSession(resources.items[5], 71, "Kim", false);

    ResourceListScreen signedOut;
    signedOut.setResourceList(resources);
    signedOut.init();
    {
        ScreenGuard guard(signedOut.getScreen(), &signedOut);
        FirmwareI18n::refreshTree(guard.root, "de");
        const auto line = [&](const char *name) { return rowStatusLine(guard.root, name); };
        expect(line("Alex and Sam") == "Alex, Sam \u00B7 2/3", "Signed-out rows name the users");
        expect(line("Crowd") == "Maximiliane, Konstantin, Bartholomaeus +3 \u00B7 6/8",
               "Long names list whole names, then +N and the count");
        expect(rowLineFits(guard.root, "Crowd"), "The overflow line fits the label");
        expect(line("Twenty") == "Alex, Alex, Alex, Alex, Alex, Alex, Alex, Alex +12 \u00B7 20/40",
               "More sessions than the capped list count against the real number: " + line("Twenty"));
        expect(rowLineFits(guard.root, "Twenty"), "The capped list line fits the label");
        expect(line("No names") == "In Verwendung 2/3", "No names falls back to the count caption");
        expect(line("Lowered") == "Robin, Kim \u00B7 Voll", "A lowered limit reads full");
        expect(line("Own") == "Alex, Sam \u00B7 2/3", "Signed out, the own session is a name in the server order, never the you token");
        renderer.capture("parallel-sessions-users-signed-out");
    }

    ResourceListScreen signedIn;
    signedIn.setResourceList(resources);
    signedIn.setAuthenticatedUser("Sam");
    signedIn.init();
    ScreenGuard guard(signedIn.getScreen(), &signedIn);
    expect(rowStatusLine(guard.root, "Own") == "Du, Alex \u00B7 2/3", "Signed-in rows put the own session first");
    requireObject(lv_obj_get_parent(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Own"))), &lv_label_class, "Stop");
    expect(rowLineFits(guard.root, "Crowd") && rowLineFits(guard.root, "Twenty"), "Signed-in rows fit");
    renderer.capture("parallel-sessions-users-signed-in");
    FirmwareI18n::refreshTree(guard.root, "en");
    expect(rowStatusLine(guard.root, "Own") == "You, Alex \u00B7 2/3", "English token");
    expect(rowLineFits(guard.root, "Crowd") && rowLineFits(guard.root, "Twenty"), "English rows fit");
    renderer.capture("parallel-sessions-users-english");
}

// Edge cases of the users caption: one name, a name wider than the line, names the font cannot draw, an empty name.
void testParallelSessionUserEdges(Renderer &renderer)
{
    API::ResourceList resources{};
    resources.count = 7;
    std::strcpy(resources.authenticatedUsername, "Sam");
    const char *names[] = {"One", "Long name", "Not Latin-1", "Empty name", "Own among many", "Only nameless", "Own unlisted"};
    for (int i = 0; i < 7; ++i) {
        resources.items[i] = machine(names[i], 6, 0);
        resources.items[i].id = i + 1;
    }
    resources.items[0].activeSessionCount = 1;
    addSession(resources.items[0], 10, "Alex", false);
    // The longest name the server can send (32 characters), with more users behind it.
    resources.items[1].activeSessionCount = 4;
    addSession(resources.items[1], 20, "Bartholomaeus-Maximilian-Hohenzo", false);
    addSession(resources.items[1], 21, "Kim", false);
    // Glyphs outside Latin-1 render as missing glyphs (known limit) but must not overflow or crash.
    resources.items[2].activeSessionCount = 2;
    addSession(resources.items[2], 30, "\xD0\x96\xD0\xB0\xD0\xBD", false);
    addSession(resources.items[2], 31, "Sam \xF0\x9F\x98\x80", false);
    resources.items[3].activeSessionCount = 2;
    addSession(resources.items[3], 40, "", false);
    addSession(resources.items[3], 41, "Kim", false);
    resources.items[3].activeSessionCount = 4;
    addSession(resources.items[3], 42, " \t\n", false);          // only control characters and spaces: nameless
    addSession(resources.items[3], 43, "Al\nex\t", false);       // a newline must not hide the rest of the line
    // The own session in the middle of many: shown once, as the you token.
    resources.items[4].activeSessionCount = 4;
    for (const char *user : {"Alex", "Robin", "Sam", "Kim"}) addSession(resources.items[4], 50 + resources.items[4].activeSessions.size(), user, std::string(user) == "Sam");
    // Sessions that all lack a name: the plain count.
    resources.items[5].activeSessionCount = 2;
    addSession(resources.items[5], 60, "", false);
    addSession(resources.items[5], 61, "", false);
    // The own session is not among the listed ones (the server caps the list): still "you" first.
    resources.items[6].activeSessionCount = 3;
    addSession(resources.items[6], 70, "Alex", false);
    addSession(resources.items[6], 71, "Robin", false);
    resources.items[6].hasOwnUsage = true;
    resources.items[6].ownUsageId = resources.items[6].activeUsageId = 79;
    std::strcpy(resources.items[6].activeUser, "Sam");

    ResourceListScreen signedOut;
    signedOut.setResourceList(resources);
    signedOut.init();
    {
        ScreenGuard guard(signedOut.getScreen(), &signedOut);
        FirmwareI18n::refreshTree(guard.root, "de");
        expect(rowStatusLine(guard.root, "One") == "Alex \u00B7 1/6", "One name reads 'Alex · 1/6' without a stray separator");
        expect(rowStatusLine(guard.root, "Empty name") == "Kim, Al ex +2 \u00B7 4/6",
               "Nameless sessions are only counted, control characters become single spaces: " + rowStatusLine(guard.root, "Empty name"));
        expect(rowStatusLine(guard.root, "Only nameless") == "In Verwendung 2/6", "Only nameless sessions fall back to the count");
        expect(rowStatusLine(guard.root, "Own unlisted") == "Alex, Robin +1 \u00B7 3/6", "Signed out there is no you token");
        for (const char *row : {"One", "Long name", "Not Latin-1", "Empty name", "Own among many", "Own unlisted"})
            expect(rowLineFits(guard.root, row), std::string("The users line of '") + row + "' fits the label");
        renderer.capture("parallel-sessions-user-edges-signed-out");
    }
    ResourceListScreen signedIn;
    signedIn.setResourceList(resources);
    signedIn.setAuthenticatedUser("Sam");
    signedIn.init();
    ScreenGuard guard(signedIn.getScreen(), &signedIn);
    FirmwareI18n::refreshTree(guard.root, "en");
    const auto longName = rowStatusLine(guard.root, "Long name");
    const std::string tail = " +3 \u00B7 4/6";
    expect(longName.rfind("Bartholo", 0) == 0 && longName.find("...") != std::string::npos && longName.size() > tail.size() &&
               longName.compare(longName.size() - tail.size(), tail.size(), tail) == 0,
           "A name wider than the line is shortened and keeps the +N and the count");
    expect(rowStatusLine(guard.root, "Own among many") == "You, Alex, Robin, Kim \u00B7 4/6",
           "The own session is listed once, as the you token, first: " + rowStatusLine(guard.root, "Own among many"));
    expect(rowStatusLine(guard.root, "Own unlisted") == "You, Alex, Robin \u00B7 3/6",
           "An own session missing from the capped list still reads as you: " + rowStatusLine(guard.root, "Own unlisted"));
    for (const char *row : {"One", "Long name", "Not Latin-1", "Empty name", "Own among many", "Own unlisted"})
        expect(rowLineFits(guard.root, row), std::string("The signed-in users line of '") + row + "' fits the label");
    renderer.capture("parallel-sessions-user-edges-signed-in");
}
