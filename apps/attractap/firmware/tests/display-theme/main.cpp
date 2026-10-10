#include "render_harness.hpp"

int main(int argc, char **argv)
{
    std::filesystem::path output;
    if (argc == 2 && std::string(argv[1]) == "--help") {
        std::cout << "Usage: display-theme-host [--output DIR]\nWrites optional 480x480, top-down, packed RGBA8 .rgba files.\n";
        return 0;
    }
    if (argc == 3 && std::string(argv[1]) == "--output") output = argv[2];
    else if (argc != 1) {
        std::cerr << "Usage: display-theme-host [--output DIR]\n";
        return 2;
    }
    try {
        Renderer renderer(output);
        unsigned passed = 0, failed = 0;
        const auto test = [&](const char *name, auto run) {
            Fixtures::activeLanguage = "de";
            Fixtures::nowMs = 1000;
            Fixtures::network = {};
            Fixtures::websocket = {};
            Fixtures::api = {};
            Fixtures::resetDemoCards();
            const auto errorsBefore = lvglErrors;
            try {
                run();
                expect(lvglErrors == errorsBefore, "No LVGL error logs");
                ++passed;
                std::cout << "PASS " << name << '\n';
            } catch (const std::exception &error) {
                ++failed;
                std::cerr << "FAIL " << name << ": " << error.what() << '\n';
            }
        };
        test("render/latin1-all-sizes", [&] { testLatin1Fonts(renderer); });
        test("theme/surfaces-and-font", [&] { testSurfaces(renderer); });
        test("theme/automatic-button-states", [&] { testButtons(renderer, false); });
        test("theme/helper-button-states", [&] { testButtons(renderer, true); });
        test("theme/fields-and-keyboard-states", [&] { testInputs(renderer); });
        test("i18n/explicit-bindings-and-data-ownership", [&] {
            using FirmwareI18n::Message;
            using FirmwareI18n::Text;
            expect(Language::supported(" DE_at ") == "de", "Legacy regional locale normalizes");
            for (const auto *german : {"de-Latn-DE", "de-DE-u-co-phonebk", "de-CH-1901", "de-Latn-CH-1996-u-ca-gregory", "de-DE-x-reader", "de-a-foo-b-bar", "de-DE-extra", "de-1234"})
                expect(Language::supported(german) == "de", "Complete German locales normalize");
            for (const auto *invalid : {"de-", "de-!!!", "de--DE", "de_DE_extraextra", "de-Latn-DE-!", "de-DE-Latn", "de-abc", "de-u", "de-u-x-private", "de-x", "de-1901-1901", "de-u-co-phonebk-u-ca-gregory", "", "fr-CA"})
                expect(Language::supported(invalid) == "en", "Invalid or unsupported locales fall back to English");
            for (const auto *german : {"de-u-foo-ca-gregory-kn", "de-u-1a", "de-u-kn", "de-t-en", "de-t-en-US-h0-hybrid", "de-t-h0-hybrid", "de-t-zh-Hant-TW-m0-ungegn-u-ca-gregory-x-reader", "de-t-en-US-1901", "de-u-ca-gregory-ca-buddhist", "de-t-h0-abc-h0-def", "de-x-u-ca-ca-12"})
                expect(Language::supported(german) == "de", std::string("Valid locale extension: ") + german);
            for (const auto *invalid : {"de-u-12", "de-u-a1", "de-u-foo-12", "de-u-ca-gregory-12", "de-t-12", "de-t-h0", "de-t-en-h0", "de-t-en-12", "de-t-abcd", "de-t-en-US-ca-gregory", "de-t-en-US-1901-1901", "de-t-h0-abc-12", "de-u-ca-ca-12", "de-u-kn-kn-a1"})
                expect(Language::supported(invalid) == "en", std::string("Malformed locale extension: ") + invalid);
            // Same ASCII-only whitespace contract as the shared TypeScript normalizer.
            for (const auto padding : std::string(" \t\r\n\v\f")) {
                expect(Language::supported(std::string(1, padding) + "DE_at" + padding) == "de", "ASCII locale padding normalizes");
                expect(Language::supported("de" + std::string(1, padding) + "-AT") == "en", "Internal whitespace is invalid");
            }
            for (const auto *padding : {u8"\u00a0", u8"\u1680", u8"\u2000", u8"\u2001", u8"\u2002", u8"\u2003", u8"\u2004", u8"\u2005", u8"\u2006", u8"\u2007", u8"\u2008", u8"\u2009", u8"\u200a", u8"\u2028", u8"\u2029", u8"\u202f", u8"\u205f", u8"\u3000", u8"\ufeff"}) {
                const auto whitespace = std::string(reinterpret_cast<const char *>(padding));
                expect(Language::supported(whitespace + "de" + whitespace) == "en", "Unicode locale padding is rejected");
            }
            Language::Session session;
            session.setApi(true, "en");
            session.setUser(true, "de-AT");
            session.setDefault("de");
            expect(session.active() == "de", "Active user survives default update");
            session.setUser(true, "");
            expect(session.active() == "en", "Authenticated user with missing locale uses English");
            session.setApi(false, "");
            expect(session.active() == "de", "API loss reveals latest retained default");
            expect(std::string(Language::text("English fallback", "", "de")) == "English fallback", "Missing German translation uses English");
            expect(std::string(FirmwareI18n::messageText(static_cast<Message>(9999), "de")) == "Something went wrong. Please try again.", "Missing identifier has safe English fallback");
            expect(FirmwareI18n::readerError("unknown diagnostic").render("de") == "Something went wrong. Please try again.", "Unknown reader errors use English fallback");
            auto *root = lv_obj_create(lv_screen_active());
            auto *caption = lv_label_create(root);
            FirmwareI18n::setLabel(caption, Message::Loading);
            FirmwareI18n::setLabel(caption, Text::format(Message::Pagination, {Text::literal("2"), Text::literal("5")}));
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_label_get_text(caption)) == "Page 2 of 5", "Pagination replaces loading binding");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_label_get_text(caption)) == "Seite 2 von 5", "Pagination retains current page on reverse refresh");
            const std::string name = "Maintenance %s\nSeite 2 von 5 {0}";
            auto *project = lv_label_create(root);
            FirmwareI18n::setLabel(project, Text::format(Message::ProjectName, {Text::literal(name)}));
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_label_get_text(project)) == "Project: " + name, "Data arguments preserve percent signs, newlines and catalog-like text");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_label_get_text(project)) == "Projekt: " + name, "Reverse refresh preserves complete supplied names");
            FirmwareI18n::setDynamicLabel(project, "Maintenance");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_label_get_text(project)) == "Maintenance", "Literal replacement unregisters old message");
            auto *field = lv_textarea_create(root);
            FirmwareI18n::setPlaceholder(field, Message::AtLeast4Digits);
            lv_textarea_set_text(field, "12%\n34");
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_textarea_get_placeholder_text(field)) == "At least 4 digits", "Registered placeholder translates");
            FirmwareI18n::setDynamicPlaceholder(field, "Maintenance");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_textarea_get_placeholder_text(field)) == "Maintenance", "Server hint stays literal");
            expect(std::string(lv_textarea_get_text(field)) == "12%\n34", "Entered text survives refresh");
            FirmwareI18n::setDynamicPlaceholder(field, "0000");
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_textarea_get_placeholder_text(field)) == "0000", "PIN numeric placeholder stays literal");
            auto *dropdown = lv_dropdown_create(root);
            FirmwareI18n::setDropdownOptions(dropdown, Message::SearchingForWiFiNetworks);
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_dropdown_get_options(dropdown)) == "Searching for Wi-Fi networks...", "Registered dropdown translates");
            FirmwareI18n::setDynamicDropdownOptions(dropdown, "Maintenance\nWartung");
            lv_dropdown_set_selected(dropdown, 1);
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_dropdown_get_options(dropdown)) == "Maintenance\nWartung" && lv_dropdown_get_selected(dropdown) == 1, "Network options and selection stay literal");
            std::vector<lv_obj_t *> many;
            for (unsigned i = 0; i < 300; ++i) { auto *label = lv_label_create(root); FirmwareI18n::setLabel(label, Message::Settings); many.push_back(label); }
            FirmwareI18n::refreshTree(root, "en");
            for (auto *label : many) expect(std::string(lv_label_get_text(label)) == "Settings", "Every label refreshes beyond former registration limit");
            lv_obj_delete(root);
            expect(!FirmwareI18n::bindings.count(caption) && !FirmwareI18n::bindings.count(field), "Deletion releases registration and formatting arguments");
        });
        test("demo/production-settings-and-role-picker", [&] {
            DemoSettingsScreen demo;
            demo.init();
            ScreenGuard guard(demo.getScreen(), &demo);
            settle();
            requireObject(guard.root, &lv_label_class, "Maintenance");
            requireObject(guard.root, &lv_label_class, "Kein Zugang ");
            auto *cardholder = requireObject(guard.root, &lv_label_class, "Alex Müller");
            lv_font_glyph_dsc_t glyph{};
            expect(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(cardholder, LV_PART_MAIN), &glyph, 0x00FC, 0) &&
                       !glyph.is_placeholder,
                   "Production demo cardholder name renders its supplied German glyph");
            lv_area_t headingBounds, actionBounds;
            lv_obj_get_coords(requireObject(guard.root, &lv_label_class, "Demo Einstellungen"), &headingBounds);
            lv_obj_get_coords(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Karte hinzufügen")), &actionBounds);
            expect(headingBounds.y2 < actionBounds.y1 || headingBounds.x2 < actionBounds.x1,
                   "Translated demo heading does not overlap its action controls");
            renderer.capture("demo-settings-german");
            FirmwareI18n::refreshTree(guard.root, "en");
            requireObject(guard.root, &lv_label_class, "Maintenance");
            requireObject(guard.root, &lv_label_class, "No access ");
            requireObject(guard.root, &lv_label_class, "Alex Müller");
            renderer.capture("demo-settings-english");
            unsigned scansStarted = 0, scansCancelled = 0;
            demo.setStartScanCallback([&] { ++scansStarted; });
            demo.setCancelScanCallback([&] { ++scansCancelled; });
            for (const char *language : {"en", "de"}) {
                Fixtures::activeLanguage = language;
                FirmwareI18n::refreshTree(guard.root, language);
                const bool english = std::string(language) == "en";
                auto *add = lv_obj_get_parent(requireObject(guard.root, &lv_label_class,
                                                          english ? "Add card" : "Karte hinzufügen"));
                const unsigned started = scansStarted, cancelled = scansCancelled;
                lv_obj_send_event(add, LV_EVENT_CLICKED, nullptr);
                expect(demo.isWaitingForCard() && scansStarted == started + 1,
                       "Add card starts the production NFC scan callback");
                // Refresh the open overlay in both directions before cancelling.
                FirmwareI18n::refreshTree(guard.root, english ? "de" : "en");
                FirmwareI18n::refreshTree(guard.root, language);
                auto *prompt = requireObject(guard.root, &lv_label_class,
                                            english ? "Hold card to reader..." : "Karte ans Lesegerät halten...");
                renderer.capture(english ? "demo-scan-cancel-english" : "demo-scan-cancel-german");
                auto *cancel = lv_obj_get_parent(requireObject(lv_obj_get_parent(prompt), &lv_label_class,
                                                             english ? "Cancel" : "Abbrechen"));
                lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
                expect(!demo.isWaitingForCard() && scansCancelled == cancelled + 1,
                       "Cancel closes the scan and invokes the production NFC cancellation callback once");
                expect(findObject(guard.root, &lv_label_class,
                                  english ? "Hold card to reader..." : "Karte ans Lesegerät halten...") == nullptr,
                       "Cancelled scan overlay is removed and Add card is reachable again");
            }
            // Production role-picker callback receives a supplied UID.
            demo.onCardScanned("11223344");
            FirmwareI18n::refreshTree(guard.root, "en");
            requireObject(guard.root, &lv_label_class, "Role for card 11223344");
            requireObject(guard.root, &lv_label_class, "Introduced");
            renderer.capture("demo-role-picker-english");
            FirmwareI18n::refreshTree(guard.root, "de");
            requireObject(guard.root, &lv_label_class, "Rolle für Karte 11223344");
            requireObject(guard.root, &lv_label_class, "Eingewiesen");
            renderer.capture("demo-role-picker-german");
        });
        test("demo/direct-deletion-after-language-refresh", [&] {
            for (const char *language : {"en", "de"}) {
                Fixtures::resetDemoCards();
                Fixtures::activeLanguage = language;
                DemoSettingsScreen demo;
                demo.init();
                ScreenGuard guard(demo.getScreen(), &demo);
                settle();
                const bool english = std::string(language) == "en";
                unsigned deleted = 0;
                for (const char *name : {"Alex Müller", "Robin", "Maintenance"}) {
                    // Refresh existing buttons both ways before clicking. After each
                    // removal, the rebuilt list must target the new card indices.
                    FirmwareI18n::refreshTree(guard.root, english ? "de" : "en");
                    FirmwareI18n::refreshTree(guard.root, language);
                    auto *label = requireObject(guard.root, &lv_label_class, name);
                    auto *row = lv_obj_get_parent(lv_obj_get_parent(label));
                    auto *button = lv_obj_get_parent(requireObject(row, &lv_label_class,
                                                                 english ? "Delete" : "Löschen"));
                    const uint8_t index = deleted < 2 ? 1 : 0;
                    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
                    settle();
                    ++deleted;
                    expect(Fixtures::deletedDemoCardIndices.size() == deleted &&
                               Fixtures::deletedDemoCardIndices.back() == index,
                           "One click deletes the intended card directly, without confirmation");
                    expect(DemoStore::getCardCount() == 3 - deleted &&
                               findObject(guard.root, &lv_label_class, name) == nullptr,
                           "Deletion rebuilds the production list without the removed card");
                    if (deleted < 3)
                        requireObject(guard.root, &lv_label_class, "Maintenance");
                }
                requireObject(guard.root, &lv_label_class,
                              english ? "No cards registered yet." : "Noch keine Karten registriert.");
            }
        });
        test("demo/fixture-locales", [&] { testDemoFixtureLocales(renderer); });
        test("demo/production-resource-list-locales", [&] { testDemoResourceListLocales(renderer); });
        test("i18n/catalog-bilingual-rendering", [&] { testCatalogLocales(renderer); });
        test("render/production-logo-bytes", [&] { testLogos(renderer); });
        test("screen/att-880-authenticated-list", [&] { testAuthenticatedList(renderer); });
        test("screen/restored-backgrounds", [&] { testBackgroundScreens(renderer); });
        test("screen/boot", [&] { testBoot(renderer); });
        test("screen/init", [&] { testInit(renderer); });
        test("screen/enrollment", [&] { testCard<EnrollmentScreen>(renderer, "enrollment", "Karte wird beschrieben...\nbitte nicht bewegen", "Karte registriert!"); });
        test("i18n/enrollment-locale-transition", [&] {
            EnrollmentScreen card;
            card.init();
            ScreenGuard screen(card.getScreen(), &card);
            requireObject(screen.root, &lv_label_class, "Karte an den Leser halten");
            Fixtures::activeLanguage = "en";
            card.loop();
            requireObject(screen.root, &lv_label_class, "Hold card to reader");
            requireObject(screen.root, &lv_label_class, "Register new card");
            renderer.capture("enrollment-english-waiting");
            card.setStatus(EnrollmentScreen::STATUS_WRITING);
            requireObject(screen.root, &lv_label_class, "Writing card...\nplease keep it still");
            renderer.capture("enrollment-english-writing");
            Fixtures::activeLanguage = "de";
            card.loop();
            requireObject(screen.root, &lv_label_class, "Karte wird beschrieben...\nbitte nicht bewegen");
            renderer.capture("enrollment-german-writing");
        });
        test("screen/reset", [&] { testCard<ResetScreen>(renderer, "reset", "Karte zurücksetzen...\nbitte nicht bewegen", "Karte zurückgesetzt!"); });
        test("screen/supervision", [&] { testSupervision(renderer); });
        test("screen/introducer-details", [&] { testIntroducerDetails(renderer); });
        test("screen/usage-stats-expiry", [&] { testUsageStatsExpiry(renderer); });
        test("screen/pin-and-real-keyboard-events", [&] { testPin(renderer); });
        test("screen/power-off-bilingual", [&] { testPowerOffLocales(renderer); });
        test("screen/forms-and-projects-locale-refresh", [&] { testFormAndProjectLocaleRefresh(renderer); });
        test("screen/firmware-update-bilingual", [&] { testFirmwareUpdateLocales(renderer); });
        std::cout << "RESULT " << passed << " passed, " << failed << " failed; " << checks << " checks; "
                  << renderer.captures << " real LVGL frames\n";
        std::cout << "COVERAGE: production theme, boot/init/enrollment/reset/supervision/PIN, lockscreen/resource list/no resources and image assets.\n"
                     "NOT COVERED: devices, RTOS, transport, full router/overlays, remaining screens or pixel-golden approval.\n";
        if (!output.empty()) std::cout << "OUTPUT " << std::filesystem::absolute(output) << '\n';
        return failed || lvglErrors ? 1 : 0;
    } catch (const std::exception &error) {
        std::cerr << "Harness error: " << error.what() << '\n';
        return 2;
    }
}
