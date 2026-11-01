#include "fixtures.hpp"

// Every screen, in both languages and in its different states, with long German texts and long
// names: nothing visible may overlap anything else, touch the chrome or leave the display.
// (The reader workflow tests apply the same check to every frame they capture.)

namespace
{
    constexpr char longResource[] = "Lasercutter Großformat mit extrem langem Maschinennamen und Zusatz";
    constexpr char longUser[] = "Maximiliane-Charlotte von Hohenzollern-Sigmaringen";

    API::ResourceBrief resource(uint32_t id, const char *name, const char *description)
    {
        API::ResourceBrief brief{};
        brief.id = id;
        brief.isHealthy = true;
        brief.accessKnown = true;
        brief.hasIntroduction = true;
        std::snprintf(brief.name, sizeof(brief.name), "%s", name);
        brief.description = description;
        return brief;
    }

    API::ResourceList list(bool signedIn)
    {
        API::ResourceList resources{};
        resources.count = 6;
        resources.items[0] = resource(1, "Lasercutter", "Epilog Zing 40 W");
        resources.items[1] = resource(2, longResource, "Beschreibung mit sehr vielen Wörtern, die nicht in eine einzige Zeile passen können");
        resources.items[2] = resource(3, "CNC Fräse", "");
        resources.items[3] = resource(4, "3D-Drucker", "");
        resources.items[4] = resource(5, "Werkstatttür", "");
        resources.items[5] = resource(6, "Siebdruck", "");
        resources.items[1].hasActiveUsage = true;
        std::snprintf(resources.items[1].activeUser, sizeof(resources.items[1].activeUser), "%s", longUser);
        resources.items[2].isUnderMaintenance = true;
        resources.items[3].isHealthy = false;
        resources.items[4].type = 1;
        resources.items[5].hasIntroduction = false;
        if (signedIn) std::snprintf(resources.authenticatedUsername, sizeof(resources.authenticatedUsername), "Alex");
        return resources;
    }
}

void testScreenLayouts()
{
    for (const char *language : {"de", "en"})
    {
        State::setDefaultLanguage(language);

        // Resource list, signed out and signed in.
        for (const bool signedIn : {false, true})
        {
            Display::resourceListScreen.setResourceList(list(signedIn));
            Display::resourceListScreen.setAuthenticatedUser(signedIn ? "Alex" : "");
            Display::transitionToScreen(&Display::resourceListScreen);
            Display::loop();
            expectCleanLayout(signedIn ? "resource list (signed in)" : "resource list");
        }
        Display::resourceListScreen.setAuthenticatedUser("");

        // Lockscreen with the usage line in each state.
        Display::lockscreen.setResourceName(longResource);
        for (const auto &usage : {std::tuple<bool, const char *, bool>{false, "", false}, {true, longUser, false}, {false, "", true}})
        {
            Display::lockscreen.setUsageInfo(std::get<0>(usage), std::get<1>(usage), std::get<2>(usage));
            Display::transitionToScreen(&Display::lockscreen);
            Display::loop();
            expectCleanLayout("lockscreen");
        }

        // Resource details in every usage state.
        struct Variant
        {
            const char *name;
            std::function<void(API::ResourceBrief &)> shape;
        };
        const std::vector<Variant> variants = {
            {"available", [](API::ResourceBrief &) {}},
            {"long name", [](API::ResourceBrief &b) { std::snprintf(b.name, sizeof(b.name), "%s", longResource); b.description = "Beschreibung mit sehr vielen Wörtern, die nicht in eine einzige Zeile passen können und deshalb umbrechen müssen."; }},
            {"in use by me", [](API::ResourceBrief &b) { b.hasActiveUsage = true; b.activeUsageId = 7; std::snprintf(b.activeUser, sizeof(b.activeUser), "Alex"); b.activeStartEpoch = static_cast<uint32_t>(time(nullptr)) - 1426; }},
            {"in use by others", [](API::ResourceBrief &b) { b.hasActiveUsage = true; b.activeUsageId = 8; std::snprintf(b.activeUser, sizeof(b.activeUser), "%s", longUser); b.activeStartEpoch = static_cast<uint32_t>(time(nullptr)) - 60; b.allowTakeOver = true; }},
            {"maintenance", [](API::ResourceBrief &b) { b.isUnderMaintenance = true; }},
            {"unhealthy", [](API::ResourceBrief &b) { b.isHealthy = false; std::snprintf(b.healthReason, sizeof(b.healthReason), "Sensor liefert keine Werte mehr seit dem letzten Firmware-Update"); }},
            {"door", [](API::ResourceBrief &b) { b.type = 1; }},
            {"introduction missing", [](API::ResourceBrief &b) { b.hasIntroduction = false; b.introducers = {"Anna Beispiel", "Bernd Beispiel", longUser}; }},
        };
        for (const auto &variant : variants)
        {
            auto &details = Display::resourceDetailsScreen;
            API::ResourceBrief brief = resource(1, "Lasercutter", "Epilog Zing 40 W");
            variant.shape(brief);
            details.setResourceAndUsageDetails(brief);
            details.setUserDetails({"Alex", true, brief.hasIntroduction, false, false});
            Display::transitionToScreen(&details);
            Display::loop();
            expectCleanLayout(variant.name);
            Display::transitionToScreen(&Display::initScreen);
            Display::loop();
        }

        // Card enrollment and card reset, in each phase and with a long error.
        for (const auto status : {EnrollmentScreen::STATUS_WAITING, EnrollmentScreen::STATUS_WRITING, EnrollmentScreen::STATUS_SUCCESS, EnrollmentScreen::STATUS_ERROR})
        {
            Display::enrollmentScreen.setUserName(longUser);
            Display::enrollmentScreen.setEnrollmentTimeoutTime(millis() + 30000);
            Display::transitionToScreen(&Display::enrollmentScreen);
            Display::enrollmentScreen.setStatus(status);
            if (status == EnrollmentScreen::STATUS_ERROR) Display::enrollmentScreen.setStatusMessage(FirmwareI18n::readerError("CARD_ALREADY_ENROLLED"));
            Display::loop();
            expectCleanLayout("enrollment");
        }
        for (const auto status : {ResetScreen::STATUS_WAITING, ResetScreen::STATUS_WRITING, ResetScreen::STATUS_SUCCESS, ResetScreen::STATUS_ERROR})
        {
            Display::resetScreen.setUserName(longUser);
            Display::resetScreen.setTimeoutTime(millis() + 30000);
            Display::transitionToScreen(&Display::resetScreen);
            Display::resetScreen.setStatus(status);
            if (status == ResetScreen::STATUS_ERROR) Display::resetScreen.setStatusMessage(FirmwareI18n::readerError("CARD_NOT_FOUND"));
            Display::loop();
            expectCleanLayout("card reset");
        }

        Display::transitionToScreen(&Display::noResourcesScreen);
        Display::loop();
        expectCleanLayout("no resources");

        Display::firmwareUpdateScreen.setAvailableVersion("1.9.0-beta.12345");
        Display::firmwareUpdateScreen.setProgress(42);
        Display::transitionToScreen(&Display::firmwareUpdateScreen);
        Display::loop();
        expectCleanLayout("firmware update");

        Display::transitionToScreen(&Display::initScreen);
        Display::loop();
        expectCleanLayout("init");
    }
    State::setDefaultLanguage("de");
}
