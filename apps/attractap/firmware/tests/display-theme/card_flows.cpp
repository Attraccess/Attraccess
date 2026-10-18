#include "render_harness.hpp"

template <typename CardScreen>
void testCard(Renderer &renderer, const std::string &name, const char *writing, const char *success)
{
    CardScreen card;
    card.setUserName(Fixtures::userName);
    if constexpr (std::is_same_v<CardScreen, EnrollmentScreen>) card.setEnrollmentTimeoutTime(Fixtures::nowMs + 30000);
    else card.setTimeoutTime(Fixtures::nowMs + 30000);
    card.init();
    ScreenGuard screen(card.getScreen(), &card);
    requireObject(screen.root, &lv_label_class, Fixtures::userName);
    auto *cancel = lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Abbrechen"));
    auto *bar = requireObject(screen.root, &lv_bar_class);
    bool canceled = false;
    card.setOnCancelCallback([&] { canceled = true; });
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled, name + ": production cancel event callback");
    const std::array<typename CardScreen::Status, 4> states = {CardScreen::STATUS_WAITING, CardScreen::STATUS_WRITING,
        CardScreen::STATUS_SUCCESS, CardScreen::STATUS_ERROR};
    const char *suffix[] = {"waiting", "writing", "success", "error"};
    const char *text[] = {"Karte an den Leser halten", writing, success, Fixtures::errorMessage};
    const lv_color_t colors[] = {DisplayTheme::text(), DisplayTheme::warning(), DisplayTheme::success(), DisplayTheme::danger()};
    for (size_t i = 0; i < states.size(); ++i) {
        card.setStatus(states[i]);
        if (states[i] == CardScreen::STATUS_ERROR) card.setStatusMessage(FirmwareI18n::Text::literal(Fixtures::errorMessage));
        auto *status = requireObject(screen.root, &lv_label_class, text[i]);
        expectColor(lv_obj_get_style_text_color(status, LV_PART_MAIN), colors[i], name + ": status color");
        expect(lv_obj_get_style_text_font(status, LV_PART_MAIN) == &attractap_font_montserrat_latin1_32,
               name + ": server-derived status uses a Latin-1 font");
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (states[i] == CardScreen::STATUS_SUCCESS), name + ": cancel visibility");
        renderer.capture(name + "-" + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "en");
        requireObject(screen.root, &lv_label_class, Fixtures::userName);
        renderer.capture(name + "-english-" + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "de");
        expect(lv_bar_get_value(bar) == 30, name + ": fixed 30-second countdown");
    }
    // Keep supplied errors literal above, and separately cover the authored
    // error identifiers used by the production application callbacks.
    card.setStatusMessage(FirmwareI18n::readerError("CARD_NOT_ACTIVE"));
    FirmwareI18n::refreshTree(screen.root, "en");
    requireObject(screen.root, &lv_label_class, "Card is inactive");
    renderer.capture(name + "-english-authored-error");
    FirmwareI18n::refreshTree(screen.root, "de");
    requireObject(screen.root, &lv_label_class, "Karte ist nicht aktiv");
    renderer.capture(name + "-german-authored-error");
    Fixtures::nowMs += 5000;
    card.loop();
    settle();
    expect(lv_bar_get_value(bar) == 25, name + ": countdown advances only with fixture clock");
    Fixtures::nowMs += 30000;
    card.loop();
    settle();
    expect(lv_bar_get_value(bar) == 0, name + ": expired countdown clamps to zero");
}

void testSupervision(Renderer &renderer)
{
    SupervisionScreen supervision;
    SupervisionScreen::View view{Fixtures::nowMs + 30000, Fixtures::userName, FirmwareI18n::Text::literal(Fixtures::errorMessage), FirmwareI18n::Text::literal(Fixtures::supervisorHint)};
    supervision.render(view);
    supervision.init();
    ScreenGuard screen(supervision.getScreen(), &supervision);
    requireObject(screen.root, &lv_label_class, Fixtures::userName);
    auto *hint = requireObject(screen.root, &lv_label_class, Fixtures::supervisorHint);
    expect(lv_obj_get_style_text_font(hint, LV_PART_MAIN) == &attractap_font_montserrat_latin1_18,
           "Supervision hint uses a Latin-1 font");
    auto *cancel = lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Abbrechen"));
    const std::array<SupervisionScreen::Status, 4> states = {SupervisionScreen::STATUS_WAITING, SupervisionScreen::STATUS_VERIFYING,
        SupervisionScreen::STATUS_SUCCESS, SupervisionScreen::STATUS_ERROR};
    const char *suffix[] = {"waiting", "verifying", "success", "error"};
    const char *text[] = {"Aufsichts-Karte auflegen", "Karte gelesen...\nbitte nicht bewegen", "Freigegeben!", Fixtures::errorMessage};
    const lv_color_t colors[] = {DisplayTheme::text(), DisplayTheme::warning(), DisplayTheme::success(), DisplayTheme::danger()};
    for (size_t i = 0; i < states.size(); ++i) {
        view.status = states[i];
        supervision.render(view);
        auto *status = requireObject(screen.root, &lv_label_class, text[i]);
        expectColor(lv_obj_get_style_text_color(status, LV_PART_MAIN), colors[i], "Supervision status color");
        expect(lv_obj_get_style_text_font(status, LV_PART_MAIN) == &attractap_font_montserrat_latin1_28,
               "Supervision server-derived status uses a Latin-1 font");
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (view.status == SupervisionScreen::STATUS_SUCCESS), "Supervision cancel visibility");
        renderer.capture(std::string("supervision-") + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "en");
        requireObject(screen.root, &lv_label_class, Fixtures::userName);
        renderer.capture(std::string("supervision-english-") + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "de");
    }
    view.status = SupervisionScreen::STATUS_ERROR;
    view.statusMessage = FirmwareI18n::readerError("CARD_NOT_ACTIVE");
    view.supervisorHint = FirmwareI18n::Text::format(FirmwareI18n::Message::Breadcrumb, {
        FirmwareI18n::Message::TapSupervisorCardOrApproveInTheAppWebInterface,
        FirmwareI18n::Text::literal("Maintenance %s")});
    supervision.render(view);
    FirmwareI18n::refreshTree(screen.root, "en");
    requireObject(screen.root, &lv_label_class, "Card is inactive");
    requireObject(screen.root, &lv_label_class, "Tap supervisor card or approve in the\napp/web interface\nMaintenance %s");
    renderer.capture("supervision-english-authored-hint");
    FirmwareI18n::refreshTree(screen.root, "de");
    requireObject(screen.root, &lv_label_class, "Karte ist nicht aktiv");
    renderer.capture("supervision-german-authored-hint");
    unsigned canceled = 0;
    supervision.setOnCancelCallback([&] { ++canceled; });
    supervision.armCancelGuard();
    lv_obj_send_event(cancel, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled == 0, "Supervision rejects an early cancel press");
    Fixtures::nowMs += 1001;
    lv_obj_send_event(cancel, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled == 1, "Supervision accepts a deliberate cancel press after guard");
}

void testPin(Renderer &renderer)
{
    PinInputPage pin;
    ScreenGuard screen(pin.init(FirmwareI18n::Message::DevicePin));
    auto *field = requireObject(screen.root, &lv_textarea_class);
    auto *keyboard = requireObject(screen.root, &lv_keyboard_class);
    auto *title = requireObject(screen.root, &lv_label_class, "Geräte-PIN");
    expect(lv_obj_get_style_text_font(title, LV_PART_MAIN) == &attractap_font_montserrat_latin1_32,
           "Device PIN title preserves its original 32px size");
    lv_font_glyph_dsc_t titleGlyph{};
    expect(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(title, LV_PART_MAIN), &titleGlyph, 0xE4, 0)
               && !titleGlyph.is_placeholder,
           "Device PIN title renders its umlaut without a placeholder");
    expect(lv_keyboard_get_textarea(keyboard) == field, "Production PIN keyboard is bound to field");
    setState(field, LV_STATE_FOCUSED);
    renderer.capture("pin-empty");
    // Drive the real LVGL keyboard callback with its real key map.
    for (char digit : std::string(Fixtures::pin)) {
        uint32_t id = 0;
        while (const char *text = lv_buttonmatrix_get_button_text(keyboard, id)) {
            if (text[0] == digit && text[1] == '\0') break;
            ++id;
        }
        expect(lv_buttonmatrix_get_button_text(keyboard, id) != nullptr, "Numeric key exists");
        lv_buttonmatrix_set_selected_button(keyboard, id);
        lv_obj_send_event(keyboard, LV_EVENT_VALUE_CHANGED, nullptr);
    }
    expect(std::strcmp(lv_textarea_get_text(field), Fixtures::pin) == 0, "Real keyboard enters deterministic PIN");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::text(), "Valid PIN color");
    renderer.capture("pin-valid");
    lv_buttonmatrix_set_selected_button(keyboard, 0);
    lv_buttonmatrix_set_button_ctrl(keyboard, 1, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_set_button_ctrl(keyboard, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    setState(keyboard, LV_STATE_PRESSED);
    renderer.capture("pin-key-states");
    setState(keyboard, LV_STATE_DEFAULT);
    lv_buttonmatrix_clear_button_ctrl(keyboard, 1, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_clear_button_ctrl(keyboard, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    unsigned confirmed = 0;
    std::string confirmedPin;
    pin.setOnConfirmCallback([&](const std::string &value) {
        confirmedPin = value;
        ++confirmed;
        return false;
    });
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    expect(confirmedPin == Fixtures::pin, "Production confirm callback receives PIN");
    expect(confirmed == 1 && std::strlen(lv_textarea_get_text(field)) == 0, "PIN confirm clears field");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::danger(), "Rejected PIN color");
    renderer.capture("pin-rejected");
    lv_textarea_set_text(field, "123");
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    expect(confirmed == 1, "Short PIN cannot confirm");
    bool canceled = false;
    pin.setOnCancelCallback([&] { canceled = true; });
    lv_obj_send_event(keyboard, LV_EVENT_CANCEL, nullptr);
    expect(canceled && std::strlen(lv_textarea_get_text(field)) == 0, "PIN cancel callback clears field");
}

void testPowerOffLocales(Renderer &renderer)
{
    auto *root = lv_obj_create(nullptr);
    ScreenGuard guard(root);
    unsigned confirmed = 0;
    auto *button = PowerOffButton::create(root, [&] { ++confirmed; });
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    expect(PowerOffButton::isConfirmVisible(), "Production power-off dialog opens");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "Power off");
    renderer.capture("power-off-english");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    requireObject(lv_layer_top(), &lv_label_class, "Ausschalten");
    renderer.capture("power-off-german");
    auto *cancel = lv_obj_get_parent(requireObject(lv_layer_top(), &lv_label_class, "Abbrechen"));
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(!PowerOffButton::isConfirmVisible() && confirmed == 0, "Cancel does not power off");
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    auto *confirm = lv_obj_get_parent(requireObject(lv_layer_top(), &lv_label_class, "Ausschalten"));
    lv_obj_send_event(confirm, LV_EVENT_CLICKED, nullptr);
    expect(!PowerOffButton::isConfirmVisible() && confirmed == 1, "Production confirm callback fires once");
}

void testFormAndProjectLocaleRefresh(Renderer &renderer)
{
    ResourceDetailsScreen details;
    API::ResourceBrief resource{};
    resource.id = 1; resource.isHealthy = true;
    std::strcpy(resource.name, "Maintenance");
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Alex", true, true, true, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    const auto click = [](lv_obj_t *root, const char *caption) {
        lv_obj_send_event(lv_obj_get_parent(requireObject(root, &lv_label_class, caption)), LV_EVENT_CLICKED, nullptr);
    };
    API::ProjectsOfUserResponse projects{};
    projects.page = 2; projects.limit = 10; projects.total = 50; projects.count = 1;
    projects.items[0] = {42, "Maintenance %s"};
    details.setProjects(projects);
    click(guard.root, "Projekt wählen");
    requireObject(lv_layer_top(), &lv_label_class, "Seite 2 von 5");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(lv_layer_top(), &lv_label_class, "Page 2 of 5");
    requireObject(lv_layer_top(), &lv_label_class, "Maintenance %s");
    renderer.capture("projects-english-page-two");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    FirmwareI18n::refreshTree(guard.root, "de");
    requireObject(lv_layer_top(), &lv_label_class, "Seite 2 von 5");
    renderer.capture("projects-german-page-two");
    click(lv_layer_top(), "Maintenance %s");
    details.setSelectedProject(42, "Maintenance %s");
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(guard.root, &lv_label_class, "Project: Maintenance %s");
    API::ResourceUsageFormRequest request{};
    request.resourceId = 1; request.action = API::ResourceUsageFormActionType::START;
    request.resourceName = "Maintenance"; request.formCount = 1;
    request.forms[0] = {1, "Notes %s", 1};
    details.showFormsModal(request);
    API::ResourceUsageFormFieldsPage page{};
    page.formId = 1; page.fieldCount = 1;
    page.fields[0].id = 5; page.fields[0].name = "Maintenance";
    page.fields[0].type = API::ResourceUsageFormFieldType::TEXT;
    page.fields[0].isRequired = true;
    page.fields[0].options.text.hasPlaceholder = true;
    page.fields[0].options.text.placeholder = "Maintenance";
    details.renderFormField(page, false, true, 2, 3);
    click(lv_layer_top(), "Absenden");
    requireObject(lv_layer_top(), &lv_label_class, "Pflichtfeld");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "Required field");
    requireObject(lv_layer_top(), &lv_label_class, "Please complete before starting\nMaintenance - Notes %s");
    renderer.capture("form-english-validation");
    API::ResourceUsageFormPageResult result{};
    result.formId = 1; result.errorCount = 1;
    result.errors[0].fieldId = 5; result.errors[0].code = "INVALID_NUMBER";
    result.errors[0].message = "Raw diagnostic %s";
    details.showFormPageErrors(result);
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "Please enter a valid number");
    renderer.capture("form-server-error-english");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    requireObject(lv_layer_top(), &lv_label_class, "Bitte eine gültige Zahl eingeben");
    renderer.capture("form-server-error-german");
    result.errors[0].code = "UNKNOWN_FIELD";
    details.showFormPageErrors(result);
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    auto *unknownFieldError = requireObject(lv_layer_top(), &lv_label_class, "Eingabe ungültig.");
    renderer.capture("form-unknown-field-german");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    expect(requireObject(lv_layer_top(), &lv_label_class, "Invalid input.") == unknownFieldError,
           "Known form error binding survives language refresh");
    renderer.capture("form-unknown-field-english");
    for (const auto *code : {"FUTURE_ERROR", ""}) {
        result.errors[0].code = code;
        details.showFormPageErrors(result);
        for (const auto *locale : {"de", "en"}) {
            FirmwareI18n::refreshTree(lv_layer_top(), locale);
            requireObject(lv_layer_top(), &lv_label_class, "Invalid input.");
        }
    }
    result.errors[0].fieldId = 999; // Not on the displayed page.
    for (const auto *code : {"FUTURE_ERROR", ""}) {
        result.errors[0].code = code;
        details.showFormPageErrors(result);
        for (const auto *locale : {"de", "en"}) {
            FirmwareI18n::refreshTree(lv_layer_top(), locale);
            requireObject(lv_layer_top(), &lv_label_class, "Invalid input.");
            expect(findObject(lv_layer_top(), &lv_label_class, "Raw diagnostic %s") == nullptr, "Unmatched errors do not leak diagnostics");
        }
    }
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    renderer.capture("form-unmatched-error-english-fallback");
    click(lv_layer_top(), "Maintenance");
    auto *keyboard = requireObject(lv_layer_top(), &lv_keyboard_class);
    auto *field = lv_keyboard_get_textarea(keyboard);
    expect(field != nullptr, "Production editor connects its textarea");
    expect(std::string(lv_textarea_get_placeholder_text(field)) == "Maintenance", "Server placeholder has literal ownership");
    lv_textarea_set_text(field, "value %s\nMaintenance");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    expect(std::string(lv_textarea_get_text(field)) == "value %s\nMaintenance", "Editor value survives locale change");
    renderer.capture("form-german-editor");
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "value %s\nMaintenance");
    renderer.capture("form-english-entered-preview");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    requireObject(lv_layer_top(), &lv_label_class, "value %s\nMaintenance");
    renderer.capture("form-german-entered-preview");
    details.hideFormsModal();
}

void testFirmwareUpdateLocales(Renderer &renderer)
{
    FirmwareUpdateScreen screen;
    screen.setAvailableVersion("2.0.0");
    screen.setProgress(67);
    screen.init();
    ScreenGuard guard(screen.getScreen(), &screen);
    auto *title = requireObject(guard.root, &lv_label_class, "Softwareaktualisierung");
    auto *version = requireObject(guard.root, &lv_label_class, "test -> 2.0.0");
    FirmwareI18n::refreshTree(guard.root, "en");
    expect(std::string(lv_label_get_text(title)) == "Software update",
           "Production firmware update title translates to English");
    expect(std::string(lv_label_get_text(version)) == "test -> 2.0.0",
           "Firmware version supplied by the updater remains unchanged");
    FirmwareI18n::refreshTree(guard.root, "de");
    expect(std::string(lv_label_get_text(version)) == "test -> 2.0.0",
           "Version data is preserved across locale refresh");
    FirmwareI18n::refreshTree(guard.root, "en");
    renderer.capture("firmware-update-english");
    FirmwareI18n::refreshTree(guard.root, "de");
    expect(std::string(lv_label_get_text(title)) == "Softwareaktualisierung",
           "Production firmware update title refreshes to German");
    renderer.capture("firmware-update-german");
}

template void testCard<EnrollmentScreen>(Renderer &, const std::string &, const char *, const char *);
template void testCard<ResetScreen>(Renderer &, const std::string &, const char *, const char *);
