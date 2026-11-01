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
    requireObject(guard.root, &lv_label_class, "In Verwendung 2/3");
    requireObject(guard.root, &lv_label_class, "Voll");
    requireObject(guard.root, &lv_label_class, "Von dir verwendet");
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
    requireObject(guard.root, &lv_label_class, "In use 2/3");
    requireObject(guard.root, &lv_label_class, "Full");
    requireObject(guard.root, &lv_label_class, "In use by you");
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
    requireObject(guard.root, &lv_label_class, "In Verwendung 1/3");
    renderer.capture("parallel-sessions-lockscreen");
    resource.activeSessionCount = 3;
    lock.setUsageInfo(resource);
    requireObject(guard.root, &lv_label_class, "Voll");
    resource.activeSessionCount = 0;
    resource.hasActiveUsage = false;
    lock.setUsageInfo(resource);
    requireObject(guard.root, &lv_label_class, "Verfügbar");
}
