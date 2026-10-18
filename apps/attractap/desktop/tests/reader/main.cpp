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
    workflow.testListAndAuthentication();
    workflow.testSessionStart();
    workflow.testUsageStats();
    workflow.testFormsAndLogout();
    workflow.testSupervisionAndCorrelation();
    workflow.testIdentityAndPendingAuthentication();
    workflow.testLocalization();
    workflow.testSessionSummary();
    workflow.testWallClock();
    if (timeouts) workflow.testTimeouts();
    std::filesystem::remove_all(workflow.storage);
    std::cout << "PASS ATT-880 production application journeys\n";
}
