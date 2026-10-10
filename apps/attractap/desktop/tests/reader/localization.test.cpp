#include "workflow.hpp"
void ReaderWorkflow::testLocalization()
{
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
}
