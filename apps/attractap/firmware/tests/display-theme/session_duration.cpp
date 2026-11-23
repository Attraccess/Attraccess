#include "render_harness.hpp"
#include "api/session_duration.hpp"
#include "display/screens/duration/durationInputScreen.hpp"
#include "display/screens/extend/extendSessionScreen.hpp"

// ATT-43: the duration input shown before a start on a machine that requires an estimate, the remaining time and the
// extension of a running session. German is the fixture language.

namespace {
bool hidden(lv_obj_t *object)
{
    for (auto *current = object; current; current = lv_obj_get_parent(current))
        if (lv_obj_has_flag(current, LV_OBJ_FLAG_HIDDEN)) return true;
    return false;
}

lv_obj_t *labelContaining(lv_obj_t *root, const std::string &part)
{
    lv_obj_update_layout(root);
    if (lv_obj_check_type(root, &lv_label_class) && std::string(lv_label_get_text(root)).find(part) != std::string::npos)
        return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = labelContaining(lv_obj_get_child(root, i), part)) return found;
    return nullptr;
}

// The button a label sits on.
lv_obj_t *buttonOf(lv_obj_t *label)
{
    for (auto *current = label; current; current = lv_obj_get_parent(current))
        if (lv_obj_check_type(current, &lv_button_class)) return current;
    return nullptr;
}

bool disabled(lv_obj_t *button) { return lv_obj_has_state(button, LV_STATE_DISABLED); }
void tap(lv_obj_t *button) { lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr); }

API::ResourceBrief runningSession(uint32_t inSeconds, uint32_t limitSeconds, bool hasMax)
{
    API::ResourceBrief resource{};
    resource.id = 3;
    std::strcpy(resource.name, "Laser");
    resource.isHealthy = true;
    resource.accessKnown = true;
    resource.hasIntroduction = true;
    resource.hasActiveUsage = true;
    resource.activeUsageId = 9;
    resource.hasOwnUsage = true;
    resource.ownUsageId = 9;
    std::strcpy(resource.activeUser, "Alex");
    resource.requireSessionDurationEstimate = true;
    resource.maxSessionDurationMinutes = hasMax ? 480 : 0;
    resource.hasAutoEnd = true;
    resource.hasMaxSessionTime = hasMax;
    resource.autoEndInSeconds = inSeconds;
    resource.extendLimitInSeconds = limitSeconds;
    resource.autoEndReceivedMs = Fixtures::nowMs;
    resource.autoEndEpoch = 1'800'000'000;
    resource.autoEndUtcOffsetMinutes = 60;
    return resource;
}
}

void testSessionDurationRules()
{
    using namespace SessionDuration;
    expect(upperBound(0) == ABSOLUTE_MAX_MINUTES && upperBound(90) == 90, "The maximum bounds the input; none means 30 days");
    expect(upperBound(99999) == ABSOLUTE_MAX_MINUTES, "A maximum above 30 days never lifts the absolute limit");
    expect(isAllowed(1, 0) && !isAllowed(0, 0) && isAllowed(90, 90) && !isAllowed(91, 90), "Estimates are 1 minute to the maximum");
    expect(initialMinutes(0) == 60 && initialMinutes(30) == 30, "The input opens at one hour or the maximum when shorter");
    expect(stepped(60, -120, 0) == 1 && stepped(60, 5, 62) == 62 && stepped(43195, 60, 0) == ABSOLUTE_MAX_MINUTES,
           "Steps stop at both bounds");
    expect(remainingSeconds(100, 1000, 1000) == 100 && remainingSeconds(100, 1000, 61000) == 40 && remainingSeconds(100, 1000, 200000) == 0,
           "The countdown runs on the monotonic clock");
    expect(remainingSeconds(100, 0xFFFFFF00u, 0x000000FFu + 0x100u) == 100 - ((0x1FFu) / 1000), "The countdown survives millis() wrapping");
    // 1 h left, 1 h 30 min of room: +1 h does not fit, nothing larger does.
    expect(!canExtendBy(3600, 5400, 0, 0, 60), "An extension past the cap is not offered");
    expect(canExtendBy(3600, 3600 + 7200, 0, 0, 60) && canExtendBy(3600, 3600 + 7200, 0, 0, 120) && !canExtendBy(3600, 3600 + 7200, 0, 0, 240),
           "Only steps within the cap are offered");
    expect(!canExtendBy(0, 100000, 0, 0, 60), "A session at its end cannot be extended");
    expect(canExtendToMax(true, 3600, 7200, 0, 0) && !canExtendToMax(true, 3600, 3600, 0, 0) && !canExtendToMax(false, 3600, 7200, 0, 0),
           "To maximum needs a maximum and room below it");
    expect(clockString(1'800'000'000, 60) == "09:00" && clockString(1'800'000'000, -300) == "03:00" && clockString(0, 0).empty() &&
               clockString(0xFFFFFFFFu, 0).empty(),
           "The stop time follows the server's zone offset; an unusable epoch shows nothing");
}

void testDurationInputScreen(Renderer &renderer)
{
    DurationInputScreen input;
    uint32_t confirmed = 0;
    unsigned cancelled = 0;
    input.configure("Laser", 120, [&](uint32_t minutes) { confirmed = minutes; }, [&] { ++cancelled; });
    input.init();
    ScreenGuard guard(input.getScreen(), &input);
    settle();
    requireObject(guard.root, &lv_label_class, "Wie lange nutzt du die Maschine?");
    expect(labelContaining(guard.root, "stoppt automatisch spätestens nach dieser Zeit") != nullptr, "The hint says the machine stops automatically");
    expect(input.minutes() == 60 && labelContaining(guard.root, "1 h") != nullptr, "The input opens at one hour");
    expect(labelContaining(guard.root, "Höchstens 2 h") != nullptr, "The maximum is shown");
    // Quick picks above the maximum cannot be chosen (4 h and 8 h with a 2 h maximum).
    expect(input.pickEnabled(0) && input.pickEnabled(1) && input.pickEnabled(2) && !input.pickEnabled(3) && !input.pickEnabled(4),
           "Quick picks above the maximum are blocked");
    auto *eightHours = buttonOf(labelContaining(guard.root, "8 h"));
    expect(eightHours && disabled(eightHours), "The 8 h chip is disabled above a 2 h maximum");
    auto *twoHours = buttonOf(requireObject(guard.root, &lv_label_class, "2 h"));
    tap(twoHours);
    expect(input.minutes() == 120, "A quick pick sets the value");
    settle();
    input.step(60);
    input.step(5);
    expect(input.minutes() == 120, "The value never passes the maximum");
    input.step(-60);
    input.step(-5);
    expect(input.minutes() == 55, "Steppers move by an hour and by five minutes");
    renderer.capture("duration-input-max");
    tap(buttonOf(requireObject(guard.root, &lv_label_class, "Start")));
    expect(confirmed == 55, "Start hands over the chosen minutes");
    tap(buttonOf(requireObject(guard.root, &lv_label_class, "Abbrechen")));
    expect(cancelled == 1 && confirmed == 55, "Cancel aborts without an estimate");
}

void testDurationInputWithoutMaximum(Renderer &renderer)
{
    DurationInputScreen input;
    input.configure("Laser", 0, [](uint32_t) {}, [] {});
    input.init();
    ScreenGuard guard(input.getScreen(), &input);
    settle();
    expect(labelContaining(guard.root, "Höchstens") == nullptr, "No maximum line without a maximum");
    expect(input.pickEnabled(4), "Every quick pick is open without a maximum");
    input.pick(480);
    expect(input.minutes() == 480, "Eight hours can be chosen without a maximum");
    Fixtures::activeLanguage = "en";
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(guard.root, &lv_label_class, "How long will you use the machine?");
    expect(labelContaining(guard.root, "The machine will stop automatically after this time at the latest. You can extend while it runs.") != nullptr,
           "The English hint is complete");
    renderer.capture("duration-input-english");
    Fixtures::activeLanguage = "de";
}

void testExtendSessionScreen(Renderer &renderer)
{
    Fixtures::nowMs = 1000;
    ExtendSessionScreen extend;
    uint32_t minutes = 0;
    bool toMax = false;
    unsigned requests = 0, backs = 0;
    // 1 h left, room for 2 h more below a maximum.
    extend.configure(runningSession(3600, 3600 + 7200, true), [&](uint32_t m, bool max) { minutes = m; toMax = max; ++requests; }, [&] { ++backs; });
    extend.init();
    ScreenGuard guard(extend.getScreen(), &extend);
    settle();
    requireObject(guard.root, &lv_label_class, "Verlängern");
    requireObject(guard.root, &lv_label_class, "1:00:00");
    requireObject(guard.root, &lv_label_class, "Stoppt um 09:00");
    expect(extend.stepEnabled(0, Fixtures::nowMs) && extend.stepEnabled(1, Fixtures::nowMs) && !extend.stepEnabled(2, Fixtures::nowMs),
           "Steps beyond the room are blocked");
    auto *oneHour = buttonOf(requireObject(guard.root, &lv_label_class, "+1 h"));
    auto *twentyFour = buttonOf(requireObject(guard.root, &lv_label_class, "+24 h"));
    expect(!disabled(oneHour) && disabled(twentyFour), "+1 h is open and +24 h is disabled");
    tap(twentyFour);
    expect(requests == 0, "A disabled step sends nothing");
    tap(oneHour);
    expect(requests == 1 && minutes == 60 && !toMax, "+1 h asks for 60 minutes");
    auto *max = buttonOf(requireObject(guard.root, &lv_label_class, "Bis zum Maximum"));
    expect(!hidden(max) && !disabled(max), "To maximum is offered while there is room below it");
    tap(max);
    expect(requests == 2 && toMax, "To maximum asks for the maximum");
    renderer.capture("extend-session");

    // Time passes: the countdown follows the monotonic clock and the room shrinks with it.
    Fixtures::nowMs = 1000 + 30 * 60 * 1000;
    extend.loop();
    requireObject(guard.root, &lv_label_class, "30:00");

    // A fresher list (extended on the web, now at the cap): nothing left to extend.
    auto atCap = runningSession(7200, 7200, true);
    atCap.autoEndReceivedMs = Fixtures::nowMs;
    extend.update(atCap);
    settle();
    expect(!extend.stepEnabled(0, Fixtures::nowMs) && !extend.toMaxEnabled(Fixtures::nowMs), "At the cap nothing can be extended");
    requireObject(guard.root, &lv_label_class, "Höchstdauer erreicht");
    renderer.capture("extend-session-at-maximum");
    tap(buttonOf(requireObject(guard.root, &lv_label_class, "Zurück")));
    expect(backs == 1, "Back leaves the screen");
    Fixtures::nowMs = 1000;
}

void testExtendWithoutMaximum()
{
    Fixtures::nowMs = 1000;
    ExtendSessionScreen extend;
    extend.configure(runningSession(3600, 3600 + 30 * 24 * 3600, false), [](uint32_t, bool) {}, [] {});
    extend.init();
    ScreenGuard guard(extend.getScreen(), &extend);
    settle();
    expect(extend.stepEnabled(5, Fixtures::nowMs), "Every step is open when only the 30 day limit applies");
    expect(!extend.toMaxEnabled(Fixtures::nowMs), "There is no maximum to extend to");
    expect(hidden(requireObject(guard.root, &lv_label_class, "Bis zum Maximum")), "To maximum is hidden without a maximum");
}

void testDetailsAutoEnd(Renderer &renderer)
{
    Fixtures::nowMs = 1000;
    ResourceDetailsScreen details;
    unsigned opened = 0;
    details.setOpenExtendCallback([&] { ++opened; });
    details.setResourceAndUsageDetails(runningSession(3600, 3600 + 7200, true));
    details.setUserDetails({"Alex", false, true, false, false, false, true});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    settle();
    auto *line = labelContaining(guard.root, "Stoppt automatisch in 1:00:00");
    expect(line && !hidden(line), "The own session shows the remaining time");
    expect(labelContaining(guard.root, "(um 09:00)") != nullptr, "... and the local stop time");
    auto *extendButton = buttonOf(requireObject(guard.root, &lv_label_class, "Verlängern"));
    expect(!hidden(extendButton), "The own session offers Extend");
    renderer.capture("resource-details-auto-end");
    tap(extendButton);
    expect(opened == 1, "Extend opens the extension screen");

    // Someone else's session: neither the countdown nor Extend.
    auto other = runningSession(3600, 7200, true);
    other.hasOwnUsage = false;
    other.hasAutoEnd = false;
    std::strcpy(other.activeUser, "Robin");
    details.setResourceAndUsageDetails(other);
    details.setUserDetails({"Alex", false, true, false, false, false, true});
    settle();
    expect(hidden(requireObject(guard.root, &lv_label_class, "Verlängern")), "Another person's session offers no Extend");

    // A reader without the deadline fields (an older server): nothing new on screen.
    auto plain = runningSession(0, 0, false);
    plain.hasAutoEnd = false;
    details.setResourceAndUsageDetails(plain);
    settle();
    expect(hidden(requireObject(guard.root, &lv_label_class, "Verlängern")), "A session without a deadline offers no Extend");
}
