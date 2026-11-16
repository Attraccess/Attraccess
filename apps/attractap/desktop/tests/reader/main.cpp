#include "workflow.hpp"

namespace
{
// The journeys in the order they build on each other. testWallClock starts from an unknown time, so it only runs
// when the reader does not know the time yet.
void runJourney(ReaderWorkflow &workflow, bool timeKnown)
{
    // With the clock, the reader also carries a name as long as pairing allows (64 characters): every capture's
    // layout check then sees it end with dots before the clock. The localization journey renames the reader.
    const auto longReaderName = [&] {
        if (timeKnown) Display::setDeviceName("Werkstatt Nord, Lasercutter-Arbeitsplatz am Fenster in Halle 3EG");
    };
    workflow.testListAndAuthentication();
    if (timeKnown) WallClock::onServerTime(static_cast<int64_t>(time(nullptr)) * 1000, 120);
    longReaderName();
    workflow.testSessionStart();
    workflow.testUsageStats();
    workflow.testProjectSearch();
    workflow.testFormsAndLogout();
    workflow.testSupervisionAndCorrelation();
    workflow.testMassIntroduction();
    workflow.testCardRelay();
    workflow.testIdentityAndPendingAuthentication();
    workflow.testLocalization();
    longReaderName();
    workflow.testSessionSummary();
    workflow.testScreenOwnedUi();
    workflow.testButtonErrors();
    workflow.testFormErrors();
    workflow.testTransientRouting();
    workflow.testParallelSessions();
    if (!timeKnown) workflow.testWallClock();
}
}

int main(int argc, char **argv)
{
    const bool timeouts = argc > 1 && std::string(argv[1]) == "--timeouts";
    if (argc > 1 && std::string(argv[1]) == "--ui") {
        ReaderWorkflow workflow("");
        workflow.testUiPlugins();
        workflow.testFooterClockAndLockscreenStatus();
        std::filesystem::remove_all(workflow.storage);
        std::cout << "PASS ATT-1187 plugin UI journeys\n";
        return 0;
    }
    if (argc > 1 && std::string(argv[1]) == "--with-clock") {
        // The same journeys on a reader that knows the time: the footer clock is on every screen and every
        // capture checks that it collides with no hint line, keyboard or button.
        ReaderWorkflow workflow("");
        runJourney(workflow, true);
        std::filesystem::remove_all(workflow.storage);
        std::cout << "PASS ATT-1225 production application journeys with the footer clock\n";
        return 0;
    }
    const bool ota = argc > 1 && std::string(argv[1]).find("--ota-") == 0;
    ReaderWorkflow workflow(argc > 1 && !timeouts && !ota ? argv[1] : "");
    if (ota) {
        workflow.testFirmwareUpdate(std::string(argv[1]) == "--ota-reset");
        std::filesystem::remove_all(workflow.storage);
        return 0;
    }
    if (timeouts) {
        // The expiry windows set up what they need; the journey runs in the main suite.
        workflow.boot();
        workflow.testTimeouts();
        std::filesystem::remove_all(workflow.storage);
        std::cout << "PASS reader timeouts\n";
        return 0;
    }
    runJourney(workflow, false);
    std::filesystem::remove_all(workflow.storage);
    std::cout << "PASS ATT-880 production application journeys\n";
}
