#include "workflow.hpp"

int main(int argc, char **argv)
{
    const bool timeouts = argc > 1 && std::string(argv[1]) == "--timeouts";
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
    workflow.testListAndAuthentication();
    workflow.testSessionStart();
    workflow.testUsageStats();
    workflow.testProjectSearch();
    workflow.testFormsAndLogout();
    workflow.testSupervisionAndCorrelation();
    workflow.testMassIntroduction();
    workflow.testIdentityAndPendingAuthentication();
    workflow.testLocalization();
    workflow.testSessionSummary();
    workflow.testScreenOwnedUi();
    workflow.testButtonErrors();
    workflow.testFormErrors();
    workflow.testTransientRouting();
    workflow.testWallClock();
    std::filesystem::remove_all(workflow.storage);
    std::cout << "PASS ATT-880 production application journeys\n";
}
