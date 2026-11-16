#include "fixtures.hpp"

#include "settings/settings.hpp"

// Every screen and state that is not covered by the layouts test, in German and English, with
// long names: each one passes the layout check, and with a screenshot directory each one is
// written to <directory>/gallery/<language>/<name>.png (the 480 x 480 panel only).
namespace
{
    constexpr char longName[] = "Maximiliane-Charlotte von Hohenzollern-Sigmaringen";
    constexpr char longResource[] = "Lasercutter Großformat mit extrem langem Maschinennamen und Zusatz";

    API::ResourceUsageFormRequest formRequest()
    {
        API::ResourceUsageFormRequest request{};
        request.resourceId = 1;
        request.resourceName = longResource;
        request.action = API::ResourceUsageFormActionType::END;
        request.formCount = 1;
        request.forms[0].id = 1;
        request.forms[0].name = "Sicherheitsprüfung nach Gebrauch";
        request.forms[0].fieldCount = 3;
        return request;
    }

    void pressButtonOf(lv_obj_t *root, const char *caption)
    {
        auto *label = findLabel(root, caption);
        assert(label);
        lv_obj_send_event(lv_obj_get_parent(label), LV_EVENT_CLICKED, nullptr);
    }
}

void testGallery(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    for (const char *language : {"de", "en"})
    {
        State::setDefaultLanguage(language);
        const std::filesystem::path directory = screenshots.empty() ? std::filesystem::path() : screenshots / "gallery" / language;
        const bool german = std::string(language) == "de";
        const auto shot = [&](const std::string &name) {
            Display::loop();
            // Let the theme's short state transitions (a button turning disabled) finish.
            for (int i = 0; i < 8; ++i)
            {
                lv_timer_handler();
                SDL_Delay(25);
            }
            expectCleanLayout(name.c_str());
            lv_refr_now(nullptr);
            assert(display.pollEvents());
            screenshotScreen(directory, name + ".png");
        };
        const auto show = [&](IScreen *screen, const std::string &name) {
            Display::transitionToScreen(screen);
            shot(name);
        };

        // Start-up and pairing.
        show(&Display::bootScreen, "boot");
        show(&Display::initScreen, "init");
        show(&Display::setPinScreen, "set-pin");
        State::clearEnrollment();
        State::setEnrollmentKind(false);
        State::setEnrollmentRound("K7P-3Q", "https://access.example", nullptr, 30000, 600000);
        show(&Display::pendingApprovalScreen, "pending-approval");
        State::setEnrollmentRound("B5C-6D", "", nullptr, 30000, 540000);
        shot("pending-approval-code-only");
        State::setEnrollmentDisconnected();
        shot("pending-approval-waiting");
        State::setPairingRemoved();
        shot("pending-approval-removed");
        State::clearEnrollment();

        // Connection settings: each tab, and the PIN lock in front of them.
        auto &settings = Display::connectionConfigurationScreen;
        settings.enablePinLock();
        show(&settings, "settings-pin-lock");
        settings.disablePinLock();
        auto *tabs = findWidget(settings.getScreen(), &lv_tabview_class);
        assert(tabs);
        for (uint32_t tab = 0; tab < 3; ++tab)
        {
            lv_tabview_set_active(tabs, tab, LV_ANIM_OFF);
            shot("settings-tab-" + std::to_string(tab + 1));
        }
        settings.enablePinLock();

        // Firmware update, before the version is known, while it loads and when it is done.
        auto &update = Display::firmwareUpdateScreen;
        update.setAvailableVersion("");
        update.setProgress(0);
        show(&update, "firmware-update-starting");
        update.setAvailableVersion("1.9.0-beta.12345");
        update.setProgress(42);
        shot("firmware-update-progress");
        update.setProgress(100);
        shot("firmware-update-done");

        // The goodbye after an own session, with and without a charge.
        Display::sessionSummaryScreen.setSummary(longName, 5025, "12.345,67 EUR");
        show(&Display::sessionSummaryScreen, "session-summary-billed");
        Display::transitionToScreen(&Display::initScreen);
        Display::loop();
        Display::sessionSummaryScreen.setSummary("Alex", 1440, "");
        show(&Display::sessionSummaryScreen, "session-summary-unbilled");

        // Supervision, in every state.
        {
            SupervisionScreen::View view;
            view.deadlineMs = millis() + 30000;
            view.requesterName = longName;
            view.supervisorHint = FirmwareI18n::Message::TapSupervisorCardOrApproveInTheAppWebInterface;
            const std::vector<std::pair<SupervisionScreen::Status, const char *>> states = {
                {SupervisionScreen::STATUS_WAITING, "waiting"},
                {SupervisionScreen::STATUS_VERIFYING, "verifying"},
                {SupervisionScreen::STATUS_SUCCESS, "success"},
                {SupervisionScreen::STATUS_ERROR, "error"}};
            for (const auto &state : states)
            {
                view.status = state.first;
                view.statusMessage = state.first == SupervisionScreen::STATUS_ERROR ? FirmwareI18n::Text(FirmwareI18n::Message::CardIsNotAuthorizedAsASupervisor)
                                                                                    : FirmwareI18n::Text();
                Display::supervisionScreen.render(view);
                show(&Display::supervisionScreen, std::string("supervision-") + state.second);
            }
        }

        // Mass introduction, in every state.
        {
            MassIntroductionScreen::View view;
            view.durationMs = 300000;
            view.deadlineMs = millis() + 200000;
            view.targetName = longResource;
            view.introducerName = longName;
            view.participantName = longName;
            view.participantCount = 12;
            const std::vector<std::tuple<MassIntroductionScreen::Status, const char *, FirmwareI18n::Text>> states = {
                {MassIntroductionScreen::STATUS_WAITING, "waiting", FirmwareI18n::Text()},
                {MassIntroductionScreen::STATUS_VERIFYING, "verifying", FirmwareI18n::Text()},
                {MassIntroductionScreen::STATUS_INTRODUCED, "introduced", FirmwareI18n::Text()},
                {MassIntroductionScreen::STATUS_ALREADY_INTRODUCED, "already-introduced", FirmwareI18n::Text()},
                {MassIntroductionScreen::STATUS_ERROR, "error", FirmwareI18n::Message::MassIntroductionNoResponse}};
            for (const auto &state : states)
            {
                view.status = std::get<0>(state);
                view.statusMessage = std::get<2>(state);
                Display::massIntroductionScreen.render(view);
                show(&Display::massIntroductionScreen, std::string("mass-introduction-") + std::get<1>(state));
            }
        }

        // Usage forms: a text field, a select, server errors on the page, the text editor, and a
        // page the server refused, in place on "Weiter" and on "Absenden".
        {
            auto &forms = Display::formsScreen;
            Display::transitionToScreen(&Display::resourceDetailsScreen);
            Display::loop();
            static API::ResourceUsageFormRequest request;
            request = formRequest();
            static API::ResourceUsageFormFieldsPage page;
            page = API::ResourceUsageFormFieldsPage{};
            page.resourceId = 1;
            page.formId = 1;
            page.fieldCount = 1;
            page.totalFieldCount = 3;
            auto &field = page.fields[0];
            field.id = 1;
            field.name = "Zustand der Absaugung und des Wabentisches nach der Benutzung";
            field.description = "Bitte prüfen, ob der Wabentisch sauber und die Absaugung frei ist.";
            field.type = API::ResourceUsageFormFieldType::TEXT;
            field.isRequired = true;
            field.hasValue = true;
            field.value = "Alles sauber";
            forms.setFormPageNextCallback([](const API::FormPageSubmission &) {});
            forms.showForm(request);
            Display::transitionToScreen(&forms);
            shot("form-loading");
            forms.renderFormField(page, false, false, 1, 3);
            shot("form-text");
            forms.showSubmitError(FirmwareI18n::Message::ActionFailedTapToRetry);
            shot("form-next-error");
            auto *preview = findLabel(forms.getScreen(), "Alles sauber");
            assert(preview);
            lv_obj_send_event(lv_obj_get_parent(preview), LV_EVENT_CLICKED, nullptr);
            shot("form-editor");
            lv_obj_send_event(findWidget(forms.getScreen(), &lv_keyboard_class), LV_EVENT_CANCEL, nullptr);
            API::ResourceUsageFormPageResult result{};
            result.formId = 1;
            result.errorCount = 1;
            result.errors[0].fieldId = 1;
            result.errors[0].code = "REQUIRED_FIELD";
            forms.showFormPageErrors(result);
            shot("form-page-errors");
            field = API::ResourceUsageFormField{};
            field.id = 2;
            field.name = "Material";
            field.type = API::ResourceUsageFormFieldType::SELECT;
            field.isRequired = true;
            field.options.select.count = 3;
            field.options.select.values[0] = "Holz";
            field.options.select.values[1] = "Acryl";
            field.options.select.values[2] = "Karton";
            forms.renderFormField(page, true, true, 3, 3);
            shot("form-select");
            forms.showSubmitError(FirmwareI18n::readerError("CARD_NOT_ACTIVE"));
            shot("form-submit-error");
            forms.setFormPageNextCallback({});
        }

        // The project picker: projects, loading, nothing found, a failed load, the search editor.
        {
            auto &picker = Display::projectSelectScreen;
            Display::transitionToScreen(&Display::resourceDetailsScreen);
            Display::loop();
            picker.resetProjectsSearch();
            picker.setResourceName(longResource);
            API::ProjectsOfUserResponse projects{};
            projects.page = 1;
            projects.limit = API::MAX_PROJECTS_PER_PAGE;
            projects.total = 12;
            projects.hasMore = true;
            projects.count = API::MAX_PROJECTS_PER_PAGE;
            const char *names[] = {"Werkstattprojekt", "Möbelbau für die Kita am Stadtpark mit sehr langem Namen", "Schilder", "Ersatzteile"};
            for (uint16_t i = 0; i < API::MAX_PROJECTS_PER_PAGE; ++i) projects.items[i] = {static_cast<uint32_t>(40 + i), names[i]};
            picker.setProjectsPageRequestCallback([](uint32_t, const std::string &) { return true; });
            picker.begin();
            show(&picker, "projects-loading");
            picker.setProjects(projects);
            picker.setSelectedProject(41);
            shot("projects");
            API::ProjectsOfUserResponse none{};
            none.page = 1;
            none.limit = API::MAX_PROJECTS_PER_PAGE;
            picker.setProjects(none);
            shot("projects-empty");
            picker.showLoadError();
            shot("projects-load-error");
            pressButtonOf(picker.getScreen(), german ? "Projekte suchen" : "Search projects");
            shot("projects-search-editor");
            lv_obj_send_event(findWidget(picker.getScreen(), &lv_keyboard_class), LV_EVENT_CANCEL, nullptr);
            picker.setProjectsPageRequestCallback({});
            picker.resetProjectsSearch();
        }

        // Top-up: empty, an amount, a missing amount and a refused request in place on "Aufladen".
        {
            auto &topUp = Display::topUpScreen;
            Display::transitionToScreen(&Display::resourceListScreen);
            Display::loop();
            topUp.reset();
            topUp.setCallbacks([](uint32_t) {}, [] {});
            show(&topUp, "top-up");
            pressButtonOf(topUp.getScreen(), german ? "Aufladen" : "Top up");
            shot("top-up-amount-missing");
            pressButtonOf(topUp.getScreen(), "2");
            pressButtonOf(topUp.getScreen(), "5");
            shot("top-up-amount");
            topUp.showError(FirmwareI18n::readerError("NO_SUMUP_TERMINALS_AVAILABLE"));
            shot("top-up-refused");
            topUp.setCallbacks({}, {});
        }

        // In place on the list row and on the details action button.
        {
            API::ResourceList resources{};
            resources.count = 2;
            std::snprintf(resources.authenticatedUsername, sizeof(resources.authenticatedUsername), "Alex");
            for (uint16_t i = 0; i < 2; ++i)
            {
                auto &item = resources.items[i];
                item.id = i + 1;
                item.isHealthy = true;
                item.accessKnown = true;
                item.hasIntroduction = true;
                std::snprintf(item.name, sizeof(item.name), "%s", i ? longResource : "Lasercutter");
            }
            auto &list = Display::resourceListScreen;
            list.setResourceList(resources);
            list.setAuthenticatedUser("Alex");
            Display::transitionToScreen(&list);
            Display::loop();
            assert(list.showActionError(1, FirmwareI18n::Message::ActionFailedTapToRetry));
            shot("button-error-list");
            list.setAuthenticatedUser("");
            auto &details = Display::resourceDetailsScreen;
            details.setResourceAndUsageDetails(resources.items[1]);
            details.setUserDetails({"Alex", true, true, false, false});
            details.setButtonClickCallback([](ResourceDetailsScreen::ButtonClickEventData) {});
            Display::transitionToScreen(&details);
            Display::loop();
            pressButtonOf(details.getScreen(), german ? "Ressource verwenden" : "Use resource");
            assert(details.showActionError(FirmwareI18n::Message::ActionFailedTapToRetry));
            shot("button-error-details");
            details.setButtonClickCallback({});
        }

        // Full-screen results and questions.
        const std::vector<std::pair<const char *, StatusScreen::Config>> statuses = {
            {"status-sign-in-failed", StatusScreen::error(FirmwareI18n::Message::SignInFailed, FirmwareI18n::readerError("CARD_NOT_FOUND"))},
            {"status-usage-started", StatusScreen::success(FirmwareI18n::Message::UsageStarted, FirmwareI18n::Text::literal(longResource) /* i18n-data: Test fixture. */)},
            {"status-usage-ended", StatusScreen::success(FirmwareI18n::Message::UsageEnded, FirmwareI18n::Text::literal("CNC") /* i18n-data: Test fixture. */)},
            {"status-action-confirmed", StatusScreen::success(FirmwareI18n::Message::ActionConfirmed, FirmwareI18n::Text::literal("Werkstatttür") /* i18n-data: Test fixture. */)},
            {"status-billing", StatusScreen::billing(FirmwareI18n::Text::literal("2,90 EUR") /* i18n-data: Test fixture. */, FirmwareI18n::Text::literal(longResource) /* i18n-data: Test fixture. */)},
            {"status-billing-long", StatusScreen::billing(FirmwareI18n::Text::literal("12.345.678.901,23 EUR") /* i18n-data: Test fixture. */, FirmwareI18n::Text::literal("CNC") /* i18n-data: Test fixture. */)},
            {"status-billing-chf", StatusScreen::billing(FirmwareI18n::Text::literal("2.90 CHF") /* i18n-data: Test fixture. */, FirmwareI18n::Text::literal("CNC") /* i18n-data: Test fixture. */)},
            {"status-unavailable", StatusScreen::warning(FirmwareI18n::Message::StatusUnavailable, FirmwareI18n::Message::SignInAgainToLoadTheCurrentResourceStatus)},
            {"status-insufficient-balance", StatusScreen::warning(FirmwareI18n::Message::InsufficientBalance, FirmwareI18n::readerError("INSUFFICIENT_BALANCE"))},
            {"status-touch-unavailable", StatusScreen::warning(FirmwareI18n::Message::TouchUnavailable, FirmwareI18n::Message::TouchPanelNotDetectedCheckHardwareAndReboot, false)},
            {"status-payment-terminal", StatusScreen::info(FirmwareI18n::Message::TopUpStarted, FirmwareI18n::Message::PleaseContinueAtThePaymentTerminal)},
            {"status-generic-error", StatusScreen::generic(FirmwareI18n::Message::PleaseTryAgain, "RESOURCE_LOCKED")},
        };
        Display::transitionToScreen(&Display::resourceListScreen);
        Display::loop();
        for (const auto &status : statuses)
        {
            Display::showStatus(status.second);
            shot(status.first);
        }
        for (const bool reboot : {true, false})
        {
            ConfirmScreen::Config config;
            config.title = reboot ? FirmwareI18n::Message::RebootDevice : FirmwareI18n::Message::PowerOffDevice;
            config.message = reboot ? FirmwareI18n::Message::TheReaderWillRestartNow : FirmwareI18n::Message::TheReaderWillPowerOffNow;
            config.confirmLabel = reboot ? FirmwareI18n::Message::Reboot : FirmwareI18n::Message::PowerOff;
            Display::showConfirm(std::move(config));
            shot(reboot ? "confirm-reboot" : "confirm-power-off");
        }
        Display::transitionToScreen(&Display::initScreen);
        Display::loop();
    }
    State::setDefaultLanguage("de");
}
