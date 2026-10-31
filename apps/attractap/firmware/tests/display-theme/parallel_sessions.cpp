#include "render_harness.hpp"

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
    expect(clicked.usageId == 0, "Limit 1 force-stop sends no usageId");
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
