#include "fixtures.hpp"

void testFormDrafts(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    auto &screen = Display::resourceDetailsScreen;
    Display::transitionToScreen(&screen);
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
        screen.showFormsModal(request);
        screen.renderFormField(page, false, true, 1, 1);
        auto *preview = findLabel(lv_screen_active(), displayValue);
        assert(preview);
        lv_obj_send_event(lv_obj_get_parent(preview), LV_EVENT_CLICKED, nullptr);
        auto *textarea = findWidget(lv_screen_active(), &lv_textarea_class);
        auto *keyboard = findWidget(lv_screen_active(), &lv_keyboard_class);
        assert(textarea && keyboard);
        assert(std::strcmp(lv_textarea_get_text(textarea), displayValue) == 0);
        // The editor's keyboard ends above the device footer.
        expectClearOfChrome(keyboard);
        if (edit) lv_textarea_set_text(textarea, "Geändert\nGröße");
        lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
        auto *submit = findLabel(lv_screen_active(), "Absenden");
        assert(submit);
        lv_obj_send_event(lv_obj_get_parent(submit), LV_EVENT_CLICKED, nullptr);
        assert(submitted == (edit ? "Geändert\nGröße" : field.value));
    }
    field = API::ResourceUsageFormField{};
    field.id = 1;
    field.name = "Size";
    field.type = API::ResourceUsageFormFieldType::SELECT;
    field.options.select.count = 2;
    field.options.select.values[0] = "Size™";
    field.options.select.values[1] = "Größe";
    screen.showFormsModal(request);
    screen.renderFormField(page, false, true, 1, 1);
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "usage-form.png");
    // The page leaves room for the network badge and the device footer.
    expectClearOfChrome(lv_obj_get_parent(findLabel(lv_screen_active(), LV_SYMBOL_CLOSE)));
    expectClearOfChrome(lv_obj_get_parent(findLabel(lv_screen_active(), "Absenden")));
    expectClearOfChrome(lv_obj_get_parent(findLabel(lv_screen_active(), "Zurück")));
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
    // The forms view is a direct child of the resource details root (no
    // top-layer dialog) and is hidden as soon as that screen is left.
    auto *formsView = findLabel(lv_screen_active(), "Holz");
    assert(formsView && !findLabel(lv_layer_top(), "Holz"));
    while (lv_obj_get_parent(formsView) != screen.getScreen()) formsView = lv_obj_get_parent(formsView);
    assert(!lv_obj_has_flag(formsView, LV_OBJ_FLAG_HIDDEN) && lv_obj_has_flag(formsView, LV_OBJ_FLAG_FLOATING));
    Display::transitionToScreen(&Display::initScreen);
    assert(lv_obj_has_flag(formsView, LV_OBJ_FLAG_HIDDEN));
    Display::loop();
    assert(!screen.isLoaded());

    // The project picker is a page of the details screen in the same way.
    Display::transitionToScreen(&screen);
    Display::loop();
    API::ProjectsOfUserResponse projects{};
    projects.count = 1;
    projects.total = 1;
    projects.items[0] = {42, "Werkstattprojekt"};
    screen.setProjects(projects);
    lv_obj_send_event(lv_obj_get_parent(findLabel(screen.getScreen(), "Projekt wählen")), LV_EVENT_CLICKED, nullptr);
    lv_obj_update_layout(screen.getScreen());
    auto *projectsView = findLabel(screen.getScreen(), "Projekt auswählen");
    assert(projectsView && lv_obj_is_visible(projectsView));
    while (lv_obj_get_parent(projectsView) != screen.getScreen()) projectsView = lv_obj_get_parent(projectsView);
    assert(lv_obj_has_flag(projectsView, LV_OBJ_FLAG_FLOATING));
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "project-picker.png");
    expectClearOfChrome(lv_obj_get_parent(findLabel(projectsView, LV_SYMBOL_CLOSE)));
    expectClearOfChrome(lv_obj_get_parent(findLabel(projectsView, "Zurück")));
    expectClearOfChrome(lv_obj_get_parent(findLabel(projectsView, "Weiter")));
    // The search editor's keyboard as well.
    lv_obj_send_event(lv_obj_get_parent(findLabel(projectsView, "Projekte suchen")), LV_EVENT_CLICKED, nullptr);
    auto *searchKeyboard = findWidget(projectsView, &lv_keyboard_class);
    assert(searchKeyboard && lv_obj_is_visible(searchKeyboard));
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "project-search-editor.png");
    expectClearOfChrome(searchKeyboard);
    lv_obj_send_event(searchKeyboard, LV_EVENT_CANCEL, nullptr);
    // The projects belong to the session: after it ends, nothing of them is
    // shown again, even when the next user's first request cannot be sent.
    assert(findLabel(projectsView, "Werkstattprojekt"));
    screen.resetProjectsSearch();
    screen.setProjectsPageRequestCallback([](uint32_t, const std::string &) { return false; });
    lv_obj_send_event(lv_obj_get_parent(findLabel(screen.getScreen(), "Projekt wählen")), LV_EVENT_CLICKED, nullptr);
    assert(!lv_obj_has_flag(projectsView, LV_OBJ_FLAG_HIDDEN) && !findLabel(projectsView, "Werkstattprojekt"));
    screen.setProjectsPageRequestCallback({});
    Display::transitionToScreen(&Display::initScreen);
    assert(lv_obj_has_flag(projectsView, LV_OBJ_FLAG_HIDDEN));
    Display::loop();
    assert(!screen.isLoaded());
    screen.setFormPageNextCallback({});
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
}

void testTopUpScreen(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    uint32_t amount = 0;
    bool cancelled = false;
    auto &topUp = Display::topUpScreen;
    topUp.reset();
    topUp.setCallbacks([&](uint32_t cents) { amount = cents; }, [&] { cancelled = true; });
    Display::transitionToScreen(&topUp);
    Display::loop();
    lv_obj_update_layout(topUp.getScreen());
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "top-up.png");
    assert(lv_screen_active() == topUp.getScreen());
    assert(!findLabel(lv_layer_top(), "Aufladen"));
    auto *input = findWidget(topUp.getScreen(), &lv_textarea_class);
    auto *keyboard = findWidget(topUp.getScreen(), &lv_keyboard_class);
    auto *start = findLabel(topUp.getScreen(), "Aufladen");
    auto *cancel = findLabel(topUp.getScreen(), "Abbrechen");
    assert(input && keyboard && start && cancel);
    // The keyboard sits below the field and the buttons, never over them.
    lv_area_t inputArea, keyboardArea, startArea;
    lv_obj_get_coords(input, &inputArea);
    lv_obj_get_coords(keyboard, &keyboardArea);
    lv_obj_get_coords(lv_obj_get_parent(start), &startArea);
    assert(inputArea.y2 < keyboardArea.y1 && startArea.y2 < keyboardArea.y1);
    // Cancel and Top up share a full-width row, Top up taking the larger part.
    const lv_area_t cancelArea = coordsOf(lv_obj_get_parent(cancel));
    assert(cancelArea.x1 <= inputArea.x1 + 1 && startArea.x2 >= inputArea.x2 - 1);
    assert(startArea.x2 - startArea.x1 > cancelArea.x2 - cancelArea.x1);
    for (auto *object : {input, keyboard, lv_obj_get_parent(start), lv_obj_get_parent(cancel)}) expectClearOfChrome(object);

    // Validation stays inline: nothing is requested for an empty or zero amount.
    lv_obj_send_event(lv_obj_get_parent(start), LV_EVENT_CLICKED, nullptr);
    auto *error = findLabel(topUp.getScreen(), "Bitte Betrag eingeben.");
    assert(error && amount == 0);
    lv_textarea_set_text(input, "0");
    lv_obj_send_event(lv_obj_get_parent(start), LV_EVENT_CLICKED, nullptr);
    error = findLabel(topUp.getScreen(), "Bitte gültigen Betrag eingeben.");
    assert(error && amount == 0);
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "top-up-error.png");
    // The inline error does not push anything under the keyboard.
    keyboardArea = coordsOf(keyboard);
    assert(coordsOf(input).y2 < keyboardArea.y1 && coordsOf(error).y2 < keyboardArea.y1);
    assert(coordsOf(lv_obj_get_parent(start)).y2 < keyboardArea.y1);
    lv_font_glyph_dsc_t glyph{};
    assert(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(error, LV_PART_MAIN), &glyph, 0x00FC, 0) && !glyph.is_placeholder);

    // Leading zeros are still zero; the largest field value stays within the cents range.
    lv_textarea_set_text(input, "000");
    lv_obj_send_event(lv_obj_get_parent(start), LV_EVENT_CLICKED, nullptr);
    assert(amount == 0);
    // Only digits are accepted, so signs, separators and letters never reach the amount.
    lv_textarea_set_text(input, "-5.5x");
    assert(std::strcmp(lv_textarea_get_text(input), "55") == 0);
    lv_textarea_set_text(input, "999999");
    lv_obj_send_event(lv_obj_get_parent(start), LV_EVENT_CLICKED, nullptr);
    assert(amount == 99999900);
    amount = 0;

    lv_textarea_set_text(input, "5");
    lv_obj_send_event(lv_obj_get_parent(start), LV_EVENT_CLICKED, nullptr);
    assert(amount == 500 && !cancelled);
    lv_obj_send_event(lv_obj_get_parent(cancel), LV_EVENT_CLICKED, nullptr);
    assert(cancelled);

    // A fresh presentation starts empty.
    lv_textarea_set_text(input, "12");
    topUp.reset();
    assert(std::strcmp(lv_textarea_get_text(input), "") == 0);
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
}
