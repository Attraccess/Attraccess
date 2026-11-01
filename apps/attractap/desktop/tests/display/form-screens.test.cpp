#include "fixtures.hpp"

void testFormScreens(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    // The forms are a routed screen over the details of the resource they are for.
    auto &details = Display::resourceDetailsScreen;
    auto &screen = Display::formsScreen;
    Display::transitionToScreen(&details);
    Display::loop();
    API::ResourceUsageFormRequest request{};
    request.resourceId = 1;
    request.formCount = 1;
    request.forms[0].id = 1;
    request.forms[0].name = "Draft";
    request.forms[0].fieldCount = 1;
    API::ResourceUsageFormFieldsPage page{};
    page.resourceId = 1;
    page.formId = 1;
    page.fieldCount = 1;
    page.totalFieldCount = 1;
    auto &field = page.fields[0];
    field.id = 1;
    field.name = "Note";
    field.type = API::ResourceUsageFormFieldType::TEXT;
    field.hasValue = true;
    field.options.text.multiline = true;
    field.value = "Size™\n“München” — Größe";
    constexpr char displayValue[] = "SizeTM\n\"München\" - Größe";
    std::string submitted;
    screen.setFormPageNextCallback([&](const API::FormPageSubmission &submission) {
        assert(submission.answerCount == 1);
        submitted = submission.answers[0].stringValue;
    });
    for (const bool edit : {false, true}) {
        screen.showForm(request);
        screen.renderFormField(page, false, true, 1, 1);
        Display::transitionToScreen(&screen);
        assert(lv_screen_active() == screen.getScreen() && details.isLoaded());
        auto *preview = findLabel(lv_screen_active(), displayValue);
        assert(preview);
        lv_obj_send_event(lv_obj_get_parent(preview), LV_EVENT_CLICKED, nullptr);
        auto *textarea = findWidget(lv_screen_active(), &lv_textarea_class);
        auto *keyboard = findWidget(lv_screen_active(), &lv_keyboard_class);
        assert(textarea && keyboard);
        assert(std::strcmp(lv_textarea_get_text(textarea), displayValue) == 0);
        // The editor and its keyboard stay clear of the chrome and of each other.
        expectCleanLayout("form editor");
        if (edit) lv_textarea_set_text(textarea, "Geändert\nGröße");
        lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
        auto *submit = findLabel(lv_screen_active(), "Absenden");
        assert(submit);
        lv_obj_send_event(lv_obj_get_parent(submit), LV_EVENT_CLICKED, nullptr);
        assert(submitted == (edit ? "Geändert\nGröße" : field.value));
        screen.resetForm();
        assert(Display::returnFromTransient() && lv_screen_active() == details.getScreen());
    }
    field = API::ResourceUsageFormField{};
    field.id = 1;
    field.name = "Size";
    field.type = API::ResourceUsageFormFieldType::SELECT;
    field.options.select.count = 2;
    field.options.select.values[0] = "Size™";
    field.options.select.values[1] = "Größe";
    screen.showForm(request);
    screen.renderFormField(page, false, true, 1, 1);
    Display::transitionToScreen(&screen);
    expectCleanLayout("form select");
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "usage-form.png");
    auto *option = findLabel(lv_screen_active(), "SizeTM");
    auto *otherOption = findLabel(lv_screen_active(), "Größe");
    assert(option && otherOption);
    expectReadableOption(option);
    const auto unselectedBackground = lv_obj_get_style_bg_color(lv_obj_get_parent(option), LV_PART_MAIN);
    for (auto *selected : {option, otherOption, option}) {
        lv_obj_send_event(lv_obj_get_parent(selected), LV_EVENT_CLICKED, nullptr);
        assert(!lv_color_eq(lv_obj_get_style_bg_color(lv_obj_get_parent(selected), LV_PART_MAIN), unselectedBackground));
        expectReadableOption(option);
        expectReadableOption(otherOption);
    }
    auto *submit = findLabel(lv_screen_active(), "Absenden");
    assert(submit);
    lv_obj_send_event(lv_obj_get_parent(submit), LV_EVENT_CLICKED, nullptr);
    assert(submitted == "Size™");
    {
        // The largest select (MAX_SELECT_OPTIONS) stays reachable above the footer buttons.
        auto many = field;
        many.options.select.count = API::MAX_SELECT_OPTIONS;
        for (size_t i = 0; i < API::MAX_SELECT_OPTIONS; ++i) many.options.select.values[i] = "Option " + std::to_string(i + 1);
        page.fields[0] = many;
        screen.renderFormField(page, false, true, 1, 1);
        auto *last = lv_obj_get_parent(findLabel(lv_screen_active(), "Option 12"));
        lv_obj_scroll_to_view_recursive(last, LV_ANIM_OFF);
        const lv_area_t lastArea = coordsOf(last);
        const lv_area_t footerArea = coordsOf(lv_obj_get_parent(findLabel(lv_screen_active(), "Absenden")));
        assert(lastArea.y2 < footerArea.y1);
        lv_obj_send_event(last, LV_EVENT_CLICKED, nullptr);
        lv_obj_send_event(lv_obj_get_parent(findLabel(lv_screen_active(), "Absenden")), LV_EVENT_CLICKED, nullptr);
        assert(submitted == "Option 12");
        page.fields[0] = field;
    }
    // A normal reader must preserve supplied options even when their IDs and
    // wording happen to match the built-in demo form.
    page.resourceId = 1;
    page.formId = 10;
    field.id = 101;
    field.options.select.count = 1;
    field.options.select.values[0] = "Holz";
    screen.renderFormField(page, false, true, 1, 1);
    FirmwareI18n::refreshTree(lv_screen_active(), "en");
    assert(findLabel(lv_screen_active(), "Holz"));
    assert(!findLabel(lv_screen_active(), "Wood"));
    FirmwareI18n::refreshTree(lv_screen_active(), "de");
    // Leaving for anything but the origin takes the forms screen and the origin with it.
    assert(!findLabel(lv_layer_top(), "Holz"));
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    assert(!screen.isLoaded() && !details.isLoaded());
    screen.setFormPageNextCallback({});

    // The project picker: a screen of its own over the details.
    auto &picker = Display::projectSelectScreen;
    Display::transitionToScreen(&details);
    Display::loop();
    API::ProjectsOfUserResponse projects{};
    projects.count = 1;
    projects.total = 1;
    projects.items[0] = {42, "Werkstattprojekt"};
    picker.setProjects(projects);
    picker.begin();
    Display::transitionToScreen(&picker);
    assert(lv_screen_active() == picker.getScreen() && details.isLoaded());
    assert(findLabel(picker.getScreen(), "Projekt auswählen") && findLabel(picker.getScreen(), "Werkstattprojekt"));
    assert(!findLabel(lv_layer_top(), "Werkstattprojekt"));
    expectCleanLayout("project picker");
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "project-picker.png");
    // The search editor and its keyboard.
    lv_obj_send_event(lv_obj_get_parent(findLabel(picker.getScreen(), "Projekte suchen")), LV_EVENT_CLICKED, nullptr);
    auto *searchKeyboard = findWidget(picker.getScreen(), &lv_keyboard_class);
    assert(searchKeyboard && lv_obj_is_visible(searchKeyboard));
    expectCleanLayout("project search editor");
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "project-search-editor.png");
    lv_obj_send_event(searchKeyboard, LV_EVENT_CANCEL, nullptr);
    // The projects belong to the session: after it ends, nothing of them is shown
    // again, even when the next user's first request cannot be sent.
    assert(findLabel(picker.getScreen(), "Werkstattprojekt"));
    picker.resetProjectsSearch();
    picker.setProjectsPageRequestCallback([](uint32_t, const std::string &) { return false; });
    picker.begin();
    assert(!findLabel(picker.getScreen(), "Werkstattprojekt"));
    // A failed load is shown in the list area, with a way to try again.
    picker.showLoadError();
    assert(findLabel(picker.getScreen(), "Projekte konnten nicht geladen werden"));
    expectCleanLayout("project load error");
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "project-load-error.png");
    picker.setProjectsPageRequestCallback({});
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    assert(!picker.isLoaded() && !details.isLoaded());
}

namespace
{
    // Presses the keypad key whose caption is `caption`.
    void pressKey(lv_obj_t *root, const char *caption)
    {
        auto *label = findLabel(root, caption);
        assert(label);
        lv_obj_send_event(lv_obj_get_parent(label), LV_EVENT_CLICKED, nullptr);
    }
}

void testTopUpScreen(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    uint32_t amount = 0;
    bool cancelled = false;
    auto &topUp = Display::topUpScreen;
    // The top-up screen is raised over the screen the user was on.
    Display::transitionToScreen(&Display::resourceListScreen);
    Display::loop();
    topUp.reset();
    topUp.setCallbacks([&](uint32_t cents) { amount = cents; }, [&] { cancelled = true; });
    for (const char *language : {"de", "en"})
    {
        State::setDefaultLanguage(language);
        Display::transitionToScreen(&topUp);
        Display::loop();
        expectCleanLayout("top-up");
        Display::transitionToScreen(&Display::resourceListScreen);
        Display::loop();
    }
    State::setDefaultLanguage("de");
    Display::transitionToScreen(&topUp);
    Display::loop();
    lv_obj_update_layout(topUp.getScreen());
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "top-up.png");
    assert(lv_screen_active() == topUp.getScreen());
    assert(!findLabel(lv_layer_top(), "Aufladen") && Display::resourceListScreen.isLoaded());
    assert(findWidget(topUp.getScreen(), &lv_keyboard_class) == nullptr); // a keypad in the layout, no keyboard

    // The keypad never moves anything: the row and the keys keep their places while typing.
    auto *start = lv_obj_get_parent(findLabel(topUp.getScreen(), "Aufladen"));
    const lv_area_t startBefore = coordsOf(start);
    const lv_area_t keyBefore = coordsOf(lv_obj_get_parent(findLabel(topUp.getScreen(), "5")));

    // Validation is in place on the button: nothing is requested for an empty amount, size and place
    // of the button stay, and a tap performs the normal action again.
    lv_obj_send_event(start, LV_EVENT_CLICKED, nullptr);
    assert(findLabel(topUp.getScreen(), warned("Betrag fehlt").c_str()) && amount == 0);
    const lv_area_t startDuring = coordsOf(start);
    assert(startDuring.x1 == startBefore.x1 && startDuring.y1 == startBefore.y1 && startDuring.x2 == startBefore.x2 && startDuring.y2 == startBefore.y2);
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "top-up-error.png");
    expectCleanLayout("top-up error");
    pressKey(topUp.getScreen(), "0");              // A leading zero is ignored,
    lv_obj_send_event(start, LV_EVENT_CLICKED, nullptr);
    assert(amount == 0 && findLabel(topUp.getScreen(), warned("Betrag fehlt").c_str()));
    pressKey(topUp.getScreen(), "1");
    pressKey(topUp.getScreen(), "2");
    assert(findLabel(topUp.getScreen(), "12 \xE2\x82\xAC"));
    pressKey(topUp.getScreen(), LV_SYMBOL_BACKSPACE);
    assert(findLabel(topUp.getScreen(), "1 \xE2\x82\xAC"));
    for (int i = 0; i < 8; ++i) pressKey(topUp.getScreen(), "9"); // at most six digits
    assert(findLabel(topUp.getScreen(), "199999 \xE2\x82\xAC"));
    const lv_area_t keyAfter = coordsOf(lv_obj_get_parent(findLabel(topUp.getScreen(), "5")));
    assert(keyAfter.x1 == keyBefore.x1 && keyAfter.y1 == keyBefore.y1);
    expectCleanLayout("top-up amount");

    pressKey(topUp.getScreen(), LV_SYMBOL_BACKSPACE);
    for (int i = 0; i < 6; ++i) pressKey(topUp.getScreen(), LV_SYMBOL_BACKSPACE);
    pressKey(topUp.getScreen(), "5");
    lv_obj_send_event(start, LV_EVENT_CLICKED, nullptr);
    assert(amount == 500 && !cancelled);
    amount = 0;
    pressKey(topUp.getScreen(), LV_SYMBOL_OK); // The check mark submits too.
    assert(amount == 500);
    lv_obj_send_event(lv_obj_get_parent(findLabel(topUp.getScreen(), "Abbrechen")), LV_EVENT_CLICKED, nullptr);
    assert(cancelled);

    // A fresh presentation starts empty.
    topUp.reset();
    assert(findLabel(topUp.getScreen(), "\xE2\x82\xAC"));
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    assert(!topUp.isLoaded());
}
